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
import { ApiExcludeController } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OauthClient } from './entities/oauth-client.entity.js';
import { SocialProvider } from './entities/user-social-account.entity.js';
import { CONFIG } from '../common/constants.js';
import { resolveApiBaseUrl } from '../common/utils/request-url.util.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure:
    process.env.API_NODE_ENV === 'production' ||
    process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};


@ApiExcludeController()
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

    const userId = req.cookies?.user_id;

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
  async token(
    @Body('grant_type') grantType: string,
    @Body('code') code: string,
    @Body('client_id') clientId: string,
    @Body('client_secret') clientSecret: string,
    @Body('redirect_uri') redirectUri: string,
  ) {
    if (grantType !== 'authorization_code')
      throw new BadRequestException('Unsupported grant type');
    return this.authService.exchangeCode(code, clientId, clientSecret);
  }

  @Get('userinfo')
  async userinfo(@Req() req: any) {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new UnauthorizedException('Missing access token');

    const token = authHeader.replace('Bearer ', '');
    try {
      const payload = this.jwtService.verify(token);
      const user = await this.authService.getUserById(payload.sub);
      return {
        sub: user.id,
        name: user.name,
        nickname: user.nickname,
        email: user.email,
        picture: user.profileImageUrl,
      };
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }

  @Get('client/:clientId')
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

  // --- Profile & Grant Management ---

  @Get('me')
  async getMe(@Req() req: any) {
    const token = req.cookies?.access_token;
    if (!token) throw new UnauthorizedException('로그인이 필요합니다.');
    const payload = this.jwtService.verify(token);
    return this.authService.getUserById(payload.sub);
  }

  @Patch('me')
  async updateMe(@Req() req: any, @Body() data: any) {
    const token = req.cookies?.access_token;
    if (!token) throw new UnauthorizedException('로그인이 필요합니다.');
    const payload = this.jwtService.verify(token);
    return this.authService.updateProfile(payload.sub, data);
  }

  @Get('social')
  async getSocialAccounts(@Req() req: any) {
    const token = req.cookies?.access_token;
    if (!token) throw new UnauthorizedException('로그인이 필요합니다.');
    const payload = this.jwtService.verify(token);
    return this.authService.getSocialAccounts(payload.sub);
  }

  @Delete('social/:provider')
  async unlinkSocial(@Req() req: any, @Param('provider') provider: any) {
    const token = req.cookies?.access_token;
    if (!token) throw new UnauthorizedException('로그인이 필요합니다.');
    const payload = this.jwtService.verify(token);
    return this.authService.unlinkSocialAccount(payload.sub, provider);
  }

  @Get('grants')
  async getGrants(@Req() req: any) {
    const token = req.cookies?.access_token;
    if (!token) throw new UnauthorizedException('로그인이 필요합니다.');
    const payload = this.jwtService.verify(token);
    return this.authService.getGrants(payload.sub);
  }

  @Delete('grants/:clientId')
  async revokeGrant(@Req() req: any, @Param('clientId') clientId: string) {
    const token = req.cookies?.access_token;
    if (!token) throw new UnauthorizedException('로그인이 필요합니다.');
    const payload = this.jwtService.verify(token);
    return this.authService.revokeGrant(payload.sub, clientId);
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

  @Get('kakao/callback')
  async kakaoCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    const callbackUrl = `${resolveApiBaseUrl(req)}/auth/kakao/callback`;
    const finalRedirect = state;

    let currentUserId: string | undefined;
    const token = req.cookies?.access_token;
    if (token) {
      try {
        const payload = this.jwtService.verify(token);
        currentUserId = payload.sub;
      } catch {}
    }

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

  @Get('naver')
  async naverLogin(
    @Res() res: any,
    @Req() req: any,
    @Query('redirect') redirect?: string,
  ) {
    const state = Math.random().toString(36).substring(2, 12);
    const finalRedirect = redirect || this.resolveDefaultRedirect(req);
    const callbackUrl = encodeURIComponent(
      `${resolveApiBaseUrl(req)}/auth/naver/callback?finalRedirect=${finalRedirect}`,
    );
    const naverAuthUrl = `https://nid.naver.com/oauth2.0/authorize?client_id=${CONFIG.NAVER.CLIENT_ID}&redirect_uri=${callbackUrl}&response_type=code&state=${state}`;
    return res.redirect(naverAuthUrl);
  }

  @Get('naver/callback')
  async naverCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('finalRedirect') finalRedirect: string,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    let currentUserId: string | undefined;
    const token = req.cookies?.access_token;
    if (token) {
      try {
        const payload = this.jwtService.verify(token);
        currentUserId = payload.sub;
      } catch {}
    }

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

  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    const finalRedirect = state;
    const callbackUrl = `${resolveApiBaseUrl(req)}/auth/google/callback`;

    let currentUserId: string | undefined;
    const token = req.cookies?.access_token;
    if (token) {
      try {
        const payload = this.jwtService.verify(token);
        currentUserId = payload.sub;
      } catch {}
    }

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

  // --- Existing Phone Auth Endpoints ---

  @Post('request-code')
  requestCode(@Body('phone') phone: string) {
    return this.authService.requestCode(phone.replace(/-/g, ''));
  }

  /** 로그인 상태에서 본인 전화번호 인증번호 발송(중복 번호는 발송 전에 거른다) */
  @Post('request-phone-code')
  async requestPhoneCode(@Req() req: any, @Body('phone') phone: string) {
    const token = req.cookies?.access_token;
    if (!token) throw new UnauthorizedException('로그인이 필요합니다.');
    const payload = this.jwtService.verify(token);
    return this.authService.requestPhoneCode(
      payload.sub,
      phone.replace(/-/g, ''),
    );
  }

  /** 로그인 상태에서 본인 전화번호 인증(소셜에서 번호가 넘어오지 않은 계정의 가입 완료용) */
  @Post('verify-phone')
  async verifyPhone(
    @Req() req: any,
    @Body('phone') phone: string,
    @Body('code') code: string,
  ) {
    const token = req.cookies?.access_token;
    if (!token) throw new UnauthorizedException('로그인이 필요합니다.');
    const payload = this.jwtService.verify(token);
    return this.authService.verifyPhone(
      payload.sub,
      phone.replace(/-/g, ''),
      code,
    );
  }

  @Post('verify-code')
  async verifyCode(
    @Body('phone') phone: string,
    @Body('code') code: string,
    @Res({ passthrough: true }) res: any,
  ) {
    const { user, accessToken, refreshToken } =
      await this.authService.verifyCode(phone.replace(/-/g, ''), code);

    res.cookie('access_token', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: 15 * 60 * 1000,
    });
    res.cookie('refresh_token', refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return user;
  }

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

  @Post('logout')
  async logout(@Req() req: any, @Res({ passthrough: true }) res: any) {
    const token = req.cookies?.refresh_token;
    if (token) await this.authService.revokeRefreshToken(token);

    res.clearCookie('access_token', COOKIE_OPTIONS);
    res.clearCookie('refresh_token', COOKIE_OPTIONS);

    return { message: '로그아웃되었습니다.' };
  }
}
