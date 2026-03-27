import { Controller, Get, Patch, Post, Delete, Body, Session, UnauthorizedException, Param, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity.js';
import { PaymentMethod } from './entities/payment-method.entity.js';
import { ApiKey } from '../admin/entities/api-key.entity.js';
import { ApiExcludeController, ApiTags, ApiOperation } from '@nestjs/swagger';
import { randomBytes } from 'crypto';

@ApiExcludeController()
@Controller('profile')
export class ProfileController {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(PaymentMethod)
    private readonly paymentRepo: Repository<PaymentMethod>,
    @InjectRepository(ApiKey)
    private readonly apiKeyRepo: Repository<ApiKey>,
  ) {}

  private async getUserId(session: Record<string, any>) {
    if (!session.userId) throw new UnauthorizedException('로그인이 필요합니다.');
    return session.userId;
  }

  @Get('me')
  @ApiOperation({ summary: '내 정보 상세 조회' })
  async getMe(@Session() session: Record<string, any>) {
    const userId = await this.getUserId(session);
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    return user;
  }

  @Patch('me')
  @ApiOperation({ summary: '내 정보 수정' })
  async updateMe(
    @Session() session: Record<string, any>,
    @Body() dto: Partial<Pick<User, 'name' | 'company'>>,
  ) {
    const userId = await this.getUserId(session);
    await this.userRepo.update(userId, dto);
    return this.userRepo.findOneBy({ id: userId });
  }

  // ── API Key Management ──────────────────────────────────────────────────

  @Get('api-keys')
  @ApiOperation({ summary: '내 API 키 목록' })
  async getApiKeys(@Session() session: Record<string, any>) {
    const userId = await this.getUserId(session);
    return this.apiKeyRepo.find({ where: { userId } });
  }

  @Post('api-keys')
  @ApiOperation({ summary: 'API 키 생성' })
  async createApiKey(
    @Session() session: Record<string, any>,
    @Body('name') name: string,
  ) {
    const userId = await this.getUserId(session);
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
    @Session() session: Record<string, any>,
    @Param('id') id: number,
    @Body() dto: Partial<Pick<ApiKey, 'name' | 'isActive' | 'allowedServices'>>,
  ) {
    const userId = await this.getUserId(session);
    const apiKey = await this.apiKeyRepo.findOneBy({ id, userId });
    if (!apiKey) throw new NotFoundException('API 키를 찾을 수 없습니다.');
    
    Object.assign(apiKey, dto);
    return this.apiKeyRepo.save(apiKey);
  }

  @Delete('api-keys/:id')
  @ApiOperation({ summary: 'API 키 삭제' })
  async deleteApiKey(
    @Session() session: Record<string, any>,
    @Param('id') id: number,
  ) {
    const userId = await this.getUserId(session);
    const apiKey = await this.apiKeyRepo.findOneBy({ id, userId });
    if (!apiKey) throw new NotFoundException('API 키를 찾을 수 없습니다.');
    await this.apiKeyRepo.remove(apiKey);
    return { success: true };
  }

  // ── Payment Registration ────────────────────────────────────────────────

  @Get('payments')
  @ApiOperation({ summary: '내 결제 수단 목록' })
  async getPayments(@Session() session: Record<string, any>) {
    const userId = await this.getUserId(session);
    return this.paymentRepo.find({ where: { userId, isActive: true } });
  }

  @Post('payments')
  @ApiOperation({ summary: '결제 수단 등록' })
  async registerPayment(
    @Session() session: Record<string, any>,
    @Body() body: { cardNo: string; cardName: string; billingKey: string },
  ) {
    const userId = await this.getUserId(session);
    const payment = this.paymentRepo.create({
      userId,
      cardNo: body.cardNo,
      cardName: body.cardName,
      billingKey: body.billingKey,
      isActive: true,
    });
    return this.paymentRepo.save(payment);
  }

  @Delete('payments/:id')
  @ApiOperation({ summary: '결제 수단 삭제' })
  async deletePayment(
    @Session() session: Record<string, any>,
    @Param('id') id: number,
  ) {
    const userId = await this.getUserId(session);
    const payment = await this.paymentRepo.findOneBy({ id, userId });
    if (!payment) throw new NotFoundException('결제 수단을 찾을 수 없습니다.');
    payment.isActive = false; // Soft delete
    await this.paymentRepo.save(payment);
    return { success: true };
  }
}
