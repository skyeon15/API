import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SsoScopes } from '../common/decorators/sso-scope.decorator.js';
import { SsoScopeGuard } from '../common/guards/sso-scope.guard.js';
import { CreateStripePaymentIntentDto } from './dto/profile.dto.js';
import {
  PaymentProvider,
  PaymentTransaction,
} from './entities/payment-transaction.entity.js';
import { User } from './entities/user.entity.js';
import { StripeService } from './stripe.service.js';

type SsoStripeRequest = { userId?: string; ssoClientId?: string };

/** SSO 사용자의 일회성 Stripe 결제. 구매자 귀속과 기존 Stripe Customer를 유지한다. */
@ApiTags('통합 로그인(SSO)')
@ApiBearerAuth('sso-token')
@UseGuards(SsoScopeGuard)
@SsoScopes('payment')
@Controller('sso/stripe')
export class SsoStripeController {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(PaymentTransaction)
    private readonly txRepo: Repository<PaymentTransaction>,
    private readonly stripeService: StripeService,
  ) {}

  private getUserId(req: SsoStripeRequest): string {
    if (
      typeof req.userId !== 'string' ||
      !req.userId ||
      typeof req.ssoClientId !== 'string' ||
      !req.ssoClientId
    ) {
      throw new UnauthorizedException('SSO 사용자와 서비스 정보가 필요합니다.');
    }
    return req.userId;
  }

  @Post('payment-intent')
  @ApiOperation({
    summary: 'SSO 구매자의 Stripe 일회성 결제 준비',
    description:
      'payment scope가 필요합니다. externalOrderId는 필수이며 카드를 저장하지 않습니다. 결제 완료는 웹훅 처리 후 거래 조회로 확인합니다.',
  })
  async createPaymentIntent(
    @Req() req: SsoStripeRequest,
    @Body() body: CreateStripePaymentIntentDto,
  ) {
    const userId = this.getUserId(req);
    if (!Number.isSafeInteger(body?.amount) || body.amount <= 0) {
      throw new BadRequestException('결제 금액이 유효하지 않습니다.');
    }
    if (
      typeof body.goodName !== 'string' ||
      !body.goodName.trim() ||
      typeof body.externalOrderId !== 'string' ||
      !body.externalOrderId.trim()
    ) {
      throw new BadRequestException('상품명과 서비스측 주문번호가 필요합니다.');
    }
    if (
      body.currency !== undefined &&
      (typeof body.currency !== 'string' ||
        !/^[a-z]{3}$/i.test(body.currency.trim()))
    ) {
      throw new BadRequestException('통화 코드가 유효하지 않습니다.');
    }
    if (
      body.savePaymentMethod !== undefined &&
      body.savePaymentMethod !== false
    ) {
      throw new BadRequestException(
        '일회성 결제에서는 카드를 저장할 수 없습니다.',
      );
    }
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');

    return this.stripeService.createPaymentIntent(user, {
      amount: body.amount,
      currency: body.currency,
      goodName: body.goodName.trim(),
      externalOrderId: body.externalOrderId.trim(),
      savePaymentMethod: false,
    });
  }

  @Get('transactions')
  @ApiOperation({ summary: '서비스측 주문번호로 내 Stripe 결제 조회' })
  async listTransactions(
    @Req() req: SsoStripeRequest,
    @Query('externalOrderId') externalOrderId: string,
  ) {
    const userId = this.getUserId(req);
    if (typeof externalOrderId !== 'string' || !externalOrderId.trim()) {
      throw new BadRequestException('서비스측 주문번호가 필요합니다.');
    }
    return this.txRepo.find({
      where: {
        userId,
        provider: PaymentProvider.STRIPE,
        externalOrderId: externalOrderId.trim(),
      },
      // 결제 상태 확인에 필요한 정보만 공개한다. 원본 PG 응답은 보내지 않는다.
      select: [
        'id',
        'orderId',
        'externalOrderId',
        'provider',
        'status',
        'amount',
        'currency',
        'cancelledAmount',
        'receiptUrl',
        'paidAt',
      ],
      order: { createdAt: 'DESC' },
    });
  }
}
