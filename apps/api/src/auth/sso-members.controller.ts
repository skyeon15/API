import {
  Controller,
  Get,
  Header,
  Headers,
  NotFoundException,
  Param,
  Put,
  Delete,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Repository } from 'typeorm';
import { OauthClient } from './entities/oauth-client.entity.js';
import { OauthGrant, GrantStatus } from './entities/oauth-grant.entity.js';
import { OauthClientAdmin } from './entities/oauth-client-admin.entity.js';

function positiveInteger(value: string | undefined, fallback: number, max: number) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0
    ? Math.min(number, max)
    : fallback;
}

/** A service may read only its own linked accounts and consented contact fields. */
@ApiExcludeController()
@Controller('sso/members')
export class SsoMembersController {
  constructor(
    @InjectRepository(OauthClient)
    private readonly clients: Repository<OauthClient>,
    @InjectRepository(OauthGrant)
    private readonly grants: Repository<OauthGrant>,
    @InjectRepository(OauthClientAdmin)
    private readonly clientAdmins: Repository<OauthClientAdmin>,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  async list(
    @Headers('authorization') authorization: string | undefined,
    @Query('page') requestedPage?: string,
    @Query('perPage') requestedPerPage?: string,
    @Query('q') requestedQuery?: string,
  ) {
    const client = await this.authenticate(authorization);
    const perPage = positiveInteger(requestedPerPage, 30, 100);
    const q = typeof requestedQuery === 'string' ? requestedQuery.trim().slice(0, 60) : '';
    const query = this.memberQuery(client.clientId);

    // Search must respect consent too, so counts cannot reveal withheld fields.
    if (q) {
      const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
      const phoneDigits = q.replace(/[^0-9]/g, '');
      const phonePattern = /^[+\d\s().-]+$/.test(q) && phoneDigits.length > 0
        ? `%${phoneDigits}%` : pattern;
      query.andWhere(`(
        (:profileScope = ANY(string_to_array(grant.grantedScopes, ',')) AND user.name ILIKE :pattern)
        OR (:emailScope = ANY(string_to_array(grant.grantedScopes, ',')) AND user.email ILIKE :pattern)
        OR (:phoneScope = ANY(string_to_array(grant.grantedScopes, ',')) AND
          (user.phone ILIKE :pattern OR regexp_replace(user.phone, '[^0-9]', '', 'g') LIKE :phonePattern))
      )`, { pattern, phonePattern, profileScope: 'profile', emailScope: 'email', phoneScope: 'phone' });
    }

    const total = await query.getCount();
    const page = Math.min(
      positiveInteger(requestedPage, 1, 1_000_000),
      Math.max(1, Math.ceil(total / perPage)),
    );
    const rows = await query.select(MEMBER_COLUMNS)
      .orderBy('grant.createdAt', 'DESC')
      .addOrderBy('user.id', 'ASC')
      .offset((page - 1) * perPage)
      .limit(perPage)
      .getRawMany<MemberRow>();
    return { items: rows.map(scopedMember), total, page, perPage };
  }

  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  async detail(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ) {
    const client = await this.authenticate(authorization);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new NotFoundException('회원을 찾을 수 없습니다.');
    }
    const rows = await this.memberQuery(client.clientId)
      .andWhere('user.id = :userId', { userId: id })
      .select([...MEMBER_COLUMNS,
        'user.nickname AS "nickname"', 'user.birthDate AS "birthDate"',
        'user.phoneVerified AS "phoneVerified"', 'user.address AS "address"',
        'user.detailAddress AS "detailAddress"', 'user.zipCode AS "zipCode"',
        'user.addressCountry AS "addressCountry"', 'user.addressCity AS "addressCity"',
        'user.addressState AS "addressState"',
      ]).limit(1).getRawMany<MemberRow & {
        nickname: string | null; birthDate: string | null; phoneVerified: boolean;
        address: string | null; detailAddress: string | null; zipCode: string | null;
        addressCountry: string | null; addressCity: string | null; addressState: string | null;
      }>();
    const row = rows[0];
    if (!row) throw new NotFoundException('회원을 찾을 수 없습니다.');
    const consent = new Set(row.scopes.split(','));
    return {
      ...scopedMember(row),
      isServiceAdmin: await this.clientAdmins.existsBy({ clientId: client.clientId, userId: id }),
      nickname: consent.has('profile') ? row.nickname : null,
      birthDate: consent.has('profile') ? row.birthDate : null,
      phoneVerified: consent.has('phone') ? row.phoneVerified : null,
      address: consent.has('address') ? {
        line1: row.address, line2: row.detailAddress, zipcode: row.zipCode,
        country: row.addressCountry, city: row.addressCity, state: row.addressState,
      } : null,
    };
  }

  /** A service may change only its own linked member's service-admin role. */
  @Put(':id/admin')
  @Header('Cache-Control', 'private, no-store')
  async grantAdmin(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ) {
    const client = await this.authenticate(authorization);
    await this.requireLinkedMember(client.clientId, id);
    await this.clientAdmins.createQueryBuilder().insert()
      .values({ clientId: client.clientId, userId: id }).orIgnore().execute();
    return { isServiceAdmin: true };
  }

  @Delete(':id/admin')
  @Header('Cache-Control', 'private, no-store')
  async revokeAdmin(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ) {
    const client = await this.authenticate(authorization);
    await this.requireLinkedMember(client.clientId, id);
    await this.clientAdmins.delete({ clientId: client.clientId, userId: id });
    return { isServiceAdmin: false };
  }

  private async requireLinkedMember(clientId: string, id: string): Promise<void> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
      await this.memberQuery(clientId).andWhere('user.id = :userId', { userId: id }).getCount() === 0) {
      throw new NotFoundException('회원을 찾을 수 없습니다.');
    }
  }

  private memberQuery(clientId: string) {
    return this.grants.createQueryBuilder('grant')
      .innerJoin('grant.user', 'user')
      .where('grant.clientId = :clientId', { clientId })
      .andWhere('grant.status = :grantStatus', { grantStatus: GrantStatus.ACTIVE });
  }

  private async authenticate(authorization: string | undefined) {
    // Server credentials also support a service's separate administrator login.
    // Never accept a client ID from the query independently of this credential.
    if (!authorization?.startsWith('Basic ') || authorization.length > 4096) {
      throw new UnauthorizedException('서비스 인증이 필요합니다.');
    }
    const credentials = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    const separator = credentials.indexOf(':');
    if (separator < 1) throw new UnauthorizedException('서비스 인증에 실패했습니다.');
    const clientId = credentials.slice(0, separator);
    const suppliedSecret = credentials.slice(separator + 1);
    const client = await this.clients.findOneBy({ clientId });
    const digest = (value: string) => createHash('sha256').update(value).digest();
    const matches = timingSafeEqual(digest(suppliedSecret), digest(client?.clientSecret ?? ''));
    if (!client?.clientSecret || !suppliedSecret || !matches) {
      throw new UnauthorizedException('서비스 인증에 실패했습니다.');
    }

    return client;
  }
}

const MEMBER_COLUMNS = [
  'user.id AS "id"', 'user.name AS "name"', 'user.email AS "email"',
  'user.phone AS "phone"', 'user.status AS "status"',
  // These legacy columns are timestamp without time zone but contain UTC values.
  // Decode them as UTC before pg parses them in a server running in Asia/Seoul.
  `user.createdAt AT TIME ZONE 'UTC' AS "createdAt"`,
  `grant.createdAt AT TIME ZONE 'UTC' AS "firstLoginAt"`,
  'grant.grantedScopes AS "scopes"',
];
type MemberRow = {
  id: string; name: string | null; email: string | null; phone: string | null;
  status: string; createdAt: Date; firstLoginAt: Date; scopes: string;
};
function scopedMember(row: MemberRow) {
  const consent = new Set(row.scopes.split(','));
  return {
    id: row.id, status: row.status, createdAt: row.createdAt, firstLoginAt: row.firstLoginAt,
    name: consent.has('profile') ? row.name : null,
    email: consent.has('email') ? row.email : null,
    phone: consent.has('phone') ? row.phone : null,
  };
}
