import { Controller, Get, Post, Put, Delete, Patch, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiUnauthorizedResponse, ApiForbiddenResponse, ApiHeader, ApiQuery, ApiParam, ApiBody, ApiResponse, ApiExcludeEndpoint } from '@nestjs/swagger';
import { AlimtalkService } from './alimtalk.service.js';
import { TemplateType } from './entities/template.entity.js';
import { Service } from '../common/decorators/service.decorator.js';
import { ApiKeyOrSessionGuard } from '../common/guards/api-key-or-session.guard.js';
import { CurrentApiKey } from '../common/decorators/api-key.decorator.js';
import { ApiKey } from '../admin/entities/api-key.entity.js';

@ApiTags('알림톡')
@ApiBearerAuth('api-key')
@ApiHeader({ name: 'Authorization', description: 'Bearer {API_KEY} 형태로 입력해 주세요.', required: true, example: 'Bearer YOUR_SECRET_TOKEN' })
@ApiUnauthorizedResponse({ description: 'API 키가 없거나 형식이 올바르지 않아요.' })
@ApiForbiddenResponse({ description: '이 API 키는 해당 서비스에 대한 접근 권한이 없어요.' })
@Controller('alimtalk')
@UseGuards(ApiKeyOrSessionGuard)
@Service('alimtalk')
export class AlimtalkController {
  constructor(private readonly alimtalkService: AlimtalkService) {}

  private ctx(apiKey: ApiKey | undefined, req: Request) {
    return { apiKeyId: apiKey?.id, userId: apiKey?.userId ?? req['userId'] ?? undefined, ip: req.ip };
  }

  // ── 채널 ──────────────────────────────────────────────────────────────────

  @Get('categories')
  @ApiOperation({ summary: '카카오 카테고리 목록', description: '채널 등록 시 필요한 카카오 비즈니스 카테고리 목록이에요.' })
  getCategories() {
    return this.alimtalkService.getCategories();
  }

  @Post('channels')
  @ApiOperation({ summary: '채널 등록', description: '전송받은 인증번호를 입력하여 채널을 최종 등록해요.' })
  addChannel(
    @Body() body: { plusId: string; authNum: string; phone: string; categoryCode: string; name: string },
    @CurrentApiKey() apiKey: ApiKey,
    @Req() req: Request,
  ) {
    return this.alimtalkService.addChannel(body, this.ctx(apiKey, req));
  }

  @Post('channels/auth')
  @ApiOperation({ summary: '채널 인증 요청', description: '카카오 채널 등록을 위한 인증번호를 요청해요. 입력한 전화번호로 전송돼요.' })
  requestChannelAuth(@Body() body: { plusId: string; phone: string }) {
    return this.alimtalkService.requestChannelAuth(body.plusId, body.phone);
  }

  @Get('channels')
  @ApiOperation({ summary: '채널 목록 조회' })
  getChannels(@CurrentApiKey() apiKey: ApiKey, @Req() req: Request) {
    return this.alimtalkService.getChannels(this.ctx(apiKey, req).userId);
  }

  @Patch('channels/:id')
  @ApiOperation({ summary: '채널 수정', description: '채널 별칭이나 활성 여부를 수정해요.' })
  @ApiParam({ name: 'id', description: '채널 ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '채널 별칭' },
        isActive: { type: 'boolean', description: '활성 여부' },
      },
    },
  })
  updateChannel(
    @Param('id') id: number,
    @Body() body: { name?: string; isActive?: boolean },
    @CurrentApiKey() apiKey: ApiKey,
    @Req() req: Request,
  ) {
    return this.alimtalkService.updateChannel(id, body, this.ctx(apiKey, req));
  }

  // ── 템플릿 ────────────────────────────────────────────────────────────────

  @Get('templates')
  @ApiOperation({ summary: '템플릿 목록 조회', description: 'DB에 저장된 템플릿 목록이에요.' })
  @ApiQuery({ name: 'channelId', required: false, description: '채널 ID로 필터링', type: Number })
  getTemplates(@CurrentApiKey() apiKey: ApiKey, @Req() req: Request, @Query('channelId') channelId?: number) {
    return this.alimtalkService.getTemplates(this.ctx(apiKey, req).userId, channelId);
  }

  @Get('templates/live')
  @ApiOperation({ summary: '템플릿 실시간 조회', description: '최신 템플릿 목록을 직접 조회해요.' })
  @ApiQuery({ name: 'senderKey', required: false, description: 'SenderKey로 필터링' })
  getLiveTemplates(@Query('senderKey') senderKey?: string) {
    return this.alimtalkService.getLiveTemplates(senderKey);
  }

  @Post('templates/sync')
  @ApiOperation({ summary: '템플릿 동기화', description: '최신 템플릿 정보를 DB에 동기화해요.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['channelId'],
      properties: {
        channelId: { type: 'number', description: '동기화할 채널 ID' },
      },
    },
  })
  syncTemplates(
    @Body() body: { channelId: number },
    @CurrentApiKey() apiKey: ApiKey,
    @Req() req: Request,
  ) {
    return this.alimtalkService.syncTemplates(body.channelId, this.ctx(apiKey, req));
  }

  @Post('templates')
  @ApiOperation({ summary: '템플릿 생성', description: '새 알림톡 템플릿을 생성하고 카카오에 등록해요. 생성 후 검수 요청이 필요해요.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['channelId', 'name', 'type', 'content'],
      properties: {
        channelId: { type: 'number' },
        name: { type: 'string', example: '가예약 안내' },
        type: { type: 'string', enum: ['기본형', '강조표기형', '이미지형'], default: '기본형' },
        content: { type: 'string', example: '#{이름}님, 예약이 완료되었습니다.' },
        title: { type: 'string', description: '강조표기형 전용 제목', nullable: true },
        subtitle: { type: 'string', description: '강조표기형 전용 서브타이틀', nullable: true },
        buttons: {
          type: 'array',
          nullable: true,
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', example: '자세히 보기' },
              linkType: { type: 'string', enum: ['WL', 'AL', 'DS', 'BK', 'MD'], example: 'WL' },
              linkMo: { type: 'string', example: 'https://bbforest.net' },
              linkPc: { type: 'string', example: 'https://bbforest.net' },
            },
          },
        },
      },
    },
  })
  createTemplate(
    @Body() body: { channelId: number; name: string; type: TemplateType; content: string; title?: string; subtitle?: string; buttons?: Record<string, any>[] },
    @CurrentApiKey() apiKey: ApiKey,
    @Req() req: Request,
  ) {
    return this.alimtalkService.createTemplate(body, this.ctx(apiKey, req));
  }

  @Post('templates/:code/request')
  @ApiOperation({ summary: '템플릿 검수 요청', description: '카카오 비즈니스에 템플릿 검수를 요청해요.' })
  @ApiParam({ name: 'code', description: '템플릿 코드', example: 'UC_0257' })
  requestInspection(
    @Param('code') code: string,
    @CurrentApiKey() apiKey: ApiKey,
    @Req() req: Request,
  ) {
    return this.alimtalkService.requestInspection(code, this.ctx(apiKey, req));
  }

  @Put('templates/:code')
  @ApiOperation({ summary: '템플릿 수정' })
  @ApiParam({ name: 'code', description: '템플릿 코드', example: 'UC_0257' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        content: { type: 'string' },
        title: { type: 'string', nullable: true },
        subtitle: { type: 'string', nullable: true },
        buttons: { type: 'array', nullable: true, items: { type: 'object' } },
      },
    },
  })
  updateTemplate(
    @Param('code') code: string,
    @Body() body: { name?: string; content?: string; title?: string; subtitle?: string; buttons?: Record<string, any>[] },
    @CurrentApiKey() apiKey: ApiKey,
    @Req() req: Request,
  ) {
    return this.alimtalkService.updateTemplate(code, body, this.ctx(apiKey, req));
  }

  @Delete('templates/:code')
  @ApiOperation({ summary: '템플릿 삭제' })
  @ApiParam({ name: 'code', description: '템플릿 코드', example: 'UC_0257' })
  @ApiQuery({ name: 'type', enum: ['db', 'kakao'], required: false, description: '`db`: DB에서만 삭제, `kakao`: 카카오에서도 삭제 (기본값: `db`)' })
  deleteTemplate(
    @Param('code') code: string,
    @Query('type') type: 'db' | 'kakao' = 'db',
    @CurrentApiKey() apiKey: ApiKey,
    @Req() req: Request,
  ) {
    return this.alimtalkService.deleteTemplate(code, type, this.ctx(apiKey, req));
  }

  // ── 발송 ──────────────────────────────────────────────────────────────────

  @Post('send')
  @ApiOperation({ summary: '알림톡 발송', description: '알림톡을 즉시 또는 예약 발송해요. `scheduledAt`이 없으면 즉시 발송이에요.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['channelId', 'templateCode', 'receiverPhone'],
      properties: {
        channelId: { type: 'number', description: '발송에 사용할 채널 ID' },
        templateCode: { type: 'string', description: '템플릿 코드', example: 'UC_0257' },
        receiverPhone: { type: 'string', description: '수신자 전화번호', example: '01012345678' },
        variables: { type: 'object', description: '템플릿 #{변수명} 치환값', example: { 이름: '홍길동' }, nullable: true },
        scheduledAt: { type: 'string', format: 'date-time', description: '예약 발송 시각 (없으면 즉시 발송)', nullable: true, example: '2026-04-01T10:00:00+09:00' },
      },
    },
  })
  @ApiResponse({ status: 201, description: '발송 요청이 완료됐어요. 예약 발송인 경우 지정한 시각에 발송돼요.' })
  send(
    @Body() body: { channelId: number; templateCode: string; receiverPhone: string; variables?: Record<string, string>; scheduledAt?: Date },
    @CurrentApiKey() apiKey: ApiKey,
    @Req() req: Request,
  ) {
    return this.alimtalkService.send(body, this.ctx(apiKey, req));
  }

  @Delete(':id')
  @ApiOperation({ summary: '예약 발송 취소', description: '예약된 알림톡을 취소해요. 이미 발송된 메시지는 취소할 수 없어요.' })
  @ApiParam({ name: 'id', description: '메시지 ID' })
  cancel(
    @Param('id') id: number,
    @CurrentApiKey() apiKey: ApiKey,
    @Req() req: Request,
  ) {
    return this.alimtalkService.cancel(id, this.ctx(apiKey, req));
  }

  @Get('history')
  @ApiOperation({ summary: '발송 이력 조회' })
  @ApiQuery({ name: 'channelId', required: false, type: Number })
  @ApiQuery({ name: 'templateCode', required: false })
  @ApiQuery({ name: 'receiverPhone', required: false, example: '01012345678' })
  @ApiQuery({ name: 'from', required: false, description: 'ISO 날짜', example: '2026-01-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-12-31' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, description: '최대 100' })
  getHistory(
    @CurrentApiKey() apiKey: ApiKey,
    @Req() req: Request,
    @Query('channelId') channelId?: number,
    @Query('templateCode') templateCode?: string,
    @Query('receiverPhone') receiverPhone?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.alimtalkService.getHistory({
      channelId, templateCode, receiverPhone,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page, limit,
      userId: this.ctx(apiKey, req).userId,
    });
  }

  @Get('history/:id/result')
  @ApiOperation({ summary: '발송 결과 조회', description: '실시간으로 발송 결과를 조회하고 DB에 저장해요.' })
  @ApiParam({ name: 'id', description: '메시지 ID' })
  getResult(@Param('id') id: number, @CurrentApiKey() apiKey: ApiKey, @Req() req: Request) {
    return this.alimtalkService.getResult(id, this.ctx(apiKey, req).userId);
  }
}
