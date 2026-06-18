import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  UnauthorizedException,
  Param,
  NotFoundException,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity.js';
import { PaymentMethod } from './entities/payment-method.entity.js';
import { PayappSeller } from './entities/payapp-seller.entity.js';
import { PaymentTransaction } from './entities/payment-transaction.entity.js';
import {
  CashReceipt,
  CashReceiptType,
} from './entities/cash-receipt.entity.js';
import { ApiKey } from '../admin/entities/api-key.entity.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ApiKeyOrSessionGuard } from '../common/guards/api-key-or-session.guard.js';
import { Service } from '../common/decorators/service.decorator.js';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiExcludeEndpoint,
} from '@nestjs/swagger';
import { randomBytes } from 'crypto';
import { PaymentService } from './payment.service.js';
import { StripeService } from './stripe.service.js';

// 판매자·결제 관련 엔드포인트는 세션 쿠키 또는 API 키(Bearer)로 호출 가능.
// 단, 'me'·'api-keys'(아래 @ApiExcludeEndpoint/JwtAuthGuard)는 세션 쿠키 전용으로 유지.
@ApiTags('결제')
@ApiBearerAuth('api-key')
@UseGuards(ApiKeyOrSessionGuard)
@Service('payment')
@Controller('profile')
export class ProfileController {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(PaymentMethod)
    private readonly paymentRepo: Repository<PaymentMethod>,
    @InjectRepository(PayappSeller)
    private readonly sellerRepo: Repository<PayappSeller>,
    @InjectRepository(PaymentTransaction)
    private readonly txRepo: Repository<PaymentTransaction>,
    @InjectRepository(CashReceipt)
    private readonly receiptRepo: Repository<CashReceipt>,
    @InjectRepository(ApiKey)
    private readonly apiKeyRepo: Repository<ApiKey>,
    private readonly paymentService: PaymentService,
    private readonly stripeService: StripeService,
  ) {}

  private getUserId(req: any): string {
    const userId = req['userId'];
    if (!userId) throw new UnauthorizedException('로그인이 필요합니다.');
    return userId;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: '내 정보 상세 조회' })
  async getMe(@Req() req: any) {
    const userId = this.getUserId(req);
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    return user;
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: '내 정보 수정' })
  async updateMe(
    @Req() req: any,
    @Body() dto: Partial<Pick<User, 'name' | 'company'>>,
  ) {
    const userId = this.getUserId(req);
    await this.userRepo.update(userId, dto);
    return this.userRepo.findOneBy({ id: userId });
  }

  // ── API Key Management ──────────────────────────────────────────────────

  @Get('api-keys')
  @UseGuards(JwtAuthGuard)
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: '내 API 키 목록' })
  async getApiKeys(@Req() req: any) {
    const userId = this.getUserId(req);
    return this.apiKeyRepo.find({ where: { userId } });
  }

  @Post('api-keys')
  @UseGuards(JwtAuthGuard)
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'API 키 생성' })
  async createApiKey(@Req() req: any, @Body('name') name: string) {
    const userId = this.getUserId(req);
    const key = randomBytes(32).toString('hex');
    const apiKey = this.apiKeyRepo.create({
      userId,
      name: name || 'Default Key',
      key,
      isActive: true,
      allowedServices: [],
    });
    return this.apiKeyRepo.save(apiKey);
  }

  @Patch('api-keys/:id')
  @UseGuards(JwtAuthGuard)
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'API 키 수정' })
  async updateApiKey(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: Partial<Pick<ApiKey, 'name' | 'isActive' | 'allowedServices'>>,
  ) {
    const userId = this.getUserId(req);
    const apiKey = await this.apiKeyRepo.findOneBy({ id, userId });
    if (!apiKey) throw new NotFoundException('API 키를 찾을 수 없습니다.');

    Object.assign(apiKey, dto);
    return this.apiKeyRepo.save(apiKey);
  }

  @Delete('api-keys/:id')
  @UseGuards(JwtAuthGuard)
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'API 키 삭제' })
  async deleteApiKey(@Req() req: any, @Param('id') id: string) {
    const userId = this.getUserId(req);
    const apiKey = await this.apiKeyRepo.findOneBy({ id, userId });
    if (!apiKey) throw new NotFoundException('API 키를 찾을 수 없습니다.');
    await this.apiKeyRepo.remove(apiKey);
    return { success: true };
  }

  // ── Seller Management ──────────────────────────────────────────────────

  @Get('sellers')
  @ApiOperation({ summary: '내 판매자 계정 목록' })
  async getSellers(@Req() req: any) {
    const userId = this.getUserId(req);
    return this.sellerRepo.find({ where: { userId, isActive: true } });
  }

  @Post('sellers')
  @ApiOperation({ summary: '판매자 계정 등록' })
  async registerSeller(@Req() req: any, @Body() body: any) {
    const userId = this.getUserId(req);
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    return this.paymentService.registerSeller(user, body);
  }

  @Post('sellers/check-id')
  @ApiOperation({ summary: '판매자 아이디 중복 확인' })
  async checkSellerId(@Body('sellerId') sellerId: string) {
    if (!sellerId) throw new BadRequestException('아이디를 입력해주세요.');
    return this.paymentService.checkSellerId(sellerId);
  }

  @Delete('sellers/:id')
  @ApiOperation({ summary: '판매자 계정 삭제' })
  async deleteSeller(@Req() req: any, @Param('id') id: string) {
    const userId = this.getUserId(req);
    const seller = await this.sellerRepo.findOneBy({ id, userId });
    if (!seller) throw new NotFoundException('판매자 계정을 찾을 수 없습니다.');
    seller.isActive = false;
    await this.sellerRepo.save(seller);
    return { success: true };
  }

  // ── Payment Registration ────────────────────────────────────────────────

  @Get('payments')
  @ApiOperation({ summary: '내 결제 수단 목록' })
  async getPayments(@Req() req: any) {
    const userId = this.getUserId(req);
    return this.paymentRepo.find({ where: { userId, isActive: true } });
  }

  @Post('payments')
  @ApiOperation({ summary: '결제 수단 등록' })
  async registerPayment(
    @Req() req: any,
    @Body()
    body: {
      sellerId: string;
      cardNo: string;
      expMonth: string;
      expYear: string;
      cardPw: string;
      buyerAuthNo: string;
    },
  ) {
    if (!body?.sellerId) {
      throw new BadRequestException('판매자 계정을 선택해주세요.');
    }
    const userId = this.getUserId(req);
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');

    return this.paymentService.registerCard(user, body);
  }

  @Patch('payments/:id')
  @ApiOperation({ summary: '결제 수단 정보 수정' })
  async updatePayment(
    @Req() req: any,
    @Param('id') id: string,
    @Body('cardName') cardName: string,
  ) {
    const userId = this.getUserId(req);
    const payment = await this.paymentRepo.findOneBy({ id, userId });
    if (!payment) throw new NotFoundException('결제 수단을 찾을 수 없습니다.');

    payment.cardName = cardName;
    return this.paymentRepo.save(payment);
  }

  @Delete('payments/:id')
  @ApiOperation({ summary: '결제 수단 삭제' })
  async deletePayment(@Req() req: any, @Param('id') id: string) {
    const userId = this.getUserId(req);
    const payment = await this.paymentRepo.findOneBy({ id, userId });
    if (!payment) throw new NotFoundException('결제 수단을 찾을 수 없습니다.');

    // payapp에서도 삭제 처리
    await this.paymentService.deleteCard(payment);

    payment.isActive = false;
    await this.paymentRepo.save(payment);
    return { success: true };
  }

  // ── Payment Transactions ────────────────────────────────────────────────

  @Get('payments/transactions')
  @ApiOperation({ summary: '내 결제 내역 조회' })
  async getTransactions(@Req() req: any) {
    const userId = this.getUserId(req);
    return this.paymentService.listTransactions(userId);
  }

  @Post('payments/charge')
  @ApiOperation({ summary: '등록된 카드로 결제' })
  async chargeCard(
    @Req() req: any,
    @Body()
    body: {
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
    const userId = this.getUserId(req);
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    if (!body?.paymentMethodId || !body?.sellerId || !body?.goodName) {
      throw new BadRequestException('필수 항목이 누락되었습니다.');
    }
    return this.paymentService.chargeCard(user, body);
  }

  @Post('payments/transactions/:id/cancel')
  @ApiOperation({ summary: '결제 취소 (부분/전체)' })
  async cancelTransaction(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { amount?: number; memo?: string },
  ) {
    const userId = this.getUserId(req);
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    return this.paymentService.cancelTransaction(user, id, body || {});
  }

  // ── Cash Receipts ───────────────────────────────────────────────────────

  @Get('cash-receipts')
  @ApiOperation({ summary: '내 현금영수증 목록' })
  async getCashReceipts(@Req() req: any) {
    const userId = this.getUserId(req);
    return this.paymentService.listCashReceipts(userId);
  }

  @Post('cash-receipts')
  @ApiOperation({ summary: '현금영수증 발급' })
  async issueCashReceipt(
    @Req() req: any,
    @Body()
    body: {
      sellerId: string;
      type: CashReceiptType;
      buyerName: string;
      idInfo: string;
      goodName: string;
      amount: number;
      transactionId?: string;
    },
  ) {
    const userId = this.getUserId(req);
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    if (
      !body?.sellerId ||
      !body?.type ||
      !body?.buyerName ||
      !body?.idInfo ||
      !body?.goodName ||
      !body?.amount
    ) {
      throw new BadRequestException('필수 항목이 누락되었습니다.');
    }
    return this.paymentService.issueCashReceipt(user, body);
  }

  @Post('cash-receipts/:id/cancel')
  @ApiOperation({ summary: '현금영수증 취소' })
  async cancelCashReceipt(@Req() req: any, @Param('id') id: string) {
    const userId = this.getUserId(req);
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    return this.paymentService.cancelCashReceipt(user, id);
  }

  // ── Stripe (MoR) ──────────────────────────────────────────────────────────

  private async requireUser(req: any): Promise<User> {
    const userId = this.getUserId(req);
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    return user;
  }

  @Post('stripe/setup-intent')
  @ApiOperation({ summary: 'Stripe 카드 저장용 SetupIntent 발급' })
  async createStripeSetupIntent(@Req() req: any) {
    const user = await this.requireUser(req);
    return this.stripeService.createSetupIntent(user);
  }

  @Post('stripe/payment-methods')
  @ApiOperation({ summary: 'Stripe 카드 저장 확정(SetupIntent 확정 직후)' })
  async registerStripeCard(
    @Req() req: any,
    @Body('setupIntentId') setupIntentId: string,
  ) {
    const user = await this.requireUser(req);
    if (!setupIntentId) {
      throw new BadRequestException('setupIntentId가 필요합니다.');
    }
    return this.stripeService.registerSavedCard(user, setupIntentId);
  }

  @Post('stripe/payment-intent')
  @ApiOperation({ summary: 'Stripe 일회성 결제용 PaymentIntent 발급' })
  async createStripePaymentIntent(
    @Req() req: any,
    @Body()
    body: {
      amount: number;
      currency?: string;
      goodName: string;
      savePaymentMethod?: boolean;
    },
  ) {
    const user = await this.requireUser(req);
    if (!body?.amount || !body?.goodName) {
      throw new BadRequestException('필수 항목이 누락되었습니다.');
    }
    return this.stripeService.createPaymentIntent(user, body);
  }

  @Post('stripe/charge')
  @ApiOperation({ summary: 'Stripe 저장 카드로 빌링 결제(off_session)' })
  async chargeStripe(
    @Req() req: any,
    @Body()
    body: {
      paymentMethodId: string;
      amount: number;
      currency?: string;
      goodName: string;
      memo?: string;
    },
  ) {
    const user = await this.requireUser(req);
    if (!body?.paymentMethodId || !body?.amount || !body?.goodName) {
      throw new BadRequestException('필수 항목이 누락되었습니다.');
    }
    return this.stripeService.chargeSavedCard(user, body);
  }

  @Post('stripe/transactions/:id/refund')
  @ApiOperation({ summary: 'Stripe 결제 환불(부분/전체)' })
  async refundStripe(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { amount?: number; reason?: string },
  ) {
    const user = await this.requireUser(req);
    return this.stripeService.refundTransaction(user, id, body || {});
  }
}
