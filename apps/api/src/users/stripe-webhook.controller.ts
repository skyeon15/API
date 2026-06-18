import {
  Controller,
  Post,
  Headers,
  HttpCode,
  Logger,
  Req,
  BadRequestException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiExcludeController, ApiOperation } from '@nestjs/swagger';
import { StripeService } from './stripe.service.js';

@ApiExcludeController()
@Controller('webhooks/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(private readonly stripeService: StripeService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Stripe 결제 상태 변경 웹훅' })
  async handle(
    @Req() req: RawBodyRequest<any>,
    @Headers('stripe-signature') signature: string,
  ) {
    // 서명검증에는 가공되지 않은 원본 바디(rawBody)가 필요 (main.ts에서 rawBody:true 설정)
    if (!req.rawBody) {
      throw new BadRequestException('원본 요청 바디를 읽을 수 없습니다.');
    }
    if (!signature) {
      throw new BadRequestException('stripe-signature 헤더가 없습니다.');
    }
    try {
      return await this.stripeService.handleWebhook(req.rawBody, signature);
    } catch (err: any) {
      this.logger.error(`[Stripe Webhook] error: ${err?.message}`);
      throw err;
    }
  }
}
