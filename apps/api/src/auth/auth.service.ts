import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { User } from '../users/entities/user.entity.js';
import { VerificationCode } from '../users/entities/verification-code.entity.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { AlimtalkService } from '../alimtalk/alimtalk.service.js';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(VerificationCode)
    private readonly codeRepo: Repository<VerificationCode>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly alimtalkService: AlimtalkService,
  ) {}

  async requestCode(phone: string) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await this.codeRepo.save(this.codeRepo.create({ phone, code, expiresAt }));

    console.log(`[AUTH] Verification code for ${phone}: ${code}`);

    const channelId = process.env.VERIFY_CHANNEL_ID;
    const templateCode = process.env.VERIFY_TEMPLATE_CODE;

    if (channelId && templateCode) {
      try {
        await this.alimtalkService.send(
          { channelId: parseInt(channelId), templateCode, receiverPhone: phone, variables: { code } },
          { ip: '127.0.0.1', userId: 0 },
        );
      } catch (error) {
        console.error('[AUTH] Failed to send Alimtalk:', error.message);
      }
    }

    return { message: '인증번호가 발송되었습니다.' };
  }

  async verifyCode(phone: string, code: string): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const record = await this.codeRepo.findOne({
      where: { phone, code, expiresAt: MoreThan(new Date()) },
      order: { createdAt: 'DESC' },
    });

    if (!record) throw new BadRequestException('인증번호가 올바르지 않거나 만료되었습니다.');

    await this.codeRepo.remove(record);

    let user = await this.userRepo.findOneBy({ phone });
    if (!user) {
      user = await this.userRepo.save(this.userRepo.create({ phone, name: '사용자' }));
    }

    return {
      user,
      accessToken: this.issueAccessToken(user.id),
      refreshToken: await this.issueRefreshToken(user.id),
    };
  }

  async refresh(token: string): Promise<{ accessToken: string; refreshToken: string }> {
    const record = await this.refreshTokenRepo.findOne({
      where: { token, expiresAt: MoreThan(new Date()) },
    });

    if (!record) throw new UnauthorizedException('유효하지 않은 리프레시 토큰입니다.');

    // Rotate: 기존 토큰 삭제 후 새로 발급
    await this.refreshTokenRepo.remove(record);

    return {
      accessToken: this.issueAccessToken(record.userId),
      refreshToken: await this.issueRefreshToken(record.userId),
    };
  }

  async revokeRefreshToken(token: string) {
    await this.refreshTokenRepo.delete({ token });
  }

  async getUserById(id: number): Promise<User> {
    const user = await this.userRepo.findOneBy({ id });
    if (!user) throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
    return user;
  }

  private issueAccessToken(userId: number): string {
    return this.jwtService.sign({ sub: userId }, { expiresIn: '15m' });
  }

  private async issueRefreshToken(userId: number): Promise<string> {
    const token = randomBytes(40).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.refreshTokenRepo.save(this.refreshTokenRepo.create({ token, userId, expiresAt }));
    return token;
  }
}
