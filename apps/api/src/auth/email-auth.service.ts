import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { Redis } from 'ioredis';
import { Not, Repository } from 'typeorm';
import { z } from 'zod';
import { User, UserStatus } from '../users/entities/user.entity.js';
import { UserSocialAccount } from './entities/user-social-account.entity.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import {
  CANCEL_EMAIL_CODE,
  CONSUME_EMAIL_CODE,
  READY_EMAIL_CODE,
  RESERVE_EMAIL_CODE,
} from './email-auth.scripts.js';

type Purpose = 'login' | 'link';
const CODE_TTL = 5 * 60;
const INVALID_CODE = '인증코드가 올바르지 않거나 만료되었습니다. 다시 요청해주세요.';
const emailSchema = z.string().trim().max(254).email().transform((v) => v.toLowerCase());

@Injectable()
export class EmailAuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  isConfigured() {
    return Boolean(
      (process.env.API_RESEND_API_KEY || process.env.RESEND_API_KEY)?.trim() &&
      process.env.API_RESEND_FROM?.trim() &&
      this.secret().length >= 32,
    );
  }

  private secret() {
    return process.env.API_EMAIL_OTP_SECRET || process.env.API_JWT_SECRET || '';
  }

  private digest(...parts: string[]) {
    return createHmac('sha256', this.secret()).update(JSON.stringify(parts)).digest('hex');
  }

  private email(value: unknown) {
    const parsed = emailSchema.safeParse(value);
    if (!parsed.success) throw new BadRequestException('올바른 이메일 주소를 입력해주세요.');
    return parsed.data;
  }

  private activeKey(email: string, purpose: Purpose, userId: string) {
    return `email-auth:active:${this.digest('identity', email, purpose, userId)}`;
  }

  private async evaluate(script: string, keys: string[], args: (string | number)[]) {
    if (!this.isConfigured() || this.redis.status !== 'ready') {
      throw new ServiceUnavailableException('이메일 인증을 잠시 사용할 수 없습니다.');
    }
    let timer: ReturnType<typeof setTimeout>;
    try {
      return await Promise.race([
        this.redis.eval(script, keys.length, ...keys, ...args),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Redis timeout')), 3000);
        }),
      ]);
    } catch {
      throw new ServiceUnavailableException('이메일 인증을 잠시 사용할 수 없습니다.');
    } finally {
      clearTimeout(timer!);
    }
  }

  async requestCode(value: unknown, ip: string, purpose: Purpose, userId = '') {
    const email = this.email(value);
    if (purpose === 'link') await this.requireActiveUser(userId);
    const challengeId = randomBytes(32).toString('hex');
    const binding = randomBytes(32).toString('hex');
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const challengeKey = `email-auth:challenge:${challengeId}`;
    const activeKey = this.activeKey(email, purpose, userId);
    const configuredLimit = Number(process.env.API_EMAIL_OTP_HOURLY_LIMIT || 300);
    const hourlyLimit = Number.isSafeInteger(configuredLimit) && configuredLimit > 0
      ? configuredLimit : 300;
    const result = await this.evaluate(RESERVE_EMAIL_CODE, [
      `email-auth:send-ip:${this.digest('ip', ip)}`,
      `email-auth:send-email:${this.digest('email', email)}`,
      `email-auth:cooldown:${this.digest('email', email)}`,
      'email-auth:send-global', activeKey, challengeKey,
    ], [challengeId, JSON.stringify({
      email, purpose, userId, attempts: 0, ready: false,
      binding: this.digest('binding', binding),
      digest: this.digest('code', challengeId, code),
    }), CODE_TTL, hourlyLimit]) as number[];
    if (result[0] !== 1) this.rateLimited(result[1]);

    try {
      const intent = purpose === 'link' ? '로그인 이메일 연결' : '로그인';
      const text = `파란대나무숲 ${intent} 인증코드: ${code}\n\n5분 안에 요청한 화면에 입력해주세요.\n본인이 요청하지 않았다면 이 메일을 무시해주세요. 인증코드를 다른 사람에게 알려주지 마세요.`;
      // Native fetch avoids the app's axios interceptor, which logs request bodies.
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${(process.env.API_RESEND_API_KEY || process.env.RESEND_API_KEY)!.trim()}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `email-login/${challengeId}`,
        },
        body: JSON.stringify({
          from: process.env.API_RESEND_FROM!.trim(),
          to: [email], subject: `[파란대나무숲] ${intent} 인증코드`, text,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error('Email delivery rejected');
      await response.body?.cancel();
      const ready = await this.evaluate(READY_EMAIL_CODE, [challengeKey, activeKey], [challengeId]);
      if (ready !== 1) throw new Error('Challenge expired');
    } catch {
      await this.evaluate(CANCEL_EMAIL_CODE, [challengeKey, activeKey], [challengeId]).catch(() => {});
      throw new ServiceUnavailableException('인증 메일을 보내지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
    return { challengeId, binding, expiresIn: CODE_TTL, retryAfter: 60 };
  }

  async verifyCode(
    input: { email?: unknown; code?: unknown; challengeId?: unknown },
    binding: unknown, ip: string, purpose: Purpose, userId = '',
  ) {
    const email = this.email(input.email);
    if (typeof input.code !== 'string' || !/^\d{6}$/.test(input.code) ||
      typeof input.challengeId !== 'string' || !/^[a-f0-9]{64}$/.test(input.challengeId) ||
      typeof binding !== 'string' || !/^[a-f0-9]{64}$/.test(binding)) {
      throw new BadRequestException(INVALID_CODE);
    }
    const result = await this.evaluate(CONSUME_EMAIL_CODE, [
      `email-auth:challenge:${input.challengeId}`,
      this.activeKey(email, purpose, userId),
      `email-auth:verify-ip:${this.digest('ip', ip)}`,
    ], [input.challengeId, this.digest('binding', binding),
      this.digest('code', input.challengeId, input.code), purpose, userId, email]) as number[];
    if (result[0] === -1) this.rateLimited(result[1]);
    if (result[0] !== 1) throw new BadRequestException(INVALID_CODE);
    return email;
  }

  async login(email: string) {
    const owner = await this.users.findOneBy({ loginEmail: email });
    if (owner) {
      if (owner.status !== UserStatus.ACTIVE) throw new UnauthorizedException('로그인할 수 없는 계정입니다.');
      return owner.id;
    }
    // A profile email is editable contact information, never proof of account ownership.
    const existing = await this.users.createQueryBuilder('user')
      .where('LOWER(TRIM(user.email)) = :email', { email }).getOne();
    if (existing) {
      throw new ConflictException('기존 로그인 수단으로 로그인한 뒤 프로필에서 이메일 로그인을 연결해주세요.');
    }
    try {
      const user = await this.users.save(this.users.create({
        email, loginEmail: email, name: '', phoneVerified: false,
      }));
      return user.id;
    } catch (error) {
      if (error?.code === '23505') {
        throw new ConflictException('이미 사용 중인 이메일입니다. 로그인을 다시 시도해주세요.');
      }
      throw error;
    }
  }

  async link(userId: string, email: string) {
    try {
      await this.users.manager.transaction(async (manager) => {
        const user = await manager.findOne(User, {
          where: { id: userId }, lock: { mode: 'pessimistic_write' },
        });
        if (!user || user.status !== UserStatus.ACTIVE) throw new UnauthorizedException();
        const owner = await manager.findOneBy(User, { loginEmail: email, id: Not(userId) });
        if (owner) throw new ConflictException('이미 다른 계정에 연결된 이메일입니다.');
        await manager.update(User, userId, { loginEmail: email });
        await manager.createQueryBuilder().delete().from(RefreshToken)
          .where('"userId" = :userId AND "sessionExpiresAt" IS NOT NULL', { userId }).execute();
      });
    } catch (error) {
      if (error?.code === '23505') throw new ConflictException('이미 다른 계정에 연결된 이메일입니다.');
      throw error;
    }
  }

  async unlink(userId: string) {
    await this.users.manager.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: userId }, lock: { mode: 'pessimistic_write' },
      });
      if (!user || user.status !== UserStatus.ACTIVE) throw new UnauthorizedException();
      if (!user.loginEmail) return;
      if (await manager.countBy(UserSocialAccount, { userId }) === 0) {
        throw new BadRequestException('최소 하나 이상의 로그인 수단이 필요합니다.');
      }
      await manager.update(User, userId, { loginEmail: null });
      await manager.createQueryBuilder().delete().from(RefreshToken)
        .where('"userId" = :userId AND "sessionExpiresAt" IS NOT NULL', { userId }).execute();
    });
  }

  private async requireActiveUser(userId: string) {
    const user = await this.users.findOneBy({ id: userId });
    if (!user || user.status !== UserStatus.ACTIVE) throw new UnauthorizedException();
  }

  private rateLimited(retryAfter: number): never {
    throw new HttpException({
      message: '인증 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
      retryAfter: Math.max(1, retryAfter),
    }, 429);
  }
}
