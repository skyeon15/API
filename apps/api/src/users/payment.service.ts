import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentMethod } from './entities/payment-method.entity.js';
import { PayappSeller } from './entities/payapp-seller.entity.js';
import {
  PaymentTransaction,
  PaymentTransactionStatus,
} from './entities/payment-transaction.entity.js';
import {
  CashReceipt,
  CashReceiptStatus,
  CashReceiptType,
} from './entities/cash-receipt.entity.js';
import { User } from './entities/user.entity.js';
import { firstValueFrom } from 'rxjs';
import * as qs from 'querystring';
import { randomBytes } from 'crypto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly PAYAPP_API_URL = 'https://api.payapp.kr/oapi/apiLoad.html';

  constructor(
    private readonly httpService: HttpService,
    @InjectRepository(PaymentMethod)
    private readonly paymentRepo: Repository<PaymentMethod>,
    @InjectRepository(PayappSeller)
    private readonly sellerRepo: Repository<PayappSeller>,
    @InjectRepository(PaymentTransaction)
    private readonly txRepo: Repository<PaymentTransaction>,
    @InjectRepository(CashReceipt)
    private readonly receiptRepo: Repository<CashReceipt>,
  ) {}

  private async callPayapp(postData: Record<string, any>) {
    const response = await firstValueFrom(
      this.httpService.post(this.PAYAPP_API_URL, qs.stringify(postData), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }),
    );
    return qs.parse(response.data) as Record<string, any>;
  }

  private generateOrderId(): string {
    const ts = Date.now().toString(36);
    const rand = randomBytes(4).toString('hex');
    return `api_${ts}_${rand}`;
  }

  private getWebhookUrl(): string | null {
    const base = process.env.API_PUBLIC_URL;
    if (!base) return null;
    return `${base.replace(/\/+$/, '')}/webhooks/payapp`;
  }

  async registerSeller(
    user: User,
    data: {
      sellerId: string;
      sellerPwd: string;
      sellerName: string;
      email: string;
      phone: string;
      usertype: '1' | '2'; // 1: 개인, 2: 사업자
      bizkind: string;
      memo?: string;
      // 사업자일 경우 필수
      compregno?: string;
      compname?: string;
      biztype1?: string;
      biztype2?: string;
      ceo_nm?: string;
    },
  ) {
    const resellerid =
      process.env.API_PAYAPP_RESELLERID || process.env.API_PAYAPP_USERID;

    if (!resellerid) {
      throw new BadRequestException(
        '리셀러 아이디 설정이 완료되지 않았습니다.',
      );
    }

    const postData: any = {
      cmd: 'sellerRegist',
      userid: data.sellerId,
      userpwd: data.sellerPwd,
      sellername: data.sellerName,
      phone: data.phone.replace(/\D/g, ''),
      email: data.email,
      usertype: data.usertype,
      bizkind: data.bizkind,
      resellerid: resellerid,
      join_type: '4', // 할인 가입
      seller_type: 'seller',
    };

    if (data.usertype === '2') {
      postData.compregno = data.compregno?.replace(/\D/g, '');
      postData.compname = data.compname;
      postData.biztype1 = data.biztype1;
      postData.biztype2 = data.biztype2;
      postData.ceo_nm = data.ceo_nm;
    } else {
      postData.username = data.sellerName;
    }

    const maskedPostData = {
      ...postData,
      userpwd: '********',
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(this.PAYAPP_API_URL, qs.stringify(postData), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }),
      );

      const result = qs.parse(response.data) as any;

      if (result.state !== '1') {
        throw new BadRequestException(
          result.errorMessage || '판매자 가입에 실패했습니다.',
        );
      }

      const seller = this.sellerRepo.create({
        userId: user.id,
        sellerId: result.userid,
        linkKey: result.linkkey,
        linkVal: result.linkval,
        memo: data.memo,
        isActive: true,
      });

      return await this.sellerRepo.save(seller);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`Payapp API Error [${postData.cmd}]: ${error.message}`);
      throw new BadRequestException(
        'payapp 통신 중 오류가 발생했습니다: ' + error.message,
      );
    }
  }

  async checkSellerId(sellerId: string) {
    const resellerid =
      process.env.API_PAYAPP_RESELLERID || process.env.API_PAYAPP_USERID;

    if (!resellerid) {
      throw new BadRequestException(
        '리셀러 아이디 설정이 완료되지 않았습니다.',
      );
    }

    const postData = {
      cmd: 'useridCheck',
      userid: sellerId,
      resellerid: resellerid,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(this.PAYAPP_API_URL, qs.stringify(postData), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }),
      );

      const result = qs.parse(response.data) as any;

      if (result.state !== '1') {
        throw new BadRequestException(
          result.errorMessage ||
            '이미 사용 중이거나 사용할 수 없는 아이디입니다.',
        );
      }

      return { success: true, message: '사용 가능한 아이디입니다.' };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`Payapp API Error [${postData.cmd}]: ${error.message}`);
      throw new BadRequestException(
        'payapp 통신 중 오류가 발생했습니다: ' + error.message,
      );
    }
  }

  async registerCard(
    user: User,
    cardInfo: {
      sellerId: string;
      cardNo: string;
      expMonth: string;
      expYear: string;
      cardPw: string;
      buyerAuthNo: string;
    },
  ) {
    // 빌링키는 판매자 계정에 귀속된다. 카드는 선택한 판매자의 계정으로 등록한다.
    const seller = await this.sellerRepo.findOneBy({
      id: cardInfo.sellerId,
      userId: user.id,
      isActive: true,
    });
    if (!seller) {
      throw new NotFoundException('판매자 계정을 찾을 수 없습니다.');
    }

    const userid = seller.sellerId;
    const linkkey = seller.linkKey;

    const postData = {
      cmd: 'billRegist',
      userid,
      linkkey,
      cardNo: cardInfo.cardNo.replace(/\D/g, ''),
      expMonth: cardInfo.expMonth,
      expYear: cardInfo.expYear,
      cardPw: cardInfo.cardPw,
      buyerAuthNo: cardInfo.buyerAuthNo,
      buyerPhone: user.phone,
      buyerName: user.name,
      buyerId: `api.${user.id}`,
    };

    const maskedPostData = {
      ...postData,
      cardNo: '********',
      cardPw: '****',
      buyerAuthNo: '********',
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(this.PAYAPP_API_URL, qs.stringify(postData), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }),
      );

      // payapp returns data in querystring format as a string
      const result = qs.parse(response.data) as any;

      if (result.state !== '1') {
        throw new BadRequestException(
          result.errorMessage || '카드 등록에 실패했습니다.',
        );
      }

      // 실제 응답 필드명(소문자)을 우선 사용하고, 대괄호[] 제거
      const rawCardName = result.cardname || result.cardName || '카드';
      const cleanCardName = rawCardName.replace(/[\[\]]/g, '');

      const payment = this.paymentRepo.create({
        userId: user.id,
        sellerId: seller.id,
        cardNo:
          result.cardno ||
          result.cardNum ||
          cardInfo.cardNo.slice(0, 4) + '********' + cardInfo.cardNo.slice(-4),
        cardName: cleanCardName,
        merchantId: seller.sellerId,
        billingKey: result.encBill,
        isActive: true,
      });

      return await this.sellerRepo.manager.save(payment);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`Payapp API Error [${postData.cmd}]: ${error.message}`);
      throw new BadRequestException(
        'payapp 통신 중 오류가 발생했습니다: ' + error.message,
      );
    }
  }

  async deleteCard(payment: PaymentMethod) {
    const userid = process.env.API_PAYAPP_USERID;
    const linkkey = process.env.API_PAYAPP_LINKKEY;

    if (!userid || !linkkey) {
      throw new BadRequestException('결제 시스템 설정이 완료되지 않았습니다.');
    }

    const postData = {
      cmd: 'billDelete',
      userid,
      linkkey,
      encBill: payment.billingKey,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(this.PAYAPP_API_URL, qs.stringify(postData), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }),
      );

      const result = qs.parse(response.data) as any;

      if (result.state !== '1') {
        throw new BadRequestException(
          result.errorMessage || 'payapp에서 카드 삭제에 실패했습니다.',
        );
      }

      return true;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`Payapp API Error [${postData.cmd}]: ${error.message}`);
      throw new BadRequestException(
        'payapp 통신 중 오류가 발생했습니다: ' + error.message,
      );
    }
  }

  // ── 등록된 카드로 결제 (billPay) ───────────────────────────────────────────
  async chargeCard(
    user: User,
    data: {
      paymentMethodId: string;
      sellerId: string;
      goodName: string;
      amount: number;
      buyerName?: string;
      buyerPhone?: string;
      memo?: string;
      feedbackUrl?: string;
    },
  ) {
    const paymentMethod = await this.paymentRepo.findOneBy({
      id: data.paymentMethodId,
      userId: user.id,
      isActive: true,
    });
    if (!paymentMethod) {
      throw new NotFoundException('등록된 결제 수단을 찾을 수 없습니다.');
    }

    // 빌링키는 카드 등록 시 귀속된 판매자 계정으로만 결제할 수 있다.
    const seller = await this.sellerRepo.findOneBy({
      id: paymentMethod.sellerId ?? data.sellerId,
      userId: user.id,
      isActive: true,
    });
    if (!seller) {
      throw new NotFoundException('판매자 계정을 찾을 수 없습니다.');
    }

    if (!data.amount || data.amount <= 0) {
      throw new BadRequestException('결제 금액이 유효하지 않습니다.');
    }

    const orderId = this.generateOrderId();
    const tx = this.txRepo.create({
      userId: user.id,
      paymentMethodId: paymentMethod.id,
      sellerId: seller.id,
      orderId,
      goodName: data.goodName,
      amount: data.amount,
      cancelledAmount: 0,
      buyerName: data.buyerName || user.name,
      buyerPhone: data.buyerPhone || user.phone,
      payMethod: 'billing',
      status: PaymentTransactionStatus.PENDING,
      memo: data.memo,
    });
    await this.txRepo.save(tx);

    const postData: Record<string, any> = {
      cmd: 'billPay',
      userid: seller.sellerId,
      linkkey: seller.linkKey,
      goodname: data.goodName,
      price: String(data.amount),
      recvphone: (data.buyerPhone || user.phone || '').replace(/\D/g, ''),
      buyername: data.buyerName || user.name || '',
      encBill: paymentMethod.billingKey,
      var1: orderId,
    };
    const feedbackUrl = data.feedbackUrl || this.getWebhookUrl();
    if (feedbackUrl) postData.feedbackurl = feedbackUrl;

    try {
      const result = await this.callPayapp(postData);
      tx.rawResponse = result;

      if (result.state !== '1') {
        tx.status = PaymentTransactionStatus.FAILED;
        await this.txRepo.save(tx);
        throw new BadRequestException(
          result.errorMessage || '결제에 실패했습니다.',
        );
      }

      tx.mulNo = (result.mul_no as string) || null;
      tx.status = PaymentTransactionStatus.PAID;
      tx.paidAt = new Date();
      return await this.txRepo.save(tx);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`Payapp API Error [${postData.cmd}]: ${error.message}`);
      tx.status = PaymentTransactionStatus.FAILED;
      tx.rawResponse = { error: error.message };
      await this.txRepo.save(tx);
      throw new BadRequestException(
        'payapp 통신 중 오류가 발생했습니다: ' + error.message,
      );
    }
  }

  // ── 결제 취소 (paycancel, 부분취소 지원) ───────────────────────────────────
  async cancelTransaction(
    user: User,
    transactionId: string,
    data: { amount?: number; memo?: string },
  ) {
    const tx = await this.txRepo.findOneBy({
      id: transactionId,
      userId: user.id,
    });
    if (!tx) throw new NotFoundException('결제 내역을 찾을 수 없습니다.');
    if (!tx.mulNo) {
      throw new BadRequestException('취소 가능한 결제가 아닙니다.');
    }
    if (
      tx.status === PaymentTransactionStatus.CANCELLED ||
      tx.status === PaymentTransactionStatus.FAILED ||
      tx.status === PaymentTransactionStatus.PENDING
    ) {
      throw new BadRequestException('취소할 수 없는 상태입니다.');
    }

    const remaining = tx.amount - tx.cancelledAmount;
    const cancelAmount = data.amount ?? remaining;
    if (cancelAmount <= 0 || cancelAmount > remaining) {
      throw new BadRequestException('취소 금액이 유효하지 않습니다.');
    }
    const isPartial = cancelAmount < remaining;

    if (!tx.sellerId) {
      throw new BadRequestException('판매자 정보가 없는 결제입니다.');
    }
    const seller = await this.sellerRepo.findOneBy({ id: tx.sellerId });
    if (!seller) throw new NotFoundException('판매자 계정을 찾을 수 없습니다.');

    const postData: Record<string, any> = {
      cmd: 'paycancel',
      userid: seller.sellerId,
      linkkey: seller.linkKey,
      mul_no: tx.mulNo,
      cancelmemo: data.memo || '사용자 요청 취소',
      partcancel: isPartial ? '1' : '0',
    };
    if (isPartial) postData.cancelprice = String(cancelAmount);

    try {
      const result = await this.callPayapp(postData);

      if (result.state !== '1') {
        throw new BadRequestException(
          result.errorMessage || '결제 취소에 실패했습니다.',
        );
      }

      tx.cancelledAmount = tx.cancelledAmount + cancelAmount;
      tx.status =
        tx.cancelledAmount >= tx.amount
          ? PaymentTransactionStatus.CANCELLED
          : PaymentTransactionStatus.PARTIAL_CANCELLED;
      tx.cancelledAt = new Date();
      tx.rawResponse = { ...(tx.rawResponse || {}), cancel: result };
      return await this.txRepo.save(tx);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`Payapp API Error [${postData.cmd}]: ${error.message}`);
      throw new BadRequestException(
        'payapp 통신 중 오류가 발생했습니다: ' + error.message,
      );
    }
  }

  async listTransactions(userId: string) {
    return this.txRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  // ── 현금영수증 발급 (cashStRegist) ─────────────────────────────────────────
  async issueCashReceipt(
    user: User,
    data: {
      sellerId: string;
      type: CashReceiptType;
      buyerName: string;
      idInfo: string; // 휴대폰/사업자번호 (- 포함 가능)
      goodName: string;
      amount: number;
      transactionId?: string;
    },
  ) {
    const seller = await this.sellerRepo.findOneBy({
      id: data.sellerId,
      userId: user.id,
      isActive: true,
    });
    if (!seller) throw new NotFoundException('판매자 계정을 찾을 수 없습니다.');

    if (
      data.type !== CashReceiptType.INCOME_DEDUCTION &&
      data.type !== CashReceiptType.EXPENSE_PROOF
    ) {
      throw new BadRequestException('발급 용도가 유효하지 않습니다.');
    }

    const idInfo = (data.idInfo || '').replace(/\D/g, '');
    if (!idInfo) throw new BadRequestException('식별번호를 입력해주세요.');
    if (data.type === CashReceiptType.INCOME_DEDUCTION && idInfo.length !== 11) {
      throw new BadRequestException('휴대폰번호는 11자리여야 합니다.');
    }
    if (data.type === CashReceiptType.EXPENSE_PROOF && idInfo.length !== 10) {
      throw new BadRequestException('사업자등록번호는 10자리여야 합니다.');
    }
    if (!data.buyerName?.trim()) {
      throw new BadRequestException('구매자명을 입력해주세요.');
    }
    if (!data.amount || data.amount <= 0) {
      throw new BadRequestException('금액이 유효하지 않습니다.');
    }

    if (data.transactionId) {
      const tx = await this.txRepo.findOneBy({
        id: data.transactionId,
        userId: user.id,
      });
      if (!tx)
        throw new NotFoundException('연결할 결제 내역을 찾을 수 없습니다.');
    }

    const tax = Math.floor(data.amount / 11);
    const supply = data.amount - tax;
    const trCode = data.type === CashReceiptType.INCOME_DEDUCTION ? '0' : '1';

    const receipt = this.receiptRepo.create({
      userId: user.id,
      transactionId: data.transactionId || null,
      sellerId: seller.id,
      type: data.type,
      buyerName: data.buyerName.trim(),
      idInfo,
      goodName: data.goodName,
      amount: data.amount,
      supplyAmount: supply,
      taxAmount: tax,
      status: CashReceiptStatus.REQUEST,
    });
    await this.receiptRepo.save(receipt);

    const buyerPhone = (user.phone || '').replace(/\D/g, '');
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const tradTime =
      now.getFullYear().toString() +
      pad(now.getMonth() + 1) +
      pad(now.getDate()) +
      pad(now.getHours()) +
      pad(now.getMinutes()) +
      pad(now.getSeconds());

    const postData: Record<string, any> = {
      cmd: 'cashStRegist',
      userid: seller.sellerId,
      linkkey: seller.linkKey,
      good_name: data.goodName,
      buyr_name: data.buyerName.trim(),
      buyr_tel1: buyerPhone,
      buyr_mail: user.email || '',
      id_info: idInfo,
      trad_time: tradTime,
      tr_code: trCode,
      amt_tot: String(data.amount),
      amt_sup: String(supply),
      amt_svc: '',
      amt_tax: String(tax),
      corp_tax_type: 'TG01',
    };
    const cashFeedbackUrl = this.getWebhookUrl();
    if (cashFeedbackUrl) postData.feedbackurl = cashFeedbackUrl;

    try {
      const result = await this.callPayapp(postData);
      receipt.rawResponse = result;

      if (result.state !== '1') {
        receipt.status = CashReceiptStatus.FAILED;
        await this.receiptRepo.save(receipt);
        throw new BadRequestException(
          result.errorMessage || '현금영수증 발행에 실패했습니다.',
        );
      }

      receipt.cashstno = (result.cashstno as string) || null;
      receipt.cashsturl = (result.cashsturl as string) || null;
      receipt.status = CashReceiptStatus.ISSUED;
      receipt.issuedAt = new Date();
      return await this.receiptRepo.save(receipt);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`Payapp API Error [${postData.cmd}]: ${error.message}`);
      receipt.status = CashReceiptStatus.FAILED;
      receipt.rawResponse = { error: error.message };
      await this.receiptRepo.save(receipt);
      throw new BadRequestException(
        'payapp 통신 중 오류가 발생했습니다: ' + error.message,
      );
    }
  }

  // ── 현금영수증 취소 (cashStCancel) ─────────────────────────────────────────
  async cancelCashReceipt(user: User, receiptId: string) {
    const receipt = await this.receiptRepo.findOneBy({
      id: receiptId,
      userId: user.id,
    });
    if (!receipt)
      throw new NotFoundException('현금영수증을 찾을 수 없습니다.');
    if (receipt.status !== CashReceiptStatus.ISSUED) {
      throw new BadRequestException('취소할 수 없는 상태입니다.');
    }
    if (!receipt.cashstno) {
      throw new BadRequestException('현금영수증 번호가 없어 취소할 수 없습니다.');
    }

    const seller = await this.sellerRepo.findOneBy({ id: receipt.sellerId });
    if (!seller) throw new NotFoundException('판매자 계정을 찾을 수 없습니다.');

    const postData: Record<string, any> = {
      cmd: 'cashStCancel',
      userid: seller.sellerId,
      linkkey: seller.linkKey,
      cashstno: receipt.cashstno,
    };

    try {
      const result = await this.callPayapp(postData);

      if (result.state !== '1') {
        throw new BadRequestException(
          result.errorMessage || '현금영수증 취소에 실패했습니다.',
        );
      }

      receipt.status = CashReceiptStatus.CANCELLED;
      receipt.cancelledAt = new Date();
      receipt.rawResponse = {
        ...(receipt.rawResponse || {}),
        cancel: result,
      };
      return await this.receiptRepo.save(receipt);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`Payapp API Error [${postData.cmd}]: ${error.message}`);
      throw new BadRequestException(
        'payapp 통신 중 오류가 발생했습니다: ' + error.message,
      );
    }
  }

  async listCashReceipts(userId: string) {
    return this.receiptRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  // ── PayApp 웹훅 처리 ──────────────────────────────────────────────────────
  // 페이앱이 결제/취소 상태 변경 시 호출. mul_no + var1(orderId) 기반으로 트랜잭션 동기화.
  async handlePayappWebhook(body: Record<string, any>) {
    this.logger.log(`[PayApp Webhook] received: ${JSON.stringify(body)}`);

    const mulNo = body.mul_no as string | undefined;
    const orderId = body.var1 as string | undefined;
    const payState = body.pay_state as string | undefined;

    if (!mulNo || !payState) {
      this.logger.warn('[PayApp Webhook] mul_no 또는 pay_state 누락');
      return { ok: true, skipped: true };
    }

    const tx = await this.txRepo.findOne({
      where: orderId ? [{ orderId }, { mulNo }] : [{ mulNo }],
    });
    if (!tx) {
      this.logger.warn(`[PayApp Webhook] tx not found: orderId=${orderId} mulNo=${mulNo}`);
      return { ok: true, skipped: true };
    }

    // 멱등성: 동일 pay_state 이미 처리된 경우 skip
    const webhookLog = (tx.rawResponse?.webhooks as any[]) || [];
    if (webhookLog.some((w) => w.pay_state === payState)) {
      this.logger.log(`[PayApp Webhook] duplicate pay_state=${payState}, skip`);
      return { ok: true, skipped: true };
    }
    const newLog = [...webhookLog, { ...body, receivedAt: new Date().toISOString() }];

    // pay_state 매핑 (참조 프로젝트 기준)
    //  4         결제완료
    //  8, 32     요청취소
    //  9, 64     승인취소
    //  70, 71    부분취소
    switch (payState) {
      case '4':
        tx.status = PaymentTransactionStatus.PAID;
        tx.mulNo = tx.mulNo || mulNo;
        if (!tx.paidAt) tx.paidAt = new Date();
        break;
      case '8':
      case '9':
      case '32':
      case '64':
        tx.status = PaymentTransactionStatus.CANCELLED;
        tx.cancelledAmount = tx.amount;
        if (!tx.cancelledAt) tx.cancelledAt = new Date();
        break;
      case '70':
      case '71': {
        const partialAmount = parseInt(String(body.cancelprice || body.price || '0'), 10);
        if (partialAmount > 0) {
          tx.cancelledAmount = Math.min(tx.amount, tx.cancelledAmount + partialAmount);
        }
        tx.status =
          tx.cancelledAmount >= tx.amount
            ? PaymentTransactionStatus.CANCELLED
            : PaymentTransactionStatus.PARTIAL_CANCELLED;
        if (!tx.cancelledAt) tx.cancelledAt = new Date();
        break;
      }
      default:
        this.logger.log(`[PayApp Webhook] 미처리 pay_state=${payState}`);
    }

    tx.rawResponse = { ...(tx.rawResponse || {}), webhooks: newLog };
    await this.txRepo.save(tx);
    return { ok: true };
  }
}
