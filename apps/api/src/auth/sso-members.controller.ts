import {
  Controller,
  Get,
  Header,
  Headers,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Repository } from 'typeorm';
import { OauthClient } from './entities/oauth-client.entity.js';
import { OauthGrant, GrantStatus } from './entities/oauth-grant.entity.js';

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
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  async list(
    @Headers('authorization') authorization: string | undefined,
    @Query('page') requestedPage?: string,
    @Query('perPage') requestedPerPage?: string,
    @Query('q') requestedQuery?: string,
  ) {
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

    const perPage = positiveInteger(requestedPerPage, 30, 100);
    const q = typeof requestedQuery === 'string' ? requestedQuery.trim().slice(0, 60) : '';
    const query = this.grants.createQueryBuilder('grant')
      .innerJoin('grant.user', 'user')
      .where('grant.clientId = :clientId', { clientId: client.clientId })
      .andWhere('grant.status = :grantStatus', { grantStatus: GrantStatus.ACTIVE });

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
    const rows = await query.select([
      'user.id AS "id"',
      'user.name AS "name"',
      'user.email AS "email"',
      'user.phone AS "phone"',
      'user.status AS "status"',
      'user.createdAt AS "createdAt"',
      'grant.createdAt AS "firstLoginAt"',
      'grant.grantedScopes AS "scopes"',
    ])
      .orderBy('grant.createdAt', 'DESC')
      .addOrderBy('user.id', 'ASC')
      .offset((page - 1) * perPage)
      .limit(perPage)
      .getRawMany<{
        id: string; name: string | null; email: string | null; phone: string | null;
        status: string; createdAt: Date; firstLoginAt: Date; scopes: string;
      }>();

    const items = rows.map(({ scopes, ...row }) => {
      const consent = new Set(scopes.split(','));
      return {
        ...row,
        name: consent.has('profile') ? row.name : null,
        email: consent.has('email') ? row.email : null,
        phone: consent.has('phone') ? row.phone : null,
      };
    });
    return { items, total, page, perPage };
  }
}
