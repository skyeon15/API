import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  ServiceWebhook,
  ServiceWebhookEvent,
} from './entities/service-webhook.entity.js';
import { PaymentTransaction } from './entities/payment-transaction.entity.js';

/** 재시도 간격(ms). 첫 시도는 즉시 */
const RETRY_DELAYS_MS = [0, 5_000, 30_000];
const REQUEST_TIMEOUT_MS = 10_000;

@Injectable()
export class ServiceWebhookService {
  private readonly logger = new Logger(ServiceWebhookService.name);

  constructor(
    @InjectRepository(ServiceWebhook)
    private readonly webhookRepo: Repository<ServiceWebhook>,
  ) {}

  static generateSecret(): string {
    return `whsec_${randomBytes(32).toString('hex')}`;
  }

  /**
   * 서명 문자열을 만든다. Stripe 와 같은 모양(`t=<초>,v1=<hex>`)이고
   * 서명 대상은 `${t}.${body}` 다 — 타임스탬프를 빼면 지난 요청을 그대로 되쏠 수 있다.
   */
  static sign(secret: string, body: string, timestampSec: number): string {
    const mac = createHmac('sha256', secret)
      .update(`${timestampSec}.${body}`)
      .digest('hex');
    return `t=${timestampSec},v1=${mac}`;
  }

  /** 받는 쪽이 쓸 검증기. 플랫폼 자신은 안 쓰지만 연동 문서의 기준 구현이다 */
  static verify(
    secret: string,
    body: string,
    header: string,
    toleranceSec = 300,
  ): boolean {
    const parts = Object.fromEntries(
      header.split(',').map((kv) => kv.split('=').map((s) => s.trim()) as [string, string]),
    );
    const t = Number(parts.t);
    if (!Number.isFinite(t)) return false;
    if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
    const expected = createHmac('sha256', secret)
      .update(`${t}.${body}`)
      .digest('hex');
    const got = Buffer.from(String(parts.v1 ?? ''), 'utf8');
    const want = Buffer.from(expected, 'utf8');
    return got.length === want.length && timingSafeEqual(got, want);
  }

  /**
   * 거래 상태 변화를 그 서비스에 알린다.
   *
   * 🔴 **던지지 않는다.** 부르는 쪽은 Stripe 웹훅 처리 한가운데이고, 여기서 예외가 나면
   *    플랫폼이 Stripe 에 5xx 를 돌려줘 Stripe 가 같은 이벤트를 다시 쏜다 —
   *    남의 서버가 죽은 것 때문에 우리 동기화가 되풀이된다.
   * 🔴 **기다리지도 않는다.** 배달은 뒤로 미루고 즉시 돌아온다.
   */
  dispatch(tx: PaymentTransaction, event: ServiceWebhookEvent): void {
    void this.deliver(tx, event).catch((err) =>
      this.logger.error(`[ServiceWebhook] 배달 실패(무시): ${err?.message}`),
    );
  }

  private async deliver(
    tx: PaymentTransaction,
    event: ServiceWebhookEvent,
  ): Promise<void> {
    const hooks = await this.webhookRepo.findBy({
      userId: tx.userId,
      isActive: true,
    });
    // events 가 빈 배열이면 전부 받겠다는 뜻이다
    const targets = hooks.filter(
      (h) => h.events.length === 0 || h.events.includes(event),
    );
    if (!targets.length) return;

    const body = JSON.stringify({
      id: `evt_${tx.id}_${event}`,
      event,
      createdAt: new Date().toISOString(),
      data: {
        transactionId: tx.id,
        orderId: tx.orderId,
        externalOrderId: tx.externalOrderId,
        externalUserId: tx.externalUserId,
        provider: tx.provider,
        status: tx.status,
        amount: tx.amount,
        cancelledAmount: tx.cancelledAmount,
        currency: tx.currency,
        goodName: tx.goodName,
        paidAt: tx.paidAt,
        receiptUrl: tx.receiptUrl,
        // 차지백 이벤트에만 실린다. 서비스가 «왜 내려갔나»를 사람 말로 적을 수 있어야 하고,
        // `status`(warning_needs_response·lost·won…)가 곧 판정이다.
        ...(tx.rawResponse?.dispute
          ? { dispute: tx.rawResponse.dispute as Record<string, unknown> }
          : {}),
      },
    });

    await Promise.all(targets.map((hook) => this.post(hook, body, event)));
  }

  private async post(
    hook: ServiceWebhook,
    body: string,
    event: string,
  ): Promise<void> {
    let lastError: string | null = null;
    let lastStatus: number | null = null;

    for (const delay of RETRY_DELAYS_MS) {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      const timestampSec = Math.floor(Date.now() / 1000);
      try {
        const res = await fetch(hook.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-pds-event': event,
            'x-pds-signature': ServiceWebhookService.sign(
              hook.secret,
              body,
              timestampSec,
            ),
          },
          body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        lastStatus = res.status;
        if (res.ok) {
          await this.webhookRepo.update(hook.id, {
            lastStatus: res.status,
            lastError: null,
            lastDeliveredAt: new Date(),
          });
          return;
        }
        lastError = `HTTP ${res.status}`;
      } catch (err: any) {
        lastError = err?.message || String(err);
      }
      this.logger.warn(
        `[ServiceWebhook] ${event} → ${hook.url} 실패: ${lastError}`,
      );
    }

    await this.webhookRepo.update(hook.id, {
      lastStatus,
      lastError,
      lastDeliveredAt: new Date(),
    });
  }
}
