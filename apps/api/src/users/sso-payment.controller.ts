import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OauthClient } from '../auth/entities/oauth-client.entity.js';
import { ApiKeyOrSessionGuard } from '../common/guards/api-key-or-session.guard.js';
import { SsoScopeGuard } from '../common/guards/sso-scope.guard.js';
import { SsoScopes } from '../common/decorators/sso-scope.decorator.js';
import { Service } from '../common/decorators/service.decorator.js';
import { PayappSeller } from './entities/payapp-seller.entity.js';
import { PaymentMethod } from './entities/payment-method.entity.js';
import { User } from './entities/user.entity.js';
import { PaymentService } from './payment.service.js';
import {
  ChargeClientCardDto,
  RegisterClientCardDto,
} from './dto/sso-payment.dto.js';

/**
 * 연동 서비스의 **정기결제**(빌링키) 창구.
 *
 * `/profile/payments` 와 무엇이 다른가 — 저기는 «내 카드를 **내가 소유한** 판매자 계정에»
 * 등록하는 곳이다. 연동 서비스의 고객은 우리 판매자 계정을 소유하지 않으므로 그 길로는
 * 카드를 달 수 없었다(`payment.service.registerCard` 의 소유자 검사).
 * 여기서는 판매자를 **`oauth_clients.payappSellerId`** 로 정한다.
 *
 * 자격이 셋으로 갈린다. 부르는 시점이 다르기 때문이다.
 *   · 등록  — **플랫폼 세션**. 카드번호를 받는 화면이 플랫폼(`/payments/register`)에 있다
 *   · 조회·해지 — **SSO 액세스 토큰 + `payment` scope**. 사용자가 그 서비스 화면을 보고 있다
 *   · 청구  — **서비스 API 키**. 매달 도는 일이라 사용자 토큰이 없다(15분짜리다)
 *
 * 🔴 청구는 «키 소유자 = 그 클라이언트의 판매자 계정 주인»일 때만 통과한다.
 *    남의 서비스 키로 우리 고객 카드를 긁는 길을 열지 않는다.
 */
@ApiTags('통합 로그인(SSO)')
@ApiExcludeController()
@Controller('sso/payments')
export class SsoPaymentController {
  constructor(
    @InjectRepository(OauthClient)
    private readonly clientRepo: Repository<OauthClient>,
    @InjectRepository(PayappSeller)
    private readonly sellerRepo: Repository<PayappSeller>,
    @InjectRepository(PaymentMethod)
    private readonly paymentRepo: Repository<PaymentMethod>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly paymentService: PaymentService,
  ) {}

  private getUserId(req: any): string {
    const userId = req['userId'];
    if (!userId) throw new UnauthorizedException('로그인이 필요합니다.');
    return userId;
  }

  /** 클라이언트의 수납 판매자 계정. 안 걸려 있으면 정기결제를 쓸 수 없는 서비스다 */
  private async resolveSeller(clientId: string): Promise<PayappSeller> {
    if (!clientId) throw new BadRequestException('clientId 가 필요합니다.');
    const client = await this.clientRepo.findOneBy({ clientId });
    if (!client) throw new NotFoundException('서비스를 찾을 수 없습니다.');
    if (!client.payappSellerId) {
      throw new BadRequestException(
        '이 서비스에는 수납 판매자 계정이 연결되어 있지 않습니다.',
      );
    }
    const seller = await this.sellerRepo.findOneBy({
      id: client.payappSellerId,
      isActive: true,
    });
    if (!seller) {
      throw new NotFoundException('수납 판매자 계정을 찾을 수 없습니다.');
    }
    return seller;
  }

  // ── 등록 화면이 쓰는 것 (플랫폼 세션) ─────────────────────────────────────

  /**
   * 등록 화면에 띄울 서비스 이름과 **복귀 주소 검증**.
   *
   * 🔴 복귀 주소는 그 클라이언트에 등록된 redirect URI 와 **출처(origin)가 같아야** 한다.
   *    검사 없이 되돌려 보내면 오픈 리다이렉트가 된다 — 카드 등록 직후라 가장 속기 쉬운 순간이다.
   */
  @Get('register-context')
  @ApiOperation({ summary: '카드 등록 화면 컨텍스트(서비스 이름·복귀 주소 검증)' })
  async registerContext(
    @Query('clientId') clientId: string,
    @Query('returnUrl') returnUrl?: string,
  ) {
    if (!clientId) throw new BadRequestException('clientId 가 필요합니다.');
    const client = await this.clientRepo.findOneBy({ clientId });
    if (!client) throw new NotFoundException('서비스를 찾을 수 없습니다.');

    let safeReturnUrl: string | null = null;
    if (returnUrl) {
      let target: URL;
      try {
        target = new URL(returnUrl);
      } catch {
        throw new BadRequestException('복귀 주소가 올바르지 않습니다.');
      }
      const allowed = (client.redirectUris ?? []).some((uri) => {
        try {
          return new URL(uri).origin === target.origin;
        } catch {
          return false;
        }
      });
      if (!allowed) {
        throw new BadRequestException(
          '이 서비스에 등록되지 않은 복귀 주소입니다.',
        );
      }
      safeReturnUrl = target.toString();
    }

    return {
      clientId: client.clientId,
      clientName: client.clientName,
      logoUrl: client.logoUrl ?? null,
      primaryColor: client.primaryColor,
      billingEnabled: Boolean(client.payappSellerId),
      returnUrl: safeReturnUrl,
    };
  }

  /**
   * 카드 등록. **플랫폼 세션으로만** 부른다 — 등록되는 카드는 언제나 로그인한 본인 것이다.
   * 서비스는 이 라우트를 부를 수 없고(카드번호를 만질 일이 없어야 한다),
   * 사용자를 이 화면으로 보내기만 한다.
   */
  @Post('methods')
  @UseGuards(ApiKeyOrSessionGuard)
  @Service('payment')
  @ApiOperation({ summary: '서비스 판매자 계정으로 내 카드 등록' })
  async registerMethod(@Req() req: any, @Body() body: RegisterClientCardDto) {
    const userId = this.getUserId(req);
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');

    const seller = await this.resolveSeller(body.clientId);
    return this.paymentService.registerCardOnSeller(user, seller, {
      cardNo: body.cardNo,
      expMonth: body.expMonth,
      expYear: body.expYear,
      cardPw: body.cardPw,
      buyerAuthNo: body.buyerAuthNo,
      memo: `SSO:${body.clientId}`,
    });
  }

  // ── 연동 서비스가 사용자 자격으로 부르는 것 (SSO 토큰 + payment scope) ────

  @Get('methods')
  @UseGuards(SsoScopeGuard)
  @SsoScopes('payment')
  @ApiOperation({ summary: '이 서비스에 등록해 둔 내 카드' })
  async listMethods(@Req() req: any) {
    const userId = this.getUserId(req);
    const seller = await this.resolveSeller(req['ssoClientId']);
    const methods = await this.paymentRepo.find({
      where: { userId, sellerId: seller.id, isActive: true },
      order: { createdAt: 'DESC' },
    });
    // 🔴 빌링키(`billingKey`)는 내려보내지 않는다. 서비스가 들고 있을 이유가 없고,
    //    들고 있으면 그 순간 서비스가 결제수단의 원본을 갖게 된다.
    return methods.map((m) => ({
      id: m.id,
      cardNo: m.cardNo,
      cardName: m.cardName,
      createdAt: m.createdAt,
    }));
  }

  @Delete('methods/:id')
  @UseGuards(SsoScopeGuard)
  @SsoScopes('payment')
  @ApiOperation({ summary: '이 서비스에 등록해 둔 내 카드 해지' })
  async removeMethod(@Req() req: any, @Param('id') id: string) {
    const userId = this.getUserId(req);
    const seller = await this.resolveSeller(req['ssoClientId']);
    const method = await this.paymentRepo.findOneBy({
      id,
      userId,
      sellerId: seller.id,
    });
    if (!method) throw new NotFoundException('등록된 카드를 찾을 수 없습니다.');
    method.isActive = false;
    await this.paymentRepo.save(method);
    return { success: true };
  }

  // ── 매달 도는 청구 (서비스 API 키) ────────────────────────────────────────

  /**
   * 등록해 둔 카드로 청구한다.
   *
   * 🔴 **서비스 API 키로 부른다.** 정기결제는 사용자가 화면에 없는 시각에 돌아야 하는데
   *    SSO 액세스 토큰은 15분짜리고 서비스용 refresh 그랜트가 없다.
   * 🔴 «서비스 키로 최종 사용자 카드 대행 금지»에 걸리지 않는 이유: 카드는 **사용자 본인**이
   *    자기 세션으로 등록했고(위 `registerMethod`), 카드-사용자 매핑이 `payment_methods.userId`
   *    로 갈려 있다. 금지가 막는 것은 «키 소유자 한 명의 Customer 에 남의 카드가 섞이는 것»이다.
   * 🔴 그래도 남의 서비스가 우리 고객을 긁지 못하게, **키 소유자가 그 클라이언트의 판매자 계정
   *    주인**일 때만 통과시킨다.
   */
  @Post('charge')
  @UseGuards(ApiKeyOrSessionGuard)
  @Service('payment')
  @ApiOperation({ summary: '등록 카드로 청구(정기결제)' })
  async charge(@Req() req: any, @Body() body: ChargeClientCardDto) {
    const callerId = this.getUserId(req);
    const seller = await this.resolveSeller(body.clientId);
    if (seller.userId !== callerId) {
      throw new ForbiddenException(
        '이 서비스의 수납 판매자 계정 소유자만 청구할 수 있습니다.',
      );
    }

    const user = await this.userRepo.findOneBy({ id: body.userId });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');

    const method = await this.paymentRepo.findOneBy({
      id: body.paymentMethodId,
      userId: body.userId,
      sellerId: seller.id,
      isActive: true,
    });
    if (!method) {
      throw new NotFoundException('등록된 카드를 찾을 수 없습니다.');
    }

    return this.paymentService.chargeCardOnSeller(user, method, seller, {
      goodName: body.goodName,
      amount: body.amount,
      externalOrderId: body.externalOrderId,
      memo: body.memo,
    });
  }
}
