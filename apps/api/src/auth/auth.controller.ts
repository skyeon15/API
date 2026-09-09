import {
  Controller,
  Post,
  Body,
  Get,
  Req,
  Res,
  UnauthorizedException,
  Query,
  Param,
  BadRequestException,
  Patch,
  Delete,
} from '@nestjs/common';
import {
  ApiBody,
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OauthClient } from './entities/oauth-client.entity.js';
import {
  SsoClientInfoResponseDto,
  SsoTokenRequestDto,
  SsoTokenResponseDto,
  SsoUserinfoResponseDto,
} from './dto/sso.dto.js';
import { SocialProvider } from './entities/user-social-account.entity.js';
import { CONFIG } from '../common/constants.js';
import {
  isSessionToken,
  type AccessTokenPayload,
} from '../common/utils/session-token.util.js';
import { resolveApiBaseUrl } from '../common/utils/request-url.util.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure:
    process.env.API_NODE_ENV === 'production' ||
    process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};


// SSO(OAuth2) 엔드포인트 4개만 문서에 노출한다.
// 플랫폼 자체 로그인(소셜/전화 인증·세션 관리)은 @ApiExcludeEndpoint로 제외.
@ApiTags('통합 로그인(SSO)')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    @InjectRepository(OauthClient)
    private readonly oauthClientRepo: Repository<OauthClient>,
  ) {}

  // --- OIDC Standard Endpoints ---

  @Get('authorize')
  @ApiOperation({
    summary: 'SSO 로그인 시작 (인가 코드 발급)',
    description:
      '사용자 브라우저를 이 주소로 리다이렉트하세요. 플랫폼 미로그인 상태면 로그인 페이지를 거친 뒤, ' +
      '`redirect_uri?code=...&state=...`로 복귀합니다. 코드는 5분 만료·1회용입니다. ' +
      '`state`는 그대로 되돌려주므로 CSRF 방지 검증은 호출 서비스 책임입니다.',
  })
  @ApiQuery({ name: 'client_id', description: '발급받은 클라이언트 ID' })
  @ApiQuery({
    name: 'redirect_uri',
    description: '사전 등록된 콜백 URL (미등록 시 거부)',
  })
  @ApiQuery({
    name: 'response_type',
    description: '고정값 code',
    enum: ['code'],
  })
  @ApiQuery({
    name: 'scope',
    description: '공백 구분 scope 목록 (openid profile email phone address)',
    example: 'openid profile email',
  })
  @ApiQuery({ name: 'state', description: 'CSRF 방지용 임의 값 (그대로 반환)' })
  @ApiResponse({
    status: 302,
    description: '로그인 페이지 또는 redirect_uri(code, state 포함)로 리다이렉트',
  })
  async authorize(
    @Query('client_id') clientId: string,
    @Query('redirect_uri') redirectUri: string,
    @Query('response_type') responseType: string,
    @Query('scope') scope: string,
    @Query('state') state: string,
    @Req() req: any,
    @Res() res: any,
  ) {
    if (responseType !== 'code')
      throw new BadRequestException('Unsupported response type');

    // 🔴 세션은 access_token 쿠키가 들고 있다. 이 파일의 다른 12개 엔드포인트가 전부
    //    그렇게 읽는데 여기만 존재하지 않는 `user_id` 쿠키를 보고 있었다 —
    //    아무도 굽지 않는 쿠키라 authorize 가 «항상 미로그인»으로 판정했고,
    //    /login 은 이미 로그인된 것을 보고 authorize 로 되돌려 보내서
    //    무한 리다이렉트가 났다(2026-08-29, SSO 첫 연동에서 드러남).
    // 만료·위조된 토큰은 미로그인과 같이 다룬다 → 아래에서 로그인 화면으로 보낸다
    const userId = this.optionalSessionUserId(req) ?? null;

    if (!userId) {
      const loginUrl = new URL(`${CONFIG.WEB_URL}/login`);
      loginUrl.searchParams.set('client_id', clientId);
      loginUrl.searchParams.set('redirect_uri', redirectUri);
      loginUrl.searchParams.set('scope', scope);
      loginUrl.searchParams.set('state', state);
      return res.redirect(loginUrl.toString());
    }

    const code = await this.authService.authorize({
      clientId,
      redirectUri,
      scope,
      userId,
    });
    return res.redirect(`${redirectUri}?code=${code}&state=${state}`);
  }

  @Post('token')
  @ApiOperation({
    summary: 'SSO 토큰 교환 (인가 코드 → 토큰)',
    description:
      '`client_secret`이 필요하므로 반드시 서비스 백엔드에서 호출하세요. ' +
      '응답 키는 OAuth2 표준(access_token)이 아닌 camelCase(accessToken)이므로 ' +
      '기성 OAuth 클라이언트 라이브러리 대신 직접 HTTP 호출로 연동해야 합니다.',
  })
  @ApiBody({ type: SsoTokenRequestDto })
  @ApiOkResponse({ type: SsoTokenResponseDto })
  async token(
    @Body('grant_type') grantType: string,
    @Body('code') code: string,
    @Body('client_id') clientId: string,
    @Body('client_secret') clientSecret: string,
    @Body('redirect_uri') redirectUri: string,
  ) {
    if (grantType !== 'authorization_code')
      throw new BadRequestException('Unsupported grant type');
    return this.authService.exchangeCode(
      code,
      clientId,
      clientSecret,
      redirectUri,
    );
  }

  @Get('userinfo')
  @ApiOperation({
    summary: 'SSO 사용자 정보 조회',
    description:
      '토큰 교환으로 받은 accessToken을 `Authorization: Bearer {accessToken}` 헤더로 전달하세요. ' +
      '(API 키가 아닌 SSO 액세스 토큰입니다)',
  })
  @ApiOkResponse({ type: SsoUserinfoResponseDto })
  async userinfo(@Req() req: any) {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new UnauthorizedException('Missing access token');

    const token = authHeader.replace('Bearer ', '');
    let payload: AccessTokenPayload;
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }

    // scope 만큼만 내려준다. 서비스 관리자 여부(isServiceAdmin)는 토큰의 aud 기준이다.
    return this.authService.getUserinfo(payload);
  }

  @Get('client/:clientId')
  @ApiOperation({
    summary: 'SSO 클라이언트 공개 정보 조회',
    description: '로그인 화면 브랜딩(로고·색상·테마)과 허용 scope를 조회합니다.',
  })
  @ApiParam({ name: 'clientId', description: '클라이언트 ID' })
  @ApiOkResponse({ type: SsoClientInfoResponseDto })
  async getClientInfo(@Param('clientId') clientId: string) {
    const client = await this.oauthClientRepo.findOne({
      where: { clientId },
      select: [
        'clientId',
        'clientName',
        'logoUrl',
        'primaryColor',
        'themeConfig',
        'allowedScopes',
      ],
    });
    if (!client) throw new BadRequestException('Client not found');
    return client;
  }

  /**
   * 쿠키 세션에서 사용자 id 를 꺼낸다.
   *
   * SSO 액세스 토큰은 쿠키로 실려 와도 거부한다 — 연동 서비스가 토큰 교환으로 받은 토큰으로
   * 본인 전용 API(프로필 전체·연동 해제·결제)를 호출하면 scope 동의가 무의미해진다.
   * 만료·위조 토큰은 401 이다(예전엔 verify 가 그대로 던져 500 이 나갔고, 웹의 자동 갱신은
   * 401 에서만 동작하므로 세션이 끊긴 채 복구되지 않았다).
   */
  private sessionUserId(req: any): string {
    const userId = this.optionalSessionUserId(req);
    if (!userId) throw new UnauthorizedException('로그인이 필요합니다.');
    return userId;
  }

  /** 로그인 상태면 사용자 id, 아니면 undefined. 실패를 예외로 만들지 않는다. */
  private optionalSessionUserId(req: any): string | undefined {
    const token = req.cookies?.access_token;
    if (!token) return undefined;
    try {
      const payload = this.jwtService.verify(token);
      return isSessionToken(payload) ? payload.sub : undefined;
    } catch {
      return undefined;
    }
  }

  // --- Profile & Grant Management ---

  @ApiExcludeEndpoint()
  @Get('me')
  async getMe(@Req() req: any) {
    const userId = this.sessionUserId(req);
    return this.authService.getMyProfile(userId);
  }

  @ApiExcludeEndpoint()
  @Patch('me')
  async updateMe(@Req() req: any, @Body() data: any) {
    const userId = this.sessionUserId(req);
    return this.authService.updateProfile(userId, data);
  }

  @ApiExcludeEndpoint()
  @Get('social')
  async getSocialAccounts(@Req() req: any) {
    const userId = this.sessionUserId(req);
    return this.authService.getSocialAccounts(userId);
  }

  @ApiExcludeEndpoint()
  @Delete('social/:provider')
  async unlinkSocial(@Req() req: any, @Param('provider') provider: any) {
    const userId = this.sessionUserId(req);
    return this.authService.unlinkSocialAccount(userId, provider);
  }

  @ApiExcludeEndpoint()
  @Get('grants')
  async getGrants(@Req() req: any) {
    const userId = this.sessionUserId(req);
    return this.authService.getGrants(userId);
  }

  @ApiExcludeEndpoint()
  @Delete('grants/:clientId')
  async revokeGrant(@Req() req: any, @Param('clientId') clientId: string) {
    const userId = this.sessionUserId(req);
    return this.authService.revokeGrant(userId, clientId);
  }

  // --- Actual Social Login Implementation ---

  // 로그인을 시작한 요청의 오리진을 기준으로 기본 리다이렉트 주소를 만든다.
  // (OAuth 콜백 시점에는 원래 오리진을 알 수 없으므로 시작 시점에 잡아 전파한다.)
  private resolveDefaultRedirect(req: any): string {
    const referer = req.headers?.referer;
    const origin =
      req.headers?.origin ||
      (referer ? new URL(referer).origin : '') ||
      CONFIG.WEB_URL;
    return `${origin}/profile`;
  }


  @ApiExcludeEndpoint()
  @Get('kakao')
  async kakaoLogin(
    @Res() res: any,
    @Req() req: any,
    @Query('redirect') redirect?: string,
  ) {
    const callbackUrl = encodeURIComponent(
      `${resolveApiBaseUrl(req)}/auth/kakao/callback`,
    );
    const state = redirect || this.resolveDefaultRedirect(req);
    const kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${CONFIG.KAKAO.CLIENT_ID}&redirect_uri=${callbackUrl}&response_type=code&state=${state}`;
    return res.redirect(kakaoAuthUrl);
  }

  @ApiExcludeEndpoint()
  @Get('kakao/callback')
  async kakaoCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    const callbackUrl = `${resolveApiBaseUrl(req)}/auth/kakao/callback`;
    const finalRedirect = state;

    const currentUserId = this.optionalSessionUserId(req);

    const profile = await this.authService.getKakaoProfile(code, callbackUrl);
    const user = await this.authService.findOrCreateSocialUser(
      SocialProvider.KAKAO,
      profile.providerUserId,
      profile,
      currentUserId,
    );

    const accessToken = this.jwtService.sign(
      { sub: user.id },
      { expiresIn: '15m' },
    );
    const refreshToken = await (this.authService as any).issueRefreshToken(
      user.id,
    );

    res.cookie('access_token', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: 15 * 60 * 1000,
    });
    res.cookie('refresh_token', refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return res.redirect(finalRedirect || `${CONFIG.WEB_URL}/profile`);
  }

  @ApiExcludeEndpoint()
  @Get('naver')
  async naverLogin(
    @Res() res: any,
    @Req() req: any,
    @Query('redirect') redirect?: string,
  ) {
    const state = Math.random().toString(36).substring(2, 12);
    const finalRedirect = redirect || this.resolveDefaultRedirect(req);
    // 🔴 finalRedirect 를 그대로 이어 붙이면 안 된다. SSO 흐름에서는 이 값이
    //    `.../login?client_id=..&redirect_uri=..&scope=..&state=..` 처럼 쿼리를 달고 오는데,
    //    인코딩하지 않으면 네이버가 콜백할 때 Express 가 `&` 에서 쪼개 버린다 —
    //    finalRedirect 는 client_id 까지만 남고, redirect_uri 가 사라져 서비스로 돌아가지
    //    못하며(`/profile` 로 떨어진다), 게다가 서비스의 state 가 네이버 자신의 state 와
    //    충돌해 토큰 교환까지 망가진다.
    const callbackUrl = encodeURIComponent(
      `${resolveApiBaseUrl(req)}/auth/naver/callback?finalRedirect=${encodeURIComponent(finalRedirect)}`,
    );
    const naverAuthUrl = `https://nid.naver.com/oauth2.0/authorize?client_id=${CONFIG.NAVER.CLIENT_ID}&redirect_uri=${callbackUrl}&response_type=code&state=${state}`;
    return res.redirect(naverAuthUrl);
  }

  @ApiExcludeEndpoint()
  @Get('naver/callback')
  async naverCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('finalRedirect') finalRedirect: string,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    const currentUserId = this.optionalSessionUserId(req);

    const profile = await this.authService.getNaverProfile(code, state);
    const user = await this.authService.findOrCreateSocialUser(
      SocialProvider.NAVER,
      profile.providerUserId,
      profile,
      currentUserId,
    );

    const accessToken = this.jwtService.sign(
      { sub: user.id },
      { expiresIn: '15m' },
    );
    const refreshToken = await (this.authService as any).issueRefreshToken(
      user.id,
    );

    res.cookie('access_token', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: 15 * 60 * 1000,
    });
    res.cookie('refresh_token', refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return res.redirect(finalRedirect || `${CONFIG.WEB_URL}/profile`);
  }

  @ApiExcludeEndpoint()
  @Get('google')
  async googleLogin(
    @Res() res: any,
    @Req() req: any,
    @Query('redirect') redirect?: string,
  ) {
    const finalRedirect = redirect || this.resolveDefaultRedirect(req);
    // 구글은 등록된 redirect_uri 와 쿼리스트링까지 정확히 일치해야 하므로,
    // finalRedirect 는 쿼리 대신 state 로 전달한다(카카오와 동일 방식).
    const callbackUrl = encodeURIComponent(
      `${resolveApiBaseUrl(req)}/auth/google/callback`,
    );
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CONFIG.GOOGLE.CLIENT_ID}&redirect_uri=${callbackUrl}&response_type=code&scope=openid%20profile%20email&state=${encodeURIComponent(finalRedirect)}`;
    return res.redirect(googleAuthUrl);
  }

  @ApiExcludeEndpoint()
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    const finalRedirect = state;
    const callbackUrl = `${resolveApiBaseUrl(req)}/auth/google/callback`;

    const currentUserId = this.optionalSessionUserId(req);

    const profile = await this.authService.getGoogleProfile(code, callbackUrl);
    const user = await this.authService.findOrCreateSocialUser(
      SocialProvider.GOOGLE,
      profile.providerUserId,
      profile,
      currentUserId,
    );

    const accessToken = this.jwtService.sign(
      { sub: user.id },
      { expiresIn: '15m' },
    );
    const refreshToken = await (this.authService as any).issueRefreshToken(
      user.id,
    );

    res.cookie('access_token', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: 15 * 60 * 1000,
    });
    res.cookie('refresh_token', refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return res.redirect(finalRedirect || `${CONFIG.WEB_URL}/profile`);
  }

  @ApiExcludeEndpoint()
  @Post('refresh')
  async refresh(@Req() req: any, @Res({ passthrough: true }) res: any) {
    const token = req.cookies?.refresh_token;
    if (!token) throw new UnauthorizedException('리프레시 토큰이 없습니다.');

    const { accessToken, refreshToken } = await this.authService.refresh(token);

    res.cookie('access_token', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: 15 * 60 * 1000,
    });
    res.cookie('refresh_token', refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return { message: '토큰이 갱신되었습니다.' };
  }

  @ApiExcludeEndpoint()
  @Post('logout')
  async logout(@Req() req: any, @Res({ passthrough: true }) res: any) {
    const token = req.cookies?.refresh_token;
    if (token) await this.authService.revokeRefreshToken(token);

    res.clearCookie('access_token', COOKIE_OPTIONS);
    res.clearCookie('refresh_token', COOKIE_OPTIONS);

    return { message: '로그아웃되었습니다.' };
  }
}
