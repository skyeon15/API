import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { Redis } from 'ioredis';
import axios from 'axios';
import * as qs from 'querystring';
import { User } from '../users/entities/user.entity.js';
import { VerificationCode } from '../users/entities/verification-code.entity.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import {
  UserSocialAccount,
  SocialProvider,
} from './entities/user-social-account.entity.js';
import { OauthClient } from './entities/oauth-client.entity.js';
import { OauthGrant, GrantStatus } from './entities/oauth-grant.entity.js';
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
    @InjectRepository(UserSocialAccount)
    private readonly socialAccountRepo: Repository<UserSocialAccount>,
    @InjectRepository(OauthClient)
    private readonly oauthClientRepo: Repository<OauthClient>,
    @InjectRepository(OauthGrant)
    private readonly oauthGrantRepo: Repository<OauthGrant>,
    private readonly jwtService: JwtService,
    private readonly alimtalkService: AlimtalkService,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
  ) {}

  // --- OIDC Core Methods ---

  async authorize(params: {
    clientId: string;
    redirectUri: string;
    scope: string;
    userId: string;
  }) {
    const client = await this.oauthClientRepo.findOneBy({
      clientId: params.clientId,
    });
    if (!client)
      throw new BadRequestException('유효하지 않은 클라이언트입니다.');

    if (!client.redirectUris.includes(params.redirectUri)) {
      throw new BadRequestException('허용되지 않은 리다이렉트 주소입니다.');
    }

    const code = randomBytes(20).toString('hex');
    const codeData = JSON.stringify({
      userId: params.userId,
      clientId: params.clientId,
      scope: params.scope,
      redirectUri: params.redirectUri,
    });

    await this.redis.set(`auth_code:${code}`, codeData, 'EX', 300); // 5분 만료

    return code;
  }

  async exchangeCode(code: string, clientId: string, clientSecret: string) {
    const client = await this.oauthClientRepo.findOneBy({
      clientId,
      clientSecret,
    });
    if (!client)
      throw new UnauthorizedException('클라이언트 인증에 실패했습니다.');

    const codeDataStr = await this.redis.get(`auth_code:${code}`);
    if (!codeDataStr)
      throw new BadRequestException('만료되었거나 유효하지 않은 코드입니다.');

    const codeData = JSON.parse(codeDataStr);
    if (codeData.clientId !== clientId) {
      throw new BadRequestException('발급된 클라이언트와 일치하지 않습니다.');
    }

    await this.redis.del(`auth_code:${code}`);

    const user = await this.getUserById(codeData.userId);
    const accessToken = this.issueAccessToken(user.id);
    const refreshToken = await this.issueRefreshToken(user.id);
    const idToken = this.issueIdToken(user, clientId, codeData.scope);

    // 기록 및 연결 업데이트
    await this.updateGrant(user.id, clientId, codeData.scope);

    return { accessToken, refreshToken, idToken };
  }

  private issueIdToken(user: User, clientId: string, scope: string): string {
    const payload: any = {
      iss: 'https://gaon.bbforest.net', // 내 인증 서버 주소
      sub: user.id,
      aud: clientId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    const scopes = scope.split(' ');
    if (scopes.includes('profile')) {
      payload.name = user.name;
      payload.nickname = user.nickname;
      payload.picture = user.profileImageUrl;
      payload.birthdate = user.birthDate;
    }
    if (scopes.includes('email')) payload.email = user.email;
    if (scopes.includes('phone')) payload.phone_number = user.phone;
    if (scopes.includes('address')) {
      payload.address = {
        formatted: `${user.address} ${user.detailAddress}`,
        postal_code: user.zipCode,
      };
    }

    return this.jwtService.sign(payload);
  }

  private async updateGrant(userId: string, clientId: string, scope: string) {
    let grant = await this.oauthGrantRepo.findOneBy({ userId, clientId });
    const grantedScopes = scope.split(' ');

    if (!grant) {
      grant = this.oauthGrantRepo.create({ userId, clientId, grantedScopes });
    } else {
      grant.grantedScopes = Array.from(
        new Set([...grant.grantedScopes, ...grantedScopes]),
      );
    }
    await grant.save();
  }

  // --- Identity Federation Methods ---

  async findOrCreateSocialUser(
    provider: SocialProvider,
    providerUserId: string,
    profile: any,
    currentUserId?: string,
  ): Promise<User> {
    console.log(
      `[AUTH] findOrCreateSocialUser: provider=${provider}, providerUserId=${providerUserId}, currentUserId=${currentUserId}`,
    );
    let socialAccount: UserSocialAccount | null = null;
    try {
      socialAccount = await this.socialAccountRepo.findOne({
        where: { provider, providerUserId },
        relations: ['user'],
      });
    } catch (error) {
      console.error(`[AUTH] Failed to find social account: ${error.message}`);
      throw error;
    }

    const rawData = profile.raw || profile;

    // 이미 연동된 소셜 계정인 경우
    if (socialAccount) {
      // 1. 로그인 중인 경우 (연동 시도)
      if (currentUserId && socialAccount.userId !== currentUserId) {
        throw new BadRequestException(
          '이미 다른 계정에 연동된 소셜 계정입니다.',
        );
      }
      // 2. 로그인 중이 아니거나, 본인 계정인 경우 (로그인 또는 연동 갱신)

      // 유저 정보 보강 (기존 유저 정보가 누락된 경우 소셜 정보로 채워줌)
      const user = socialAccount.user;
      let updated = false;
      if (!user.phone && profile.phone) {
        user.phone = profile.phone;
        updated = true;
      }
      if (!user.gender && profile.gender) {
        user.gender = profile.gender;
        updated = true;
      }
      if (!user.birthDate && profile.birthDate) {
        user.birthDate = profile.birthDate;
        updated = true;
      }
      if (updated) await user.save();

      socialAccount.rawProfile = rawData;
      socialAccount.syncedAt = new Date();
      await socialAccount.save();
      return user;
    }

    // 연동된 소셜 계정이 없는 경우

    // 1. 로그인 중인 경우 (새로운 연동)
    if (currentUserId) {
      await this.socialAccountRepo.save(
        this.socialAccountRepo.create({
          userId: currentUserId,
          provider,
          providerUserId,
          rawProfile: rawData,
          syncedAt: new Date(),
        }),
      );

      // 이미 회원가입된 상태이므로 정보가 비어있다면 채워줌
      const user = await this.getUserById(currentUserId);
      let updated = false;
      if (!user.phone && profile.phone) {
        user.phone = profile.phone;
        updated = true;
      }
      if (!user.gender && profile.gender) {
        user.gender = profile.gender;
        updated = true;
      }
      if (!user.birthDate && profile.birthDate) {
        user.birthDate = profile.birthDate;
        updated = true;
      }
      if (updated) await user.save();

      return user;
    }

    // 2. 로그인 중이 아닌 경우 (신규 가입 또는 자동 계정 통합)
    // CI 또는 이메일로 기존 유저 확인 (계정 통합 로직)
    let user: User | null = null;
    if (profile.ci) {
      user = await this.userRepo.findOneBy({ ci: profile.ci });
    } else if (profile.email) {
      user = await this.userRepo.findOneBy({ email: profile.email });
    }

    if (!user) {
      user = await this.userRepo.save(
        this.userRepo.create({
          name: profile.name || '사용자',
          email: profile.email,
          ci: profile.ci,
          phone: profile.phone,
          gender: profile.gender,
          birthDate: profile.birthDate,
          profileImageUrl: profile.profileImageUrl,
        }),
      );
    } else {
      // 정보 업데이트 (기존 유저 정보 보강)
      let updated = false;
      if (!user.phone && profile.phone) {
        user.phone = profile.phone;
        updated = true;
      }
      if (!user.gender && profile.gender) {
        user.gender = profile.gender;
        updated = true;
      }
      if (!user.birthDate && profile.birthDate) {
        user.birthDate = profile.birthDate;
        updated = true;
      }
      if (updated) await user.save();
    }

    await this.socialAccountRepo.save(
      this.socialAccountRepo.create({
        userId: user.id,
        provider,
        providerUserId,
        rawProfile: rawData,
        syncedAt: new Date(),
      }),
    );

    return user;
  }

  // --- Profile & Grant Management ---

  async updateProfile(userId: string, data: Partial<User>) {
    await this.userRepo.update(userId, data);
    return this.getUserById(userId);
  }

  async getSocialAccounts(userId: string) {
    return this.socialAccountRepo.find({ where: { userId } });
  }

  async unlinkSocialAccount(userId: string, provider: SocialProvider) {
    const accounts = await this.socialAccountRepo.find({ where: { userId } });
    if (accounts.length <= 1) {
      throw new BadRequestException(
        '최소 하나 이상의 로그인 수단이 필요합니다.',
      );
    }
    await this.socialAccountRepo.delete({ userId, provider });
  }

  async getGrants(userId: string) {
    return this.oauthGrantRepo.find({
      where: { userId, status: GrantStatus.ACTIVE },
      relations: ['client'],
    });
  }

  async revokeGrant(userId: string, clientId: string) {
    await this.oauthGrantRepo.update(
      { userId, clientId },
      { status: GrantStatus.REVOKED },
    );
  }

  // --- Social Provider Integration ---

  async getKakaoProfile(code: string, redirectUri: string) {
    const tokenRes = await axios.post(
      'https://kauth.kakao.com/oauth/token',
      qs.stringify({
        grant_type: 'authorization_code',
        client_id: process.env.API_KAKAO_CLIENT_ID,
        client_secret: process.env.API_KAKAO_CLIENT_SECRET,
        redirect_uri: redirectUri,
        code,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const userRes = await axios.get('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
    });

    const { id, kakao_account: account } = userRes.data;

    let phone = account?.phone_number;
    if (phone) {
      // +82 10-0000-0000 -> 01000000000
      phone = phone.replace('+82 ', '0').replace(/[- ]/g, '');
    }

    let gender = account?.gender;
    if (gender === 'male') gender = 'M';
    else if (gender === 'female') gender = 'F';
    else gender = 'U';

    let birthDate: string | null = null;
    if (account?.birthyear && account?.birthday) {
      // birthday: MMDD
      birthDate = `${account.birthyear}-${account.birthday.slice(
        0,
        2,
      )}-${account.birthday.slice(2)}`;
    }

    return {
      providerUserId: String(id),
      email: account?.email,
      name: account?.profile?.nickname,
      profileImageUrl: account?.profile?.profile_image_url,
      phone,
      gender,
      birthDate,
      ci: account?.ci,
      raw: userRes.data,
    };
  }

  async getNaverProfile(code: string, state: string) {
    const tokenRes = await axios.post(
      'https://nid.naver.com/oauth2.0/token',
      qs.stringify({
        grant_type: 'authorization_code',
        client_id: process.env.API_NAVER_CLIENT_ID,
        client_secret: process.env.API_NAVER_CLIENT_SECRET,
        code,
        state,
      }),
    );

    const userRes = await axios.get('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
    });

    const {
      id,
      email,
      name,
      profile_image,
      ci,
      gender,
      mobile,
      birthyear,
      birthday,
    } = userRes.data.response;

    let birthDate: string | null = null;
    if (birthyear && birthday) {
      // birthday: MM-DD
      birthDate = `${birthyear}-${birthday}`;
    }

    return {
      providerUserId: id,
      email,
      name,
      profileImageUrl: profile_image,
      phone: mobile ? mobile.replace(/[- ]/g, '') : null,
      gender: gender || 'U',
      birthDate,
      ci,
      raw: userRes.data,
    };
  }

  async getGoogleProfile(code: string, redirectUri: string) {
    const tokenRes = await axios.post(
      'https://oauth2.googleapis.com/token',
      qs.stringify({
        grant_type: 'authorization_code',
        client_id: process.env.API_GOOGLE_CLIENT_ID,
        client_secret: process.env.API_GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        code,
      }),
    );

    const userRes = await axios.get(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      {
        headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
      },
    );

    const { sub, email, name, picture } = userRes.data;
    return {
      providerUserId: sub,
      email,
      name,
      profileImageUrl: picture,
      raw: userRes.data,
    };
  }

  async requestCode(phone: string) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await this.codeRepo.save(this.codeRepo.create({ phone, code, expiresAt }));

    console.log(`[AUTH] Verification code for ${phone}: ${code}`);

    const channelId = process.env.API_VERIFY_CHANNEL_ID;
    const templateCode = process.env.API_VERIFY_TEMPLATE_CODE;

    if (channelId && templateCode) {
      try {
        await this.alimtalkService.send(
          {
            channelId,
            templateCode,
            receiverPhone: phone,
            variables: { code },
          },
          { ip: '127.0.0.1', userId: '00000000-0000-0000-0000-000000000000' },
        );
      } catch (error) {
        console.error('[AUTH] Failed to send Alimtalk:', error.message);
      }
    }

    return { message: '인증번호가 발송되었습니다.' };
  }

  async verifyCode(
    phone: string,
    code: string,
  ): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const record = await this.codeRepo.findOne({
      where: { phone, code, expiresAt: MoreThan(new Date()) },
      order: { createdAt: 'DESC' },
    });

    if (!record)
      throw new BadRequestException(
        '인증번호가 올바르지 않거나 만료되었습니다.',
      );

    await this.codeRepo.remove(record);

    let user = await this.userRepo.findOneBy({ phone });
    if (!user) {
      user = await this.userRepo.save(
        this.userRepo.create({ phone, name: '사용자' }),
      );
    }

    return {
      user,
      accessToken: this.issueAccessToken(user.id),
      refreshToken: await this.issueRefreshToken(user.id),
    };
  }

  async refresh(
    token: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const record = await this.refreshTokenRepo.findOne({
      where: { token, expiresAt: MoreThan(new Date()) },
    });

    if (!record)
      throw new UnauthorizedException('유효하지 않은 리프레시 토큰입니다.');

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

  async getUserById(id: string): Promise<User> {
    const user = await this.userRepo.findOneBy({ id });
    if (!user) throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
    return user;
  }

  private issueAccessToken(userId: string): string {
    return this.jwtService.sign({ sub: userId }, { expiresIn: '15m' });
  }

  private async issueRefreshToken(userId: string): Promise<string> {
    const token = randomBytes(40).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.refreshTokenRepo.save(
      this.refreshTokenRepo.create({ token, userId, expiresAt }),
    );
    return token;
  }
}
