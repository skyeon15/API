import { Controller, Post, Body, HttpCode, Logger, Req } from '@nestjs/common';
import { ApiExcludeController, ApiOperation } from '@nestjs/swagger';
import { PaymentService } from './payment.service.js';

@ApiExcludeController()
@Controller('webhooks/payapp')
export class PayappWebhookController {
  private readonly logger = new Logger(PayappWebhookController.name);

  constructor(private readonly paymentService: PaymentService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: '페이앱 결제 상태 변경 웹훅' })
  async handle(@Req() req: any, @Body() body: any) {
    // 페이앱은 application/x-www-form-urlencoded 로 전송 → NestJS가 자동 파싱
    // 일부 환경에선 query 로 떨어질 수 있어 둘 다 머지
    const merged = { ...(req.query || {}), ...(body || {}) };
    try {
      await this.paymentService.handlePayappWebhook(merged);
    } catch (err: any) {
      this.logger.error(`[PayApp Webhook] error: ${err?.message}`);
    }
    // 페이앱은 200 OK + body 'SUCCESS' 또는 'OK' 기대
    return 'SUCCESS';
  }
}
