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
import { ApiKey } from '../admin/entities/api-key.entity.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ApiExcludeController, ApiTags, ApiOperation } from '@nestjs/swagger';
import { randomBytes } from 'crypto';
import { PaymentService } from './payment.service.js';

@ApiExcludeController()
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(PaymentMethod)
    private readonly paymentRepo: Repository<PaymentMethod>,
    @InjectRepository(PayappSeller)
    private readonly sellerRepo: Repository<PayappSeller>,
    @InjectRepository(ApiKey)
    private readonly apiKeyRepo: Repository<ApiKey>,
    private readonly paymentService: PaymentService,
  ) {}

  private getUserId(req: any): string {
    const userId = req['userId'];
    if (!userId) throw new UnauthorizedException('로그인이 필요합니다.');
    return userId;
  }

  @Get('me')
  @ApiOperation({ summary: '내 정보 상세 조회' })
  async getMe(@Req() req: any) {
    const userId = this.getUserId(req);
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    return user;
  }

  @Patch('me')
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
  @ApiOperation({ summary: '내 API 키 목록' })
  async getApiKeys(@Req() req: any) {
    const userId = this.getUserId(req);
    return this.apiKeyRepo.find({ where: { userId } });
  }

  @Post('api-keys')
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
      cardNo: string;
      expMonth: string;
      expYear: string;
      cardPw: string;
      buyerAuthNo: string;
    },
  ) {
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
}
