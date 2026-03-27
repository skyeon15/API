import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { User } from '../users/entities/user.entity.js';
import { VerificationCode } from '../users/entities/verification-code.entity.js';
import { AlimtalkService } from '../alimtalk/alimtalk.service.js';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(VerificationCode)
    private readonly codeRepo: Repository<VerificationCode>,
    private readonly alimtalkService: AlimtalkService,
  ) {}

  async requestCode(phone: string) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await this.codeRepo.save(
      this.codeRepo.create({ phone, code, expiresAt }),
    );

    console.log(`[AUTH] Verification code for ${phone}: ${code}`);

    // Try to send via Alimtalk if configured
    const channelId = process.env.VERIFY_CHANNEL_ID;
    const templateCode = process.env.VERIFY_TEMPLATE_CODE;

    if (channelId && templateCode) {
      try {
        await this.alimtalkService.send(
          {
            channelId: parseInt(channelId),
            templateCode,
            receiverPhone: phone,
            variables: { code },
          },
          { ip: '127.0.0.1', userId: 0 }, // System context
        );
      } catch (error) {
        console.error('[AUTH] Failed to send Alimtalk:', error.message);
      }
    }

    return { message: '인증번호가 발송되었습니다.' };
  }

  async verifyCode(phone: string, code: string) {
    const record = await this.codeRepo.findOne({
      where: {
        phone,
        code,
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });

    if (!record) {
      throw new BadRequestException('인증번호가 올바르지 않거나 만료되었습니다.');
    }

    // Mark as used by deleting or setting expiry to past
    await this.codeRepo.remove(record);

    let user = await this.userRepo.findOneBy({ phone });
    if (!user) {
      user = await this.userRepo.save(
        this.userRepo.create({ phone, name: '사용자' }),
      );
    }

    return user;
  }
}
