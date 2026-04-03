import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { LostarkService } from './lostark.service.js';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiProduces,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiHeader,
} from '@nestjs/swagger';
import { Service } from '../common/decorators/service.decorator.js';
import { ApiKeyGuard } from '../common/guards/api-key.guard.js';

@ApiTags('게임')
@ApiBearerAuth('api-key')
@ApiHeader({
  name: 'Authorization',
  description: 'Bearer {API_KEY} 형태로 입력해 주세요.',
  required: true,
  example: 'Bearer YOUR_SECRET_TOKEN',
})
@ApiUnauthorizedResponse({
  description: 'API 키가 없거나 형식이 올바르지 않아요.',
  schema: {
    example: {
      statusCode: 401,
      message: 'API 키가 없거나 형식이 올바르지 않아요.',
      error: 'Unauthorized',
    },
  },
})
@ApiForbiddenResponse({
  description: '이 API 키는 해당 서비스에 대한 접근 권한이 없어요.',
  schema: {
    example: {
      statusCode: 403,
      message: "해당 서비스('lostark')에 대한 접근 권한이 없는 API 키예요.",
      error: 'Forbidden',
    },
  },
})
@Controller('lostark')
@UseGuards(ApiKeyGuard)
@Service('lostark')
export class LostarkController {
  constructor(private readonly lostarkService: LostarkService) {}

  @Get()
  @ApiProduces('application/json', 'text/plain')
  @ApiOperation({
    summary: '로스트아크 프로필 정보',
    description: `로스트아크 캐릭터의 상세 프로필을 확인할 수 있어요.\n\n**텍스트 응답 예시 (?type=text):**\n\`\`\`text\n[ 에케의 로스트아크 ]\n조회시각 : 2026-03-26 07:31:06\nLv.60\n서버 : 카제로스\n...\n\`\`\``,
  })
  @ApiQuery({
    name: 'nickname',
    description: '정보를 찾고 싶은 캐릭터의 닉네임이에요.',
    required: true,
    example: '에케',
  })
  @ApiQuery({
    name: 'type',
    description: '결과를 어떤 형식으로 드릴까요? (json 또는 text)',
    required: false,
    example: 'json',
  })
  @ApiResponse({
    status: 200,
    description:
      '캐릭터 프로필 정보를 성공적으로 찾았어요. 정말 강력한 캐릭터네요!',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '캐릭터 닉네임' },
            server: { type: 'string', description: '소속 서버' },
            level: { type: 'string', description: '전투 레벨' },
            lever_expedition: { type: 'string', description: '원정대 레벨' },
            level_fight: { type: 'string', description: '아이템 레벨 (전투)' },
            level_item: { type: 'string', description: '장착 아이템 레벨' },
            level_item2: { type: 'string', description: '달성 아이템 레벨' },
            title: { type: 'string', description: '장착 중인 칭호' },
            guild: { type: 'string', description: '소속 길드' },
            pvp: { type: 'string', description: 'PVP 등급' },
            wisdom: { type: 'string', description: '영지 이름' },
            wisdom_level: { type: 'string', description: '영지 레벨' },
          },
        },
        example: {
          name: '에케',
          server: '카제로스',
          level: '60',
          lever_expedition: '300',
          level_fight: '60',
          level_item: '1620.00',
          level_item2: '1620.00',
          title: '파란대나무숲의 주인',
          guild: '파란대나무숲',
          pvp: '1급',
          wisdom: '에케영지',
          wisdom_level: '70',
        },
      },
      'text/plain': {
        example:
          '[ 에케의 로스트아크 ][br]조회시각 : 2026-03-26 07:31:06[br]Lv.60[br]서버 : 카제로스[br]PVP : 1급[br]칭호 : 파란대나무숲의 주인[br]길드 : 파란대나무숲[br]영지 : 에케영지 (Lv.70)[br][br]레벨 정보[br]원정대 : 300[br]전투 : 60[br]장착 아이템 : 1620.00[br]달성 아이템 : 1620.00',
      },
    },
  })
  @ApiResponse({
    status: 404,
    description:
      '아무리 찾아봐도 해당 캐릭터를 찾을 수 없어요. 닉네임이 정확한지 확인해 주세요!',
  })
  async getProfile(
    @Req() req: Request,
    @Query('nickname') nickname: string,
    @Query('type') type?: string,
  ) {
    const profile = await this.lostarkService.getProfile(nickname);
    const format =
      type || (req.headers.accept?.includes('text/plain') ? 'text' : 'json');

    if (format === 'text' || format === 'txt') {
      return this.lostarkService.formatAsText(profile);
    }

    return profile;
  }
}
