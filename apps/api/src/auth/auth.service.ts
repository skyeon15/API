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
import { RefreshToken } from './entities/refresh-token.entity.js';
import {
  UserSocialAccount,
  SocialProvider,
} from './entities/user-social-account.entity.js';
import { OauthClient } from './entities/oauth-client.entity.js';
import { OauthGrant, GrantStatus } from './entities/oauth-grant.entity.js';
import { OauthClientAdmin } from './entities/oauth-client-admin.entity.js';
import { parsePhone } from '../common/utils/phone.util.js';
import {
  SSO_TOKEN_TYPE,
  type AccessTokenPayload,
} from '../common/utils/session-token.util.js';

// PATCH /auth/me 로 본인이 직접 수정할 수 있는 필드.
// ci·roles·status·metadata 등 권한/식별 관련 필드는 제외하고, phone은 별도 규칙으로 처리한다.
const SELF_EDITABLE_PROFILE_FIELDS = [
  'name',
  'nickname',
  'profileImageUrl',
  'email',
  'birthDate',
  'gender',
  'zipCode',
  'address',
  'detailAddress',
  'addressCountry',
  'addressCity',
  'addressState',
  'company',
] as const satisfies readonly (keyof User)[];

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(UserSocialAccount)
    private readonly socialAccountRepo: Repository<UserSocialAccount>,
    @InjectRepository(OauthClient)
    private readonly oauthClientRepo: Repository<OauthClient>,
    @InjectRepository(OauthGrant)
    private readonly oauthGrantRepo: Repository<OauthGrant>,
    @InjectRepository(OauthClientAdmin)
    private readonly clientAdminRepo: Repository<OauthClientAdmin>,
    private readonly jwtService: JwtService,
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

  async exchangeCode(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string,
  ) {
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
    // RFC 6749 4.1.3: 인가 요청에 쓴 redirect_uri와 일치해야 code 탈취를 막을 수 있다
    if (codeData.redirectUri !== redirectUri) {
      throw new BadRequestException('리다이렉트 주소가 일치하지 않습니다.');
    }

    await this.redis.del(`auth_code:${code}`);

    const user = await this.getUserById(codeData.userId);
    // 연동 서비스에 나가는 토큰은 세션 토큰과 구분돼야 한다 — 표식이 없으면 이 토큰을
    // 쿠키에 실어 본인 전용 API 를 호출할 수 있다(scope 우회).
    const accessToken = this.issueAccessToken(user.id, {
      clientId,
      scope: codeData.scope,
    });
    const refreshToken = await this.issueRefreshToken(user.id, clientId);
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
      // 🔴 iat·exp 를 여기서 넣지 않는다. JwtModule 이 signOptions.expiresIn 을 붙이는데
      //    payload 에 exp 가 이미 있으면 jsonwebtoken 이 던진다
      //    (Bad "options.expiresIn" option the payload already has an "exp" property).
      //    그래서 /auth/token 이 늘 500 이었다 — 아래 sign 옵션으로 수명을 준다.
    };

    Object.assign(payload, this.buildScopedClaims(user, scope));

    // id_token 은 1시간. issueAccessToken(15분)과 따로 정한다.
    return this.jwtService.sign(payload, { expiresIn: '1h' });
  }

  /**
   * scope 로 허용된 클레임만 고른다.
   *
   * id_token 과 userinfo 가 같은 규칙을 쓰게 하려고 한곳에 모았다 — 예전엔 userinfo 가
   * scope 를 무시하고 늘 name/nickname/email/picture 를 줬고(동의 안 받은 이메일까지 나갔다),
   * 반대로 phone·address 는 동의를 받아도 id_token 에만 있어 userinfo 로는 못 가져갔다.
   */
  private buildScopedClaims(user: User, scope: string): Record<string, any> {
    const scopes = scope.split(' ').filter(Boolean);
    const claims: Record<string, any> = {};

    if (scopes.includes('profile')) {
      claims.name = user.name;
      claims.nickname = user.nickname;
      claims.picture = user.profileImageUrl;
      claims.birthdate = user.birthDate;
    }
    if (scopes.includes('email')) claims.email = user.email;
    if (scopes.includes('phone')) claims.phone_number = user.phone;
    if (scopes.includes('address')) {
      claims.address = {
        // 🔴 빈 값을 그대로 이어 붙이면 «null null» 이나 앞뒤 공백이 남는다
        formatted: [
          user.address,
          user.detailAddress,
          user.addressCity,
          user.addressState,
        ]
          .filter(Boolean)
          .join(' '),
        street_address: user.address || undefined,
        // OIDC 표준 주소에는 «상세 주소» 자리가 없다. 한국 주소는 동·호수가 따로 다뤄지고
        // 연동 서비스가 배송지 칸을 둘로 나눠 두므로 확장 키로 함께 싣는다.
        detail: user.detailAddress || undefined,
        locality: user.addressCity || undefined,
        region: user.addressState || undefined,
        postal_code: user.zipCode || undefined,
        country: user.addressCountry || undefined,
      };
    }
    return claims;
  }

  /**
   * SSO userinfo. 토큰에 실린 scope 만큼만 내려주고, 그 서비스의 관리자인지도 함께 알려준다.
   */
  async getUserinfo(payload: AccessTokenPayload) {
    const user = await this.getUserById(payload.sub);
    // 표식 없는 예전 토큰(배포 직전 발급분)은 scope 를 모른다 — 종전 동작으로 둔다.
    const scope = payload.scope ?? 'profile email';

    return {
      sub: user.id,
      ...this.buildScopedClaims(user, scope),
      isServiceAdmin: payload.aud
        ? await this.isClientAdmin(payload.aud, user.id)
        : false,
    };
  }

  // --- 서비스(SSO 클라이언트)별 관리자 ---

  /** 그 서비스의 관리자인지. 플랫폼 전체 ADMIN 과는 별개다. */
  async isClientAdmin(clientId: string, userId: string): Promise<boolean> {
    return (await this.clientAdminRepo.countBy({ clientId, userId })) > 0;
  }

  async listClientAdmins(clientId: string) {
    const rows = await this.clientAdminRepo.find({
      where: { clientId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
    // 관리자 목록에 남의 ci·metadata 까지 실어 보내지 않는다.
    return rows.map((row) => ({
      userId: row.userId,
      name: row.user?.name ?? null,
      nickname: row.user?.nickname ?? null,
      email: row.user?.email ?? null,
      createdAt: row.createdAt,
    }));
  }

  /** 사용자 id 또는 이메일로 지정한다(콘솔에서 uuid 를 외우게 하지 않는다). */
  async addClientAdmin(
    clientId: string,
    target: { userId?: string; email?: string },
  ) {
    const user = target.userId
      ? await this.userRepo.findOneBy({ id: target.userId })
      : target.email
        ? await this.userRepo.findOneBy({ email: target.email })
        : null;
    if (!user) throw new BadRequestException('사용자를 찾을 수 없습니다.');

    const existing = await this.clientAdminRepo.findOneBy({
      clientId,
      userId: user.id,
    });
    if (existing) return this.listClientAdmins(clientId);

    await this.clientAdminRepo.save(
      this.clientAdminRepo.create({ clientId, userId: user.id }),
    );
    return this.listClientAdmins(clientId);
  }

  async removeClientAdmin(clientId: string, userId: string) {
    await this.clientAdminRepo.delete({ clientId, userId });
    return this.listClientAdmins(clientId);
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
      if (!user.name && profile.name) {
        user.name = profile.name;
        updated = true;
      }
      if (!user.nickname && profile.nickname) {
        user.nickname = profile.nickname;
        updated = true;
      }
      if (!user.phone && profile.phone) {
        // 카카오·네이버가 주는 번호는 그쪽에서 본인확인이 끝난 번호다.
        user.phone = profile.phone;
        user.phoneVerified = true;
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
      if (!user.name && profile.name) {
        user.name = profile.name;
        updated = true;
      }
      if (!user.nickname && profile.nickname) {
        user.nickname = profile.nickname;
        updated = true;
      }
      if (!user.phone && profile.phone) {
        // 카카오·네이버가 주는 번호는 그쪽에서 본인확인이 끝난 번호다.
        user.phone = profile.phone;
        user.phoneVerified = true;
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
          // 🔴 «사용자» 같은 가짜 이름을 넣지 않는다. name 은 NOT NULL 이라 빈 문자열을
          //    쓰는데, 가입 완료 판정(isProfileComplete)이 공백을 «없음»으로 보므로
          //    소셜에서 실명이 안 오면 가입 정보 입력 화면이 제대로 뜬다.
          name: profile.name || '',
          nickname: profile.nickname || null,
          email: profile.email,
          ci: profile.ci,
          phone: profile.phone,
          phoneVerified: Boolean(profile.phone),
          gender: profile.gender,
          birthDate: profile.birthDate,
          profileImageUrl: profile.profileImageUrl,
        }),
      );
    } else {
      // 정보 업데이트 (기존 유저 정보 보강)
      let updated = false;
      if (!user.name && profile.name) {
        user.name = profile.name;
        updated = true;
      }
      if (!user.nickname && profile.nickname) {
        user.nickname = profile.nickname;
        updated = true;
      }
      if (!user.phone && profile.phone) {
        // 카카오·네이버가 주는 번호는 그쪽에서 본인확인이 끝난 번호다.
        user.phone = profile.phone;
        user.phoneVerified = true;
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
    const patch: Partial<User> = {};
    for (const field of SELF_EDITABLE_PROFILE_FIELDS) {
      if (data[field] !== undefined) patch[field] = data[field] as any;
    }

    // 닉네임은 필수 항목이지만 비워 둔 채로 넘어올 수 있다 — 그때는 이름으로 채운다.
    // 여기서 채우지 않으면 가입 완료 판정을 통과하지 못해 가입 화면을 벗어날 수 없다.
    if (patch.nickname !== undefined && !String(patch.nickname ?? '').trim()) {
      const name = patch.name ?? (await this.getUserById(userId)).name;
      patch.nickname = (name ?? '').trim();
    }

    // 전화번호는 로그인 수단이 아니라 연락처 필드다(문자 인증 로그인은 제거됐다).
    // 본인이 자유롭게 고칠 수 있고, 형식 정규화와 중복 확인만 한다.
    // 직접 입력한 번호는 출처가 확인되지 않았으므로 phoneVerified=false 로 내린다 —
    // 알림톡·결제처럼 «주인이 확인된 번호»가 필요한 곳은 그 컬럼을 봐야 한다.
    if (data.phone !== undefined) {
      const phone = parsePhone(data.phone as string);
      if (!phone) {
        throw new BadRequestException('전화번호 형식이 올바르지 않습니다.');
      }

      const current = await this.getUserById(userId);
      if (phone !== current.phone) {
        await this.assertPhoneNotTaken(userId, phone);
        patch.phone = phone;
        patch.phoneVerified = false;
      }
    }

    if (Object.keys(patch).length > 0) {
      await this.userRepo.update(userId, patch);
    }
    return this.getMyProfile(userId);
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

    // 카카오는 '+82 10-0000-0000' 형태로 준다. 해외 계정이면 국가번호가 +82 가 아니므로
    // 저장 형식 판단은 parsePhone 에 맡긴다(국내는 01000000000, 해외는 E.164).
    const phone = parsePhone(account?.phone_number);

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
      // 🔴 `profile.nickname` 은 닉네임이지 실명이 아니다. 카카오의 실명은
      //    `kakao_account.name` 이고 별도 동의 항목이라 안 올 수 있다.
      //    실명을 못 받으면 비워 둔다 — 닉네임을 실명 칸에 넣으면 가입 완료로
      //    잘못 판정돼 사용자가 이름을 적을 기회를 잃는다.
      name: account?.name ?? null,
      nickname: account?.profile?.nickname ?? null,
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
      nickname,
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
      // 네이버는 실명(name)과 닉네임(nickname)을 따로 준다. 섞지 않는다.
      name: name ?? null,
      nickname: nickname ?? null,
      profileImageUrl: profile_image,
      phone: parsePhone(mobile),
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

  /** 다른 계정이 이미 쓰고 있는 번호인지 확인한다. */
  private async assertPhoneNotTaken(userId: string, phone: string) {
    const owner = await this.userRepo.findOneBy({ phone });
    if (owner && owner.id !== userId) {
      throw new BadRequestException(
        '이미 다른 계정에서 사용 중인 전화번호입니다.',
      );
    }
  }

  async refresh(
    token: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const record = await this.refreshTokenRepo.findOne({
      where: { token, expiresAt: MoreThan(new Date()) },
    });

    if (!record)
      throw new UnauthorizedException('유효하지 않은 리프레시 토큰입니다.');

    // SSO 교환으로 나간 리프레시 토큰으로는 브라우저 세션을 만들 수 없다.
    // 연동 서비스는 만료되면 authorize 를 다시 태워야 한다.
    if (record.clientId) {
      throw new UnauthorizedException(
        '세션 갱신에 사용할 수 없는 토큰입니다.',
      );
    }

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

  /**
   * 본인에게 내려주는 프로필.
   *
   * 엔티티를 그대로 반환하면 `ci`(본인확인 고유값)·`stripeCustomerId`·`metadata`(운영자 자유 필드)까지
   * 브라우저로 나간다. 본인 데이터라 유출은 아니지만 프론트가 쓸 일이 없는 값들이라 골라서 내린다.
   * (`roles` 는 관리 콘솔의 ADMIN 판정에 실제로 쓰이므로 포함한다.)
   */
  async getMyProfile(userId: string) {
    const u = await this.getUserById(userId);
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      nickname: u.nickname,
      profileImageUrl: u.profileImageUrl,
      birthDate: u.birthDate,
      gender: u.gender,
      phone: u.phone,
      phoneVerified: u.phoneVerified,
      zipCode: u.zipCode,
      address: u.address,
      detailAddress: u.detailAddress,
      addressCountry: u.addressCountry,
      addressCity: u.addressCity,
      addressState: u.addressState,
      company: u.company,
      roles: u.roles,
      status: u.status,
      createdAt: u.createdAt,
    };
  }

  async getUserById(id: string): Promise<User> {
    const user = await this.userRepo.findOneBy({ id });
    if (!user) throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
    return user;
  }

  /**
   * 액세스 토큰. `sso` 를 주면 연동 서비스용 토큰으로 표식(typ/aud/scope)을 붙인다.
   * 표식이 없는 토큰은 브라우저 세션 토큰이다.
   */
  private issueAccessToken(
    userId: string,
    sso?: { clientId: string; scope: string },
  ): string {
    const payload = sso
      ? { sub: userId, typ: SSO_TOKEN_TYPE, aud: sso.clientId, scope: sso.scope }
      : { sub: userId };
    return this.jwtService.sign(payload, { expiresIn: '15m' });
  }

  /**
   * 리프레시 토큰. SSO 교환으로 발급한 것은 `clientId` 를 남겨 세션용과 구분한다 —
   * 구분하지 않으면 연동 서비스가 이 토큰을 쿠키에 실어 `POST /auth/refresh` 로
   * 세션 액세스 토큰을 받아낼 수 있다(액세스 토큰에 표식을 붙인 의미가 사라진다).
   */
  private async issueRefreshToken(
    userId: string,
    clientId?: string,
  ): Promise<string> {
    const token = randomBytes(40).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.refreshTokenRepo.save(
      this.refreshTokenRepo.create({
        token,
        userId,
        expiresAt,
        clientId: clientId ?? null,
      }),
    );
    return token;
  }
}
