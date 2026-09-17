import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKeyOrSessionGuard } from '../common/guards/api-key-or-session.guard.js';
import { Service } from '../common/decorators/service.decorator.js';
import { StripeService } from './stripe.service.js';
import { ServiceWebhookService } from './service-webhook.service.js';
import {
  ServiceWebhook,
  SERVICE_WEBHOOK_EVENTS,
} from './entities/service-webhook.entity.js';
import { PaymentTransaction } from './entities/payment-transaction.entity.js';
import {
  ChargeServiceCardDto,
  CreateServicePaymentIntentDto,
  EnsureServiceCustomerDto,
  RegisterServiceCardDto,
  UpsertServiceWebhookDto,
} from './dto/service-stripe.dto.js';

/**
 * 연동 서비스가 **자기 손님**의 Stripe 결제를 다루는 창구.
 *
 * `/profile/stripe/*` 와 무엇이 다른가 — 저기는 «내 카드를 내가» 다루는 곳이라
 * 카드가 전부 **API 키 소유자 한 명의 Customer** 에 붙는다. 그게 CLAUDE.md 가
 * «금지 패턴»으로 못박은 그것이고, 그래서 최종 사용자 빌링은 저 길로 못 간다.
 * 여기서는 `externalUserId` 마다 Customer 를 따로 세운다(`service_customers`).
 *
 * 자격은 하나다 — **서비스 API 키**. 최종 사용자는 플랫폼 계정이 없으므로
 * (`/sso/payments` 와 달리) 사용자 토큰이라는 것이 아예 존재하지 않는다.
 * 대신 서비스가 자기 손님을 인증했다고 **믿는다** — 그 대가로 카드는
 * `serviceCustomerId` 로 갈려 있어 남의 서비스 손님에게는 닿지 않는다.
 */
@ApiTags('결제')
@ApiBearerAuth('api-key')
@UseGuards(ApiKeyOrSessionGuard)
@Service('payment')
@Controller('service/stripe')
export class ServiceStripeController {
  constructor(
    private readonly stripeService: StripeService,
    @InjectRepository(ServiceWebhook)
    private readonly webhookRepo: Repository<ServiceWebhook>,
    @InjectRepository(PaymentTransaction)
    private readonly txRepo: Repository<PaymentTransaction>,
  ) {}

  /** 호출자 = 서비스. 결제 귀속·정산이 계속 이 사람 앞으로 간다 */
  private serviceUserId(req: any): string {
    const userId = req['userId'];
    if (!userId) throw new UnauthorizedException('API 키가 필요합니다.');
    return userId;
  }

  // ── 손님 ────────────────────────────────────────────────────────────────

  @Post('customers')
  @ApiOperation({ summary: '서비스 손님 등록(있으면 그대로 반환)' })
  async ensureCustomer(@Req() req: any, @Body() body: EnsureServiceCustomerDto) {
    if (!body?.externalUserId) {
      throw new BadRequestException('externalUserId 가 필요합니다.');
    }
    const sc = await this.stripeService.ensureServiceCustomer(
      this.serviceUserId(req),
      body.externalUserId,
      { label: body.label, email: body.email, name: body.name },
    );
    return {
      externalUserId: sc.externalUserId,
      customerId: sc.stripeCustomerId,
      label: sc.label,
    };
  }

  // ── 카드 저장 (정기결제의 준비) ──────────────────────────────────────────

  @Post('setup-intent')
  @ApiOperation({ summary: '손님 카드 저장용 SetupIntent 발급' })
  async createSetupIntent(
    @Req() req: any,
    @Body() body: EnsureServiceCustomerDto,
  ) {
    if (!body?.externalUserId) {
      throw new BadRequestException('externalUserId 가 필요합니다.');
    }
    return this.stripeService.createServiceSetupIntent(
      this.serviceUserId(req),
      body.externalUserId,
      { label: body.label, email: body.email, name: body.name },
    );
  }

  @Post('payment-methods')
  @ApiOperation({ summary: '손님 카드 저장 확정(SetupIntent 확정 직후)' })
  async registerCard(@Req() req: any, @Body() body: RegisterServiceCardDto) {
    if (!body?.externalUserId || !body?.setupIntentId) {
      throw new BadRequestException('필수 항목이 누락되었습니다.');
    }
    return this.stripeService.registerServiceCard(
      this.serviceUserId(req),
      body.externalUserId,
      body.setupIntentId,
    );
  }

  @Get('payment-methods')
  @ApiOperation({ summary: '손님이 저장해 둔 카드 목록' })
  async listCards(
    @Req() req: any,
    @Query('externalUserId') externalUserId: string,
  ) {
    if (!externalUserId) {
      throw new BadRequestException('externalUserId 가 필요합니다.');
    }
    return this.stripeService.listServiceCards(
      this.serviceUserId(req),
      externalUserId,
    );
  }

  @Delete('payment-methods/:id')
  @ApiOperation({ summary: '손님 카드 해지' })
  async removeCard(
    @Req() req: any,
    @Param('id') id: string,
    @Query('externalUserId') externalUserId: string,
  ) {
    if (!externalUserId) {
      throw new BadRequestException('externalUserId 가 필요합니다.');
    }
    return this.stripeService.removeServiceCard(
      this.serviceUserId(req),
      externalUserId,
      id,
    );
  }

  // ── 결제 ────────────────────────────────────────────────────────────────

  @Post('payment-intent')
  @ApiOperation({ summary: '일회성 결제용 PaymentIntent 발급' })
  async createPaymentIntent(
    @Req() req: any,
    @Body() body: CreateServicePaymentIntentDto,
  ) {
    if (!body?.amount || !body?.goodName) {
      throw new BadRequestException('필수 항목이 누락되었습니다.');
    }
    return this.stripeService.createServicePaymentIntent(
      this.serviceUserId(req),
      body,
    );
  }

  @Post('charge')
  @ApiOperation({ summary: '저장 카드로 청구(정기결제)' })
  async charge(@Req() req: any, @Body() body: ChargeServiceCardDto) {
    if (!body?.externalUserId || !body?.paymentMethodId || !body?.amount || !body?.goodName) {
      throw new BadRequestException('필수 항목이 누락되었습니다.');
    }
    return this.stripeService.chargeServiceCard(this.serviceUserId(req), body);
  }

  @Get('transactions')
  @ApiOperation({ summary: '이 서비스의 결제 내역(손님·주문번호로 거르기)' })
  async transactions(
    @Req() req: any,
    @Query('externalUserId') externalUserId?: string,
    @Query('externalOrderId') externalOrderId?: string,
  ) {
    return this.txRepo.find({
      where: {
        userId: this.serviceUserId(req),
        ...(externalUserId ? { externalUserId } : {}),
        ...(externalOrderId ? { externalOrderId } : {}),
      },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  // ── 결과를 되돌려 받을 주소 ─────────────────────────────────────────────
  //
  // 🔴 시크릿은 **만든 직후 한 번만** 평문으로 나간다. 목록에는 안 실린다 —
  //    서명 검증의 근거라, 조회로 다시 꺼낼 수 있으면 키로서 값이 없다.

  @Get('webhooks')
  @ApiOperation({ summary: '등록한 콜백 주소 목록' })
  async listWebhooks(@Req() req: any) {
    const rows = await this.webhookRepo.find({
      where: { userId: this.serviceUserId(req) },
      order: { createdAt: 'DESC' },
    });
    return rows.map(({ secret: _secret, ...rest }) => rest);
  }

  @Post('webhooks')
  @ApiOperation({ summary: '콜백 주소 등록(시크릿은 이때만 보여준다)' })
  async createWebhook(@Req() req: any, @Body() body: UpsertServiceWebhookDto) {
    const url = body?.url?.trim();
    if (!url) throw new BadRequestException('url 이 필요합니다.');
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('url 이 올바르지 않습니다.');
    }
    // 🔴 http 를 허용하지 않는다 — 서명이 있어도 본문(금액·후원자)이 평문으로 흐른다.
    if (parsed.protocol !== 'https:') {
      throw new BadRequestException('콜백 주소는 https 여야 합니다.');
    }
    const events = (body.events ?? []).filter((e) =>
      (SERVICE_WEBHOOK_EVENTS as readonly string[]).includes(e),
    );
    if ((body.events?.length ?? 0) !== events.length) {
      throw new BadRequestException(
        `events 는 ${SERVICE_WEBHOOK_EVENTS.join(', ')} 중에서만 고를 수 있습니다.`,
      );
    }

    const secret = ServiceWebhookService.generateSecret();
    const row = this.webhookRepo.create({
      userId: this.serviceUserId(req),
      url: parsed.toString(),
      secret,
      events,
      isActive: body.isActive ?? true,
    });
    const saved = await this.webhookRepo.save(row);
    return { ...saved, secret };
  }

  @Delete('webhooks/:id')
  @ApiOperation({ summary: '콜백 주소 삭제' })
  async removeWebhook(@Req() req: any, @Param('id') id: string) {
    const row = await this.webhookRepo.findOneBy({
      id,
      userId: this.serviceUserId(req),
    });
    if (!row) throw new NotFoundException('등록된 콜백 주소가 없습니다.');
    await this.webhookRepo.remove(row);
    return { success: true };
  }
}
