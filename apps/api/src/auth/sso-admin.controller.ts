import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { OauthClient } from './entities/oauth-client.entity.js';
import { ApiKeyOrSessionGuard } from '../common/guards/api-key-or-session.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../users/entities/user.entity.js';

// 관리 콘솔에서 수정을 허용하는 필드만 골라낸다 (clientId/secret은 발급·재발급 전용)
const EDITABLE_FIELDS = [
  'clientName',
  'redirectUris',
  'logoUrl',
  'primaryColor',
  'themeConfig',
  'allowedScopes',
  'requiredScopes',
  'autoGrant',
] as const;

/** 관리 콘솔(웹) 전용 SSO 클라이언트 관리 API — 외부 연동 문서에는 노출하지 않는다 */
@ApiExcludeController()
@Controller('auth/clients')
@UseGuards(ApiKeyOrSessionGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class SsoAdminController {
  constructor(
    @InjectRepository(OauthClient)
    private readonly oauthClientRepo: Repository<OauthClient>,
  ) {}

  @Get()
  list() {
    return this.oauthClientRepo.find({ order: { createdAt: 'DESC' } });
  }

  @Post()
  create(@Body() body: Partial<OauthClient>) {
    const client = this.oauthClientRepo.create({
      clientId: body.clientId || randomBytes(12).toString('hex'),
      clientSecret: randomBytes(32).toString('hex'),
      clientName: body.clientName,
      redirectUris: body.redirectUris ?? [],
      logoUrl: body.logoUrl,
      themeConfig: body.themeConfig,
      allowedScopes: body.allowedScopes ?? ['openid', 'profile'],
      requiredScopes: body.requiredScopes ?? ['openid', 'profile'],
      autoGrant: body.autoGrant ?? false,
      ...(body.primaryColor ? { primaryColor: body.primaryColor } : {}),
    });
    return this.oauthClientRepo.save(client);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: Partial<OauthClient>) {
    const client = await this.findOrThrow(id);
    for (const field of EDITABLE_FIELDS) {
      if (body[field] !== undefined) (client as any)[field] = body[field];
    }
    return this.oauthClientRepo.save(client);
  }

  @Post(':id/regenerate-secret')
  async regenerateSecret(@Param('id') id: string) {
    const client = await this.findOrThrow(id);
    client.clientSecret = randomBytes(32).toString('hex');
    return this.oauthClientRepo.save(client);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const client = await this.findOrThrow(id);
    await this.oauthClientRepo.remove(client);
    return { success: true };
  }

  private async findOrThrow(id: string): Promise<OauthClient> {
    const client = await this.oauthClientRepo.findOneBy({ id });
    if (!client)
      throw new NotFoundException('SSO 클라이언트를 찾을 수 없습니다.');
    return client;
  }
}
