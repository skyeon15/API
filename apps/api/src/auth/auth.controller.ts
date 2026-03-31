import { Controller, Post, Body, Get, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.API_NODE_ENV === 'production' || process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

@ApiExcludeController()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('request-code')
  requestCode(@Body('phone') phone: string) {
    return this.authService.requestCode(phone.replace(/-/g, ''));
  }

  @Post('verify-code')
  async verifyCode(
    @Body('phone') phone: string,
    @Body('code') code: string,
    @Res({ passthrough: true }) res: any,
  ) {
    const { user, accessToken, refreshToken } = await this.authService.verifyCode(
      phone.replace(/-/g, ''),
      code,
    );

    res.cookie('access_token', accessToken, { ...COOKIE_OPTIONS, maxAge: 15 * 60 * 1000 });
    res.cookie('refresh_token', refreshToken, { ...COOKIE_OPTIONS, maxAge: 30 * 24 * 60 * 60 * 1000 });

    return user;
  }

  @Post('refresh')
  async refresh(@Req() req: any, @Res({ passthrough: true }) res: any) {
    const token = req.cookies?.refresh_token;
    if (!token) throw new UnauthorizedException('리프레시 토큰이 없습니다.');

    const { accessToken, refreshToken } = await this.authService.refresh(token);

    res.cookie('access_token', accessToken, { ...COOKIE_OPTIONS, maxAge: 15 * 60 * 1000 });
    res.cookie('refresh_token', refreshToken, { ...COOKIE_OPTIONS, maxAge: 30 * 24 * 60 * 60 * 1000 });

    return { message: '토큰이 갱신되었습니다.' };
  }

  @Get('me')
  async me(@Req() req: any) {
    const token = req.cookies?.access_token;
    if (!token) throw new UnauthorizedException('로그인이 필요합니다.');

    let payload: { sub: number };
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }

    return this.authService.getUserById(payload.sub);
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
