import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { generateOrderId } from '../common/utils/id.util.js';
import { PaymentMethod } from './entities/payment-method.entity.js';
import {
  PaymentTransaction,
  PaymentTransactionStatus,
  PaymentProvider,
} from './entities/payment-transaction.entity.js';
import { User, UserRole } from './entities/user.entity.js';
import { ServiceCustomer } from './entities/service-customer.entity.js';
import { ServiceWebhookService } from './service-webhook.service.js';

// 카드가 아닌 저장 수단(간편결제)의 표시명
const WALLET_LABELS: Record<string, string> = {
  naver_pay: '네이버페이',
  kakao_pay: '카카오페이',
  payco: '페이코',
  samsung_pay: '삼성페이',
};

/**
 * Stripe(MoR) 결제 서비스.
 * - 플랫폼 단일 키 사용(Connect 미사용). 모든 호출 동일 키.
 * - 결제 귀속(정산용)은 Stripe metadata.userId + PaymentTransaction.userId 로 추적.
 * - 빌링은 저장 카드 off_session 반복청구 (Subscriptions 미사용).
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private _stripe: Stripe | null = null;

  constructor(
    @InjectRepository(PaymentMethod)
    private readonly paymentRepo: Repository<PaymentMethod>,
    @InjectRepository(PaymentTransaction)
    private readonly txRepo: Repository<PaymentTransaction>,
    @InjectRepository(ServiceCustomer)
    private readonly serviceCustomerRepo: Repository<ServiceCustomer>,
    private readonly webhooks: ServiceWebhookService,
  ) {}

  private get stripe(): Stripe {
    if (!this._stripe) {
      const key = process.env.API_STRIPE_SECRET_KEY;
      if (!key) {
        throw new BadRequestException('Stripe 설정이 완료되지 않았습니다.');
      }
      this._stripe = new Stripe(key);
    }
    return this._stripe;
  }

  private normalizeCurrency(currency?: string): string {
    const c = (currency || 'krw').trim().toLowerCase();
    if (!/^[a-z]{3}$/.test(c)) {
      throw new BadRequestException('통화 코드가 유효하지 않습니다.');
    }
    return c;
  }

  // ── Stripe Customer 확보 (사용자당 1개 재사용) ──────────────────────────────
  private async ensureCustomer(user: User): Promise<string> {
    if (user.stripeCustomerId) return user.stripeCustomerId;

    // 레거시: stripeCustomerId 도입 전 저장 카드에만 customerId가 남아있는 경우 백필
    const existing = await this.paymentRepo.findOne({
      where: { userId: user.id, provider: PaymentProvider.STRIPE },
      order: { createdAt: 'DESC' },
    });
    let customerId = existing?.customerId;

    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: user.email || undefined,
        name: user.name || undefined,
        phone: user.phone || undefined,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
    }

    user.stripeCustomerId = customerId;
    await user.save();
    return customerId;
  }

  // 프론트 confirmSetup 직후 호출 → SetupIntent로 즉시 카드 저장(웹훅은 백업).
  async registerSavedCard(user: User, setupIntentId: string) {
    const si = await this.stripe.setupIntents.retrieve(setupIntentId);
    if (si.metadata?.userId !== user.id) {
      throw new BadRequestException('잘못된 SetupIntent입니다.');
    }
    if (si.status !== 'succeeded') {
      throw new BadRequestException('카드 인증이 완료되지 않았습니다.');
    }
    const saved = await this.persistSavedCard(si);
    if (saved) return saved;
    // 이미 저장된 경우(웹훅 선처리 등) 기존 레코드 반환
    const pmId =
      typeof si.payment_method === 'string'
        ? si.payment_method
        : si.payment_method?.id;
    return this.paymentRepo.findOneBy({
      userId: user.id,
      provider: PaymentProvider.STRIPE,
      billingKey: pmId || undefined,
    });
  }

  // ── 카드 저장(빌링용): SetupIntent 발급 → 프론트에서 확정 ────────────────────
  async createSetupIntent(user: User) {
    const customerId = await this.ensureCustomer(user);
    const setupIntent = await this.stripe.setupIntents.create({
      customer: customerId,
      usage: 'off_session',
      // 결제수단은 대시보드 설정을 따름(카드/네이버페이 등). 네이버페이도 off_session 반복청구 지원.
      // 리다이렉트 수단이 포함되므로 프론트 confirmSetup에는 return_url이 필수.
      metadata: { userId: user.id },
    });
    return {
      clientSecret: setupIntent.client_secret,
      customerId,
    };
  }

  // ── 일회성 결제(미저장 카드): PaymentIntent 발급 → 프론트에서 확정 ───────────
  async createPaymentIntent(
    user: User,
    data: {
      amount: number;
      currency?: string;
      goodName: string;
      savePaymentMethod?: boolean;
      externalOrderId?: string;
    },
  ) {
    if (!data.amount || data.amount <= 0) {
      throw new BadRequestException('결제 금액이 유효하지 않습니다.');
    }
    const currency = this.normalizeCurrency(data.currency);
    const customerId = await this.ensureCustomer(user);
    const orderId = generateOrderId();

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: data.amount,
      currency,
      customer: customerId,
      description: data.goodName,
      automatic_payment_methods: { enabled: true },
      setup_future_usage: data.savePaymentMethod ? 'off_session' : undefined,
      metadata: {
        userId: user.id,
        orderId,
        ...(data.externalOrderId
          ? { externalOrderId: data.externalOrderId }
          : {}),
      },
    });

    const tx = this.txRepo.create({
      userId: user.id,
      provider: PaymentProvider.STRIPE,
      paymentMethodId: null,
      sellerId: null,
      orderId,
      externalOrderId: data.externalOrderId || null,
      stripePaymentIntentId: paymentIntent.id,
      goodName: data.goodName,
      amount: data.amount,
      currency,
      cancelledAmount: 0,
      buyerName: user.name,
      buyerPhone: user.phone,
      payMethod: 'stripe',
      status: PaymentTransactionStatus.PENDING,
    });
    await this.txRepo.save(tx);

    return {
      clientSecret: paymentIntent.client_secret,
      orderId,
      transactionId: tx.id,
    };
  }

  // ── 빌링(저장 카드 off_session 반복청구) ────────────────────────────────────
  async chargeSavedCard(
    user: User,
    data: {
      paymentMethodId: string; // 우리 PaymentMethod.id
      amount: number;
      currency?: string;
      goodName: string;
      memo?: string;
    },
  ) {
    const paymentMethod = await this.paymentRepo.findOneBy({
      id: data.paymentMethodId,
      userId: user.id,
      provider: PaymentProvider.STRIPE,
      isActive: true,
    });
    if (!paymentMethod) {
      throw new NotFoundException('등록된 Stripe 결제 수단을 찾을 수 없습니다.');
    }
    if (!paymentMethod.customerId) {
      throw new BadRequestException('Stripe 고객 정보가 없는 결제 수단입니다.');
    }
    if (!data.amount || data.amount <= 0) {
      throw new BadRequestException('결제 금액이 유효하지 않습니다.');
    }
    const currency = this.normalizeCurrency(data.currency);
    const orderId = generateOrderId();

    const tx = this.txRepo.create({
      userId: user.id,
      provider: PaymentProvider.STRIPE,
      paymentMethodId: paymentMethod.id,
      sellerId: null,
      orderId,
      goodName: data.goodName,
      amount: data.amount,
      currency,
      cancelledAmount: 0,
      buyerName: user.name,
      buyerPhone: user.phone,
      payMethod: 'stripe',
      status: PaymentTransactionStatus.PENDING,
      memo: data.memo,
    });
    await this.txRepo.save(tx);

    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: data.amount,
        currency,
        customer: paymentMethod.customerId,
        payment_method: paymentMethod.billingKey,
        off_session: true,
        confirm: true,
        description: data.goodName,
        metadata: { userId: user.id, orderId },
        expand: ['latest_charge'],
      });

      tx.stripePaymentIntentId = paymentIntent.id;
      tx.rawResponse = { paymentIntent: paymentIntent as any };
      tx.receiptUrl = this.extractReceiptUrl(paymentIntent) || tx.receiptUrl;

      if (paymentIntent.status === 'succeeded') {
        tx.status = PaymentTransactionStatus.PAID;
        tx.paidAt = new Date();
      } else {
        // requires_action 등은 off_session 청구에선 실패로 간주
        tx.status = PaymentTransactionStatus.FAILED;
      }
      return await this.txRepo.save(tx);
    } catch (error: any) {
      this.logger.error(`Stripe chargeSavedCard 실패: ${error?.message}`);
      tx.status = PaymentTransactionStatus.FAILED;
      tx.stripePaymentIntentId =
        error?.raw?.payment_intent?.id || tx.stripePaymentIntentId;
      tx.rawResponse = { error: error?.message, code: error?.code };
      await this.txRepo.save(tx);
      throw new BadRequestException(
        error?.message || 'Stripe 결제에 실패했습니다.',
      );
    }
  }

  // ── 환불 (부분 환불 지원) ───────────────────────────────────────────────────
  async refundTransaction(
    user: User,
    transactionId: string,
    data: { amount?: number; reason?: string },
  ) {
    // 🔴 결제는 «구매자» 계정으로 귀속된다(카드가 서비스 소유자 한 명에게 몰리지 않게
    //    연동 서비스가 사용자 토큰으로 결제를 걸기 때문). 그래서 연동 서비스의 관리자는
    //    구매자의 거래를 소유하지 않아 환불을 못 부른다.
    //    ADMIN 은 소유자 확인을 건너뛴다 — 남의 돈을 되돌리는 일이므로 아래에 기록을 남긴다.
    const isAdmin = user.roles?.includes(UserRole.ADMIN) ?? false;
    const tx = await this.txRepo.findOneBy({
      id: transactionId,
      ...(isAdmin ? {} : { userId: user.id }),
      provider: PaymentProvider.STRIPE,
    });
    if (!tx) throw new NotFoundException('결제 내역을 찾을 수 없습니다.');
    if (isAdmin && tx.userId !== user.id) {
      this.logger.warn(
        `[환불] 관리자 대행 — 관리자=${user.id} 구매자=${tx.userId} 거래=${tx.id} 주문=${tx.orderId}`,
      );
    }
    if (!tx.stripePaymentIntentId) {
      throw new BadRequestException('환불 가능한 결제가 아닙니다.');
    }
    if (
      tx.status === PaymentTransactionStatus.CANCELLED ||
      tx.status === PaymentTransactionStatus.FAILED ||
      tx.status === PaymentTransactionStatus.PENDING
    ) {
      throw new BadRequestException('환불할 수 없는 상태입니다.');
    }

    const remaining = tx.amount - tx.cancelledAmount;
    const refundAmount = data.amount ?? remaining;
    if (refundAmount <= 0 || refundAmount > remaining) {
      throw new BadRequestException('환불 금액이 유효하지 않습니다.');
    }

    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: tx.stripePaymentIntentId,
        amount: refundAmount,
        metadata: { userId: user.id, orderId: tx.orderId },
      });

      tx.cancelledAmount = tx.cancelledAmount + refundAmount;
      tx.status =
        tx.cancelledAmount >= tx.amount
          ? PaymentTransactionStatus.CANCELLED
          : PaymentTransactionStatus.PARTIAL_CANCELLED;
      tx.cancelledAt = new Date();
      tx.rawResponse = { ...(tx.rawResponse || {}), refund: refund as any };
      return await this.txRepo.save(tx);
    } catch (error: any) {
      this.logger.error(`Stripe refund 실패: ${error?.message}`);
      throw new BadRequestException(
        error?.message || '환불에 실패했습니다.',
      );
    }
  }

  // ── 연동 서비스의 최종 사용자 (externalUserId 단위 Customer) ────────────────
  //
  // 🔴 여기가 «서비스 키로 최종 사용자 카드 저장» 금지를 푸는 자리다. 금지가 막는 것은
  //    카드가 **키 소유자 한 명의 Customer** 에 섞이는 것인데, 이 경로는 사람마다
  //    Customer 를 따로 세운다(`service_customers`). 위의 `/profile/stripe/*` 는
  //    여전히 «키 소유자 본인의 카드» 전용이다 — 둘을 섞지 말 것.

  /** (서비스, 서비스측 사용자 id) → Stripe Customer. 없으면 만든다 */
  async ensureServiceCustomer(
    serviceUserId: string,
    externalUserId: string,
    opts: { label?: string; email?: string; name?: string } = {},
  ): Promise<ServiceCustomer> {
    const key = String(externalUserId ?? '').trim();
    if (!key) throw new BadRequestException('externalUserId 가 필요합니다.');

    const existing = await this.serviceCustomerRepo.findOneBy({
      serviceUserId,
      externalUserId: key,
    });
    if (existing) {
      // 표시용 이름은 바뀔 수 있다(서비스에서 닉네임을 고친 경우)
      if (opts.label && opts.label !== existing.label) {
        existing.label = opts.label;
        await this.serviceCustomerRepo.save(existing);
      }
      return existing;
    }

    const customer = await this.stripe.customers.create({
      email: opts.email || undefined,
      name: opts.name || opts.label || undefined,
      // 🔴 두 값을 metadata 에 박아 둔다 — Stripe 대시보드에서 «어느 서비스의 누구» 인지
      //    못 읽으면 분쟁·환불 문의가 들어왔을 때 사람을 특정할 수가 없다.
      metadata: { serviceUserId, externalUserId: key },
    });

    const row = this.serviceCustomerRepo.create({
      serviceUserId,
      externalUserId: key,
      stripeCustomerId: customer.id,
      label: opts.label || null,
    });
    try {
      return await this.serviceCustomerRepo.save(row);
    } catch (err: any) {
      // 같은 사람을 두 요청이 동시에 만들면 유니크 인덱스가 하나를 막는다.
      // 진 쪽은 이긴 행을 쓰면 된다(Stripe Customer 하나가 붕 뜨지만 카드가 안 붙어 무해).
      const raced = await this.serviceCustomerRepo.findOneBy({
        serviceUserId,
        externalUserId: key,
      });
      if (raced) return raced;
      throw err;
    }
  }

  private async requireServiceCustomer(
    serviceUserId: string,
    externalUserId: string,
  ): Promise<ServiceCustomer> {
    const row = await this.serviceCustomerRepo.findOneBy({
      serviceUserId,
      externalUserId: String(externalUserId ?? '').trim(),
    });
    if (!row) throw new NotFoundException('등록된 사용자가 아닙니다.');
    return row;
  }

  /** 카드 저장용 SetupIntent. 프론트가 Stripe.js 로 확정한다 */
  async createServiceSetupIntent(
    serviceUserId: string,
    externalUserId: string,
    opts: { label?: string; email?: string; name?: string } = {},
  ) {
    const sc = await this.ensureServiceCustomer(
      serviceUserId,
      externalUserId,
      opts,
    );
    const setupIntent = await this.stripe.setupIntents.create({
      customer: sc.stripeCustomerId,
      usage: 'off_session',
      metadata: {
        serviceUserId,
        externalUserId: sc.externalUserId,
        serviceCustomerId: sc.id,
      },
    });
    return {
      clientSecret: setupIntent.client_secret,
      customerId: sc.stripeCustomerId,
      externalUserId: sc.externalUserId,
    };
  }

  /** 프론트 confirmSetup 직후 확정. 웹훅이 먼저 도착했으면 그 행을 돌려준다 */
  async registerServiceCard(
    serviceUserId: string,
    externalUserId: string,
    setupIntentId: string,
  ) {
    const sc = await this.requireServiceCustomer(serviceUserId, externalUserId);
    const si = await this.stripe.setupIntents.retrieve(setupIntentId);
    if (si.metadata?.serviceCustomerId !== sc.id) {
      throw new BadRequestException('잘못된 SetupIntent입니다.');
    }
    if (si.status !== 'succeeded') {
      throw new BadRequestException('카드 인증이 완료되지 않았습니다.');
    }
    const saved = await this.persistSavedCard(si);
    if (saved) return this.toPublicCard(saved);

    const pmId =
      typeof si.payment_method === 'string'
        ? si.payment_method
        : si.payment_method?.id;
    const existing = await this.paymentRepo.findOneBy({
      serviceCustomerId: sc.id,
      provider: PaymentProvider.STRIPE,
      billingKey: pmId || undefined,
    });
    return existing ? this.toPublicCard(existing) : null;
  }

  /**
   * 🔴 `billingKey`(pm_xxx)는 내려보내지 않는다. 서비스가 들고 있을 이유가 없고,
   *    들고 있으면 그 순간 서비스가 결제수단의 원본을 갖게 된다(`/sso/payments` 와 같은 규칙).
   */
  private toPublicCard(m: PaymentMethod) {
    return {
      id: m.id,
      cardNo: m.cardNo,
      cardName: m.cardName,
      pmType: m.pmType,
      pmDetail: m.pmDetail,
      createdAt: m.createdAt,
    };
  }

  async listServiceCards(serviceUserId: string, externalUserId: string) {
    const sc = await this.requireServiceCustomer(serviceUserId, externalUserId);
    const rows = await this.paymentRepo.find({
      where: {
        serviceCustomerId: sc.id,
        provider: PaymentProvider.STRIPE,
        isActive: true,
      },
      order: { createdAt: 'DESC' },
    });
    return rows.map((m) => this.toPublicCard(m));
  }

  async removeServiceCard(
    serviceUserId: string,
    externalUserId: string,
    paymentMethodId: string,
  ) {
    const sc = await this.requireServiceCustomer(serviceUserId, externalUserId);
    const method = await this.paymentRepo.findOneBy({
      id: paymentMethodId,
      serviceCustomerId: sc.id,
      provider: PaymentProvider.STRIPE,
    });
    if (!method) throw new NotFoundException('등록된 카드를 찾을 수 없습니다.');

    // Stripe 쪽에서도 떼어 둔다 — 안 떼면 고객 화면(Link 등)에 계속 남는다.
    try {
      await this.stripe.paymentMethods.detach(method.billingKey);
    } catch (err: any) {
      this.logger.warn(`[Stripe] detach 실패(무시): ${err?.message}`);
    }
    method.isActive = false;
    await this.paymentRepo.save(method);
    return { success: true };
  }

  /**
   * 일회성 결제. `externalUserId` 를 주면 그 사람의 Customer 에 붙고, 안 주면
   * **Customer 없이** 만든다(익명 결제) — 서비스 소유자의 Customer 에 남의 결제를
   * 달아 두면 대시보드에서 사람이 뒤섞인다.
   */
  async createServicePaymentIntent(
    serviceUserId: string,
    data: {
      amount: number;
      currency?: string;
      goodName: string;
      externalUserId?: string;
      savePaymentMethod?: boolean;
      externalOrderId?: string;
      label?: string;
      email?: string;
    },
  ) {
    if (!data.amount || data.amount <= 0) {
      throw new BadRequestException('결제 금액이 유효하지 않습니다.');
    }
    if (data.savePaymentMethod && !data.externalUserId) {
      // 익명 결제의 카드를 저장할 곳이 없다. 저장하려면 그 카드의 임자를 서비스가 대야 한다.
      throw new BadRequestException(
        '카드를 저장하려면 externalUserId 가 필요합니다.',
      );
    }
    const currency = this.normalizeCurrency(data.currency);
    const orderId = generateOrderId();

    const sc = data.externalUserId
      ? await this.ensureServiceCustomer(serviceUserId, data.externalUserId, {
          label: data.label,
          email: data.email,
        })
      : null;

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: data.amount,
      currency,
      ...(sc ? { customer: sc.stripeCustomerId } : {}),
      description: data.goodName,
      automatic_payment_methods: { enabled: true },
      setup_future_usage: data.savePaymentMethod ? 'off_session' : undefined,
      metadata: {
        userId: serviceUserId,
        orderId,
        ...(sc
          ? { serviceCustomerId: sc.id, externalUserId: sc.externalUserId }
          : {}),
        ...(data.externalOrderId
          ? { externalOrderId: data.externalOrderId }
          : {}),
      },
    });

    const tx = this.txRepo.create({
      userId: serviceUserId,
      serviceCustomerId: sc?.id ?? null,
      externalUserId: sc?.externalUserId ?? null,
      provider: PaymentProvider.STRIPE,
      paymentMethodId: null,
      sellerId: null,
      orderId,
      externalOrderId: data.externalOrderId || null,
      stripePaymentIntentId: paymentIntent.id,
      goodName: data.goodName,
      amount: data.amount,
      currency,
      cancelledAmount: 0,
      buyerName: data.label || undefined,
      payMethod: 'stripe',
      status: PaymentTransactionStatus.PENDING,
    });
    await this.txRepo.save(tx);

    return {
      clientSecret: paymentIntent.client_secret,
      orderId,
      transactionId: tx.id,
    };
  }

  /**
   * 저장 카드로 청구(정기결제). **서비스 API 키로 부른다** — 매달 도는 일이라
   * 사용자가 화면에 없다.
   *
   * 🔴 카드는 `serviceCustomerId` 로 찾는다. 즉 **자기 서비스의 손님 카드만** 긁을 수 있고,
   *    남의 서비스 손님이나 플랫폼 사용자 본인 카드에는 닿지 않는다.
   */
  async chargeServiceCard(
    serviceUserId: string,
    data: {
      externalUserId: string;
      paymentMethodId: string;
      amount: number;
      currency?: string;
      goodName: string;
      externalOrderId?: string;
      memo?: string;
    },
  ) {
    const sc = await this.requireServiceCustomer(
      serviceUserId,
      data.externalUserId,
    );
    const method = await this.paymentRepo.findOneBy({
      id: data.paymentMethodId,
      serviceCustomerId: sc.id,
      provider: PaymentProvider.STRIPE,
      isActive: true,
    });
    if (!method) throw new NotFoundException('등록된 카드를 찾을 수 없습니다.');
    if (!data.amount || data.amount <= 0) {
      throw new BadRequestException('결제 금액이 유효하지 않습니다.');
    }
    const currency = this.normalizeCurrency(data.currency);
    const orderId = generateOrderId();

    const tx = this.txRepo.create({
      userId: serviceUserId,
      serviceCustomerId: sc.id,
      externalUserId: sc.externalUserId,
      provider: PaymentProvider.STRIPE,
      paymentMethodId: method.id,
      sellerId: null,
      orderId,
      externalOrderId: data.externalOrderId || null,
      goodName: data.goodName,
      amount: data.amount,
      currency,
      cancelledAmount: 0,
      buyerName: sc.label ?? undefined,
      payMethod: 'stripe',
      status: PaymentTransactionStatus.PENDING,
      memo: data.memo,
    });
    await this.txRepo.save(tx);

    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: data.amount,
        currency,
        customer: sc.stripeCustomerId,
        payment_method: method.billingKey,
        off_session: true,
        confirm: true,
        description: data.goodName,
        metadata: {
          userId: serviceUserId,
          orderId,
          serviceCustomerId: sc.id,
          externalUserId: sc.externalUserId,
          ...(data.externalOrderId
            ? { externalOrderId: data.externalOrderId }
            : {}),
        },
        expand: ['latest_charge'],
      });

      tx.stripePaymentIntentId = paymentIntent.id;
      tx.rawResponse = { paymentIntent: paymentIntent as any };
      tx.receiptUrl = this.extractReceiptUrl(paymentIntent) || tx.receiptUrl;

      if (paymentIntent.status === 'succeeded') {
        tx.status = PaymentTransactionStatus.PAID;
        tx.paidAt = new Date();
      } else {
        // requires_action 등은 off_session 청구에선 실패로 간주
        tx.status = PaymentTransactionStatus.FAILED;
      }
      const saved = await this.txRepo.save(tx);
      // 🔴 여기서 쏘지 않으면 정기결제는 웹훅을 못 받는다 — Stripe 웹훅이 와도
      //    상태가 이미 PAID 라 `syncPaymentIntent` 의 전이 조건에 안 걸린다.
      this.dispatchOnce(
        saved,
        saved.status === PaymentTransactionStatus.PAID
          ? 'payment.paid'
          : 'payment.failed',
      );
      return saved;
    } catch (error: any) {
      this.logger.error(`Stripe chargeServiceCard 실패: ${error?.message}`);
      tx.status = PaymentTransactionStatus.FAILED;
      tx.stripePaymentIntentId =
        error?.raw?.payment_intent?.id || tx.stripePaymentIntentId;
      tx.rawResponse = { error: error?.message, code: error?.code };
      const saved = await this.txRepo.save(tx);
      this.dispatchOnce(saved, 'payment.failed');
      throw new BadRequestException(
        error?.message || 'Stripe 결제에 실패했습니다.',
      );
    }
  }

  // ── 웹훅 처리 (서명검증 → 이벤트별 동기화) ──────────────────────────────────
  async handleWebhook(rawBody: Buffer, signature: string) {
    const secret = process.env.API_STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new BadRequestException('Stripe 웹훅 설정이 완료되지 않았습니다.');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (err: any) {
      this.logger.warn(`[Stripe Webhook] 서명검증 실패: ${err?.message}`);
      throw new BadRequestException('웹훅 서명검증에 실패했습니다.');
    }

    this.logger.log(`[Stripe Webhook] ${event.type} (${event.id})`);

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.syncPaymentIntent(
          event,
          event.data.object as Stripe.PaymentIntent,
          PaymentTransactionStatus.PAID,
        );
        break;
      case 'payment_intent.payment_failed':
        await this.syncPaymentIntent(
          event,
          event.data.object as Stripe.PaymentIntent,
          PaymentTransactionStatus.FAILED,
        );
        break;
      case 'charge.refunded':
        await this.syncChargeRefund(event, event.data.object as Stripe.Charge);
        break;
      case 'setup_intent.succeeded':
        await this.persistSavedCard(event.data.object as Stripe.SetupIntent);
        break;
      default:
        this.logger.log(`[Stripe Webhook] 미처리 이벤트: ${event.type}`);
    }

    return { received: true };
  }

  // 멱등성: 동일 event.id 이미 반영된 tx면 skip
  private alreadyProcessed(
    tx: PaymentTransaction,
    eventId: string,
  ): boolean {
    const events = (tx.rawResponse?.events as string[]) || [];
    return events.includes(eventId);
  }

  private appendEvent(tx: PaymentTransaction, eventId: string) {
    const events = (tx.rawResponse?.events as string[]) || [];
    tx.rawResponse = { ...(tx.rawResponse || {}), events: [...events, eventId] };
  }

  /**
   * 연동 서비스에 한 번만 알린다.
   *
   * 같은 거래가 두 길로 확정될 수 있다 — off_session 청구는 응답에서 곧장 PAID 가 되고,
   * 잠시 뒤 Stripe 웹훅이 같은 결과를 또 들고 온다. 표식을 남기지 않으면 서비스가
   * 같은 후원을 **두 번 적는다**.
   */
  private dispatchOnce(
    tx: PaymentTransaction,
    event: 'payment.paid' | 'payment.failed' | 'payment.refunded',
  ): void {
    const sent = (tx.rawResponse?.dispatched as string[]) || [];
    if (sent.includes(event)) return;
    tx.rawResponse = { ...(tx.rawResponse || {}), dispatched: [...sent, event] };
    // 표식 저장은 기다리지 않는다(배달도 비동기다). 실패해도 재시도는 웹훅이 받는다.
    void this.txRepo
      .update(tx.id, { rawResponse: tx.rawResponse })
      .catch(() => undefined);
    this.webhooks.dispatch(tx, event);
  }

  // PaymentIntent의 latest_charge(확장된 경우)에서 영수증 URL 추출.
  private extractReceiptUrl(pi: Stripe.PaymentIntent): string | null {
    const charge = pi.latest_charge;
    if (charge && typeof charge !== 'string') {
      return charge.receipt_url || null;
    }
    return null;
  }

  private async findTx(
    paymentIntentId?: string | null,
    orderId?: string,
  ): Promise<PaymentTransaction | null> {
    if (paymentIntentId) {
      const byPi = await this.txRepo.findOneBy({
        stripePaymentIntentId: paymentIntentId,
      });
      if (byPi) return byPi;
    }
    if (orderId) {
      return this.txRepo.findOneBy({ orderId });
    }
    return null;
  }

  private async syncPaymentIntent(
    event: Stripe.Event,
    pi: Stripe.PaymentIntent,
    status: PaymentTransactionStatus,
  ) {
    const tx = await this.findTx(pi.id, pi.metadata?.orderId);
    if (!tx) {
      this.logger.warn(`[Stripe Webhook] tx not found: pi=${pi.id}`);
      return;
    }
    if (this.alreadyProcessed(tx, event.id)) return;

    if (!tx.stripePaymentIntentId) tx.stripePaymentIntentId = pi.id;
    if (status === PaymentTransactionStatus.PAID) {
      // 웹훅 PaymentIntent의 latest_charge는 id 문자열이라 charge를 조회해 영수증 URL 확보.
      if (!tx.receiptUrl && pi.latest_charge) {
        const chargeId =
          typeof pi.latest_charge === 'string'
            ? pi.latest_charge
            : pi.latest_charge.id;
        try {
          const charge = await this.stripe.charges.retrieve(chargeId);
          tx.receiptUrl = charge.receipt_url || null;
        } catch (err: any) {
          this.logger.warn(`[Stripe Webhook] charge retrieve 실패: ${err?.message}`);
        }
      }
      // 이미 환불/취소된 건은 덮어쓰지 않음
      if (
        tx.status === PaymentTransactionStatus.PENDING ||
        tx.status === PaymentTransactionStatus.FAILED
      ) {
        tx.status = PaymentTransactionStatus.PAID;
        if (!tx.paidAt) tx.paidAt = new Date();
      }
    } else if (status === PaymentTransactionStatus.FAILED) {
      if (tx.status === PaymentTransactionStatus.PENDING) {
        tx.status = PaymentTransactionStatus.FAILED;
      }
    }
    this.appendEvent(tx, event.id);
    const saved = await this.txRepo.save(tx);
    if (saved.status === PaymentTransactionStatus.PAID) {
      this.dispatchOnce(saved, 'payment.paid');
    } else if (saved.status === PaymentTransactionStatus.FAILED) {
      this.dispatchOnce(saved, 'payment.failed');
    }
  }

  private async syncChargeRefund(event: Stripe.Event, charge: Stripe.Charge) {
    const piId =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id;
    const tx = await this.findTx(piId, charge.metadata?.orderId);
    if (!tx) {
      this.logger.warn(`[Stripe Webhook] tx not found for refund: charge=${charge.id}`);
      return;
    }
    if (this.alreadyProcessed(tx, event.id)) return;

    // Stripe가 알려주는 누적 환불액으로 동기화 (직접 환불/대시보드 환불 포함)
    tx.cancelledAmount = Math.min(tx.amount, charge.amount_refunded);
    tx.status =
      tx.cancelledAmount >= tx.amount
        ? PaymentTransactionStatus.CANCELLED
        : PaymentTransactionStatus.PARTIAL_CANCELLED;
    if (!tx.cancelledAt) tx.cancelledAt = new Date();
    this.appendEvent(tx, event.id);
    const saved = await this.txRepo.save(tx);
    this.dispatchOnce(saved, 'payment.refunded');
  }

  // pmType/pmDetail이 비어있는 기존 행을 Stripe 조회로 채운다.
  private async backfillPmDetail(pm: PaymentMethod): Promise<void> {
    try {
      const stripePm = await this.stripe.paymentMethods.retrieve(pm.billingKey);
      pm.pmType = stripePm.type;
      pm.pmDetail = {
        ...(pm.pmDetail || {}),
        ...(this.extractPmDetail(stripePm) || {}),
      };
      // 구버전이 남긴 기본 라벨('카드'/'****')을 실제 수단으로 교정
      if (stripePm.card) {
        if (pm.cardName === '카드') pm.cardName = stripePm.card.brand || pm.cardName;
        if (pm.cardNo === '****') pm.cardNo = stripePm.card.last4 || pm.cardNo;
      } else if (pm.cardName === '카드') {
        pm.cardName = WALLET_LABELS[stripePm.type] || stripePm.type;
      }
      await this.paymentRepo.save(pm);
    } catch (err: any) {
      this.logger.warn(`[Stripe] pmDetail 백필 실패: ${err?.message}`);
    }
  }

  // 수단별로 Stripe가 제공하는 식별 정보를 추출.
  // 네이버페이는 카드번호/브랜드를 주지 않고 buyer_id(동일 계정 식별)와 funding만 준다.
  private extractPmDetail(pm: Stripe.PaymentMethod): Record<string, any> | null {
    if (pm.card) {
      return {
        brand: pm.card.brand,
        last4: pm.card.last4,
        funding: pm.card.funding,
        country: pm.card.country,
        expMonth: pm.card.exp_month,
        expYear: pm.card.exp_year,
      };
    }
    const wallet = (pm as any)[pm.type];
    if (wallet && typeof wallet === 'object') {
      return {
        buyerId: wallet.buyer_id ?? undefined,
        funding: wallet.funding ?? undefined,
      };
    }
    return null;
  }

  // SetupIntent 성공 → 저장 카드(PaymentMethod) 영속화.
  // 웹훅과 엔드포인트 양쪽에서 호출. 신규 저장 시 PaymentMethod 반환, 이미 있으면 null.
  private async persistSavedCard(
    si: Stripe.SetupIntent,
  ): Promise<PaymentMethod | null> {
    // 카드의 임자는 둘 중 하나다 — 플랫폼 사용자(`userId`)이거나
    // 연동 서비스의 손님(`serviceCustomerId`)이거나. 웹훅은 양쪽을 다 받는다.
    const userId = si.metadata?.userId;
    const serviceCustomerId = si.metadata?.serviceCustomerId;
    const pmId =
      typeof si.payment_method === 'string'
        ? si.payment_method
        : si.payment_method?.id;
    const customerId =
      typeof si.customer === 'string' ? si.customer : si.customer?.id;
    if ((!userId && !serviceCustomerId) || !pmId || !customerId) {
      this.logger.warn('[Stripe] setup_intent 메타데이터 누락');
      return null;
    }

    // 멱등성: 동일 pm 이미 저장된 경우 skip
    const owner = serviceCustomerId
      ? { serviceCustomerId }
      : { userId: userId as string };
    const exists = await this.paymentRepo.findOneBy({
      ...owner,
      provider: PaymentProvider.STRIPE,
      billingKey: pmId,
    });
    if (exists) {
      // pmType 도입 이전/구버전 웹훅이 만든 행은 상세 정보와 라벨을 채워둔다
      if (!exists.pmDetail) await this.backfillPmDetail(exists);
      return null;
    }

    let cardBrand = '카드';
    let last4 = '****';
    let pmType: string | null = null;
    let pmDetail: Record<string, any> | null = null;
    try {
      const pm = await this.stripe.paymentMethods.retrieve(pmId);
      pmType = pm.type;
      pmDetail = this.extractPmDetail(pm);
      if (pm.card) {
        cardBrand = pm.card.brand || cardBrand;
        last4 = pm.card.last4 || last4;
      } else {
        // 네이버페이 등 카드 정보가 없는 수단은 타입명을 라벨로 사용
        cardBrand = WALLET_LABELS[pm.type] || pm.type || cardBrand;
      }
    } catch (err: any) {
      this.logger.warn(`[Stripe] pm retrieve 실패: ${err?.message}`);
    }

    // 반복청구 근거(mandate)는 SetupIntent에만 있어 함께 보관
    const mandateId = typeof si.mandate === 'string' ? si.mandate : si.mandate?.id;
    if (mandateId) pmDetail = { ...(pmDetail || {}), mandateId };

    const payment = this.paymentRepo.create({
      ...owner,
      provider: PaymentProvider.STRIPE,
      cardNo: last4,
      cardName: cardBrand,
      pmType,
      pmDetail,
      merchantId: null,
      customerId,
      billingKey: pmId,
      isActive: true,
    });
    const saved = await this.paymentRepo.save(payment);
    this.logger.log(
      `[Stripe] 저장 카드 등록: ${
        serviceCustomerId ? `serviceCustomer=${serviceCustomerId}` : `user=${userId}`
      } pm=${pmId}`,
    );
    return saved;
  }
}
