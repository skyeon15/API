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
import { User } from './entities/user.entity.js';

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
    const existing = await this.paymentRepo.findOne({
      where: { userId: user.id, provider: PaymentProvider.STRIPE },
      order: { createdAt: 'DESC' },
    });
    if (existing?.customerId) return existing.customerId;

    const customer = await this.stripe.customers.create({
      email: user.email || undefined,
      name: user.name || undefined,
      phone: user.phone || undefined,
      metadata: { userId: user.id },
    });
    return customer.id;
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
      metadata: { userId: user.id, orderId },
    });

    const tx = this.txRepo.create({
      userId: user.id,
      provider: PaymentProvider.STRIPE,
      paymentMethodId: null,
      sellerId: null,
      orderId,
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
    const tx = await this.txRepo.findOneBy({
      id: transactionId,
      userId: user.id,
      provider: PaymentProvider.STRIPE,
    });
    if (!tx) throw new NotFoundException('결제 내역을 찾을 수 없습니다.');
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
    await this.txRepo.save(tx);
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
    await this.txRepo.save(tx);
  }

  // SetupIntent 성공 → 저장 카드(PaymentMethod) 영속화.
  // 웹훅과 엔드포인트 양쪽에서 호출. 신규 저장 시 PaymentMethod 반환, 이미 있으면 null.
  private async persistSavedCard(
    si: Stripe.SetupIntent,
  ): Promise<PaymentMethod | null> {
    const userId = si.metadata?.userId;
    const pmId =
      typeof si.payment_method === 'string'
        ? si.payment_method
        : si.payment_method?.id;
    const customerId =
      typeof si.customer === 'string' ? si.customer : si.customer?.id;
    if (!userId || !pmId || !customerId) {
      this.logger.warn('[Stripe] setup_intent 메타데이터 누락');
      return null;
    }

    // 멱등성: 동일 pm 이미 저장된 경우 skip
    const exists = await this.paymentRepo.findOneBy({
      userId,
      provider: PaymentProvider.STRIPE,
      billingKey: pmId,
    });
    if (exists) return null;

    let cardBrand = '카드';
    let last4 = '****';
    try {
      const pm = await this.stripe.paymentMethods.retrieve(pmId);
      if (pm.card) {
        cardBrand = pm.card.brand || cardBrand;
        last4 = pm.card.last4 || last4;
      }
    } catch (err: any) {
      this.logger.warn(`[Stripe] pm retrieve 실패: ${err?.message}`);
    }

    const payment = this.paymentRepo.create({
      userId,
      provider: PaymentProvider.STRIPE,
      cardNo: last4,
      cardName: cardBrand,
      merchantId: null,
      customerId,
      billingKey: pmId,
      isActive: true,
    });
    const saved = await this.paymentRepo.save(payment);
    this.logger.log(`[Stripe] 저장 카드 등록: user=${userId} pm=${pmId}`);
    return saved;
  }
}
