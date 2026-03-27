import { Controller, Post, Body, Get, Session, UnauthorizedException, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { AuthService } from './auth.service.js';

@ApiExcludeController()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('request-code')
  requestCode(@Body('phone') phone: string) {
    return this.authService.requestCode(phone.replace(/-/g, ''));
  }

  @Post('verify-code')
  async verifyCode(
    @Body('phone') phone: string,
    @Body('code') code: string,
    @Session() session: Record<string, any>,
  ) {
    const user = await this.authService.verifyCode(phone.replace(/-/g, ''), code);
    session.userId = user.id;
    return user;
  }

  @Get('me')
  async me(@Session() session: Record<string, any>, @Req() req: any) {
    if (!session.userId) {
      throw new UnauthorizedException('로그인이 필요합니다.');
    }
    // Simple fetch or we can add a findById to AuthService/UserService
    const user = await (await import('../users/entities/user.entity.js')).User.findOneBy({ id: session.userId });
    if (!user) throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
    return user;
  }

  @Post('logout')
  logout(@Session() session: Record<string, any>) {
    session.destroy((err) => {
      if (err) throw err;
    });
    return { message: '로그아웃되었습니다.' };
  }
}
