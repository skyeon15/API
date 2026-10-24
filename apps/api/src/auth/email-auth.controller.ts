import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get,
  Post, Req, Res, UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiExcludeController } from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { EmailAuthService } from './email-auth.service.js';
import { CONFIG } from '../common/constants.js';
import { isSessionToken } from '../common/utils/session-token.util.js';
import { COOKIE_OPTIONS, setSessionCookies } from './session-cookie.util.js';

const CHALLENGE_COOKIE = { ...COOKIE_OPTIONS, sameSite: 'strict' as const, maxAge: 5 * 60 * 1000 };

@ApiExcludeController()
@Controller('auth/email')
export class EmailAuthController {
  constructor(
    private readonly emailAuth: EmailAuthService,
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
  ) {}

  @Get('status')
  status(@Res({ passthrough: true }) res: any) {
    res.setHeader('Cache-Control', 'no-store');
    return { enabled: this.emailAuth.isConfigured() };
  }

  @Post('request')
  async request(@Body() body: any, @Req() req: any, @Res({ passthrough: true }) res: any) {
    this.assertBrowserRequest(req, res);
    const { binding, ...result } = await this.emailAuth.requestCode(body?.email, req.ip, 'login');
    res.cookie('email_login_challenge', binding, CHALLENGE_COOKIE);
    return result;
  }

  @Post('verify')
  async verify(@Body() body: any, @Req() req: any, @Res({ passthrough: true }) res: any) {
    this.assertBrowserRequest(req, res);
    const email = await this.emailAuth.verifyCode(body || {}, req.cookies?.email_login_challenge, req.ip, 'login');
    res.clearCookie('email_login_challenge', COOKIE_OPTIONS);
    const userId = await this.emailAuth.login(email);
    setSessionCookies(res, await this.auth.createEmailSession(userId, email));
    return { message: '로그인되었습니다.' };
  }

  @Post('link/request')
  async requestLink(@Body() body: any, @Req() req: any, @Res({ passthrough: true }) res: any) {
    this.assertBrowserRequest(req, res);
    const userId = this.sessionUserId(req);
    const { binding, ...result } = await this.emailAuth.requestCode(body?.email, req.ip, 'link', userId);
    res.cookie('email_link_challenge', binding, CHALLENGE_COOKIE);
    return result;
  }

  @Post('link/verify')
  async verifyLink(@Body() body: any, @Req() req: any, @Res({ passthrough: true }) res: any) {
    this.assertBrowserRequest(req, res);
    const userId = this.sessionUserId(req);
    const email = await this.emailAuth.verifyCode(body || {}, req.cookies?.email_link_challenge, req.ip, 'link', userId);
    res.clearCookie('email_link_challenge', COOKIE_OPTIONS);
    await this.emailAuth.link(userId, email);
    setSessionCookies(res, await this.auth.createEmailSession(userId, email));
    return { message: '이메일 로그인이 연결되었습니다.' };
  }

  @Delete('link')
  async unlink(@Req() req: any, @Res({ passthrough: true }) res: any) {
    this.assertBrowserRequest(req, res);
    await this.emailAuth.unlink(this.sessionUserId(req));
    return { message: '이메일 로그인 연결이 해제되었습니다.' };
  }

  private sessionUserId(req: any) {
    try {
      const payload = this.jwt.verify(req.cookies?.access_token);
      if (isSessionToken(payload)) return payload.sub;
    } catch {}
    throw new UnauthorizedException('로그인이 필요합니다.');
  }

  private assertBrowserRequest(req: any, res: any) {
    res.setHeader('Cache-Control', 'no-store');
    // CORS is permissive for other API consumers; auth mutations require our web origin.
    if (req.headers.origin !== new URL(CONFIG.WEB_URL).origin ||
      req.headers['sec-fetch-site'] === 'cross-site') {
      throw new ForbiddenException('허용되지 않은 요청입니다.');
    }
    if (!req.is('application/json')) throw new BadRequestException('JSON 요청이 필요합니다.');
  }
}
