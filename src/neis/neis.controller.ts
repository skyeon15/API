import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { NeisService } from './neis.service.js';
import { ApiOperation, ApiParam, ApiTags, ApiResponse, ApiBearerAuth, ApiUnauthorizedResponse, ApiForbiddenResponse, ApiHeader } from '@nestjs/swagger';
import { Service } from '../common/decorators/service.decorator.js';
import { ApiKeyGuard } from '../common/guards/api-key.guard.js';

@ApiTags('학교')
@ApiBearerAuth('api-key')
@ApiHeader({
  name: 'Authorization',
  description: 'Bearer {API_KEY} 형태로 입력해 주세요.',
  required: true,
  example: 'Bearer YOUR_SECRET_TOKEN'
})
@ApiUnauthorizedResponse({
  description: 'API 키가 없거나 형식이 올바르지 않아요.',
  schema: {
    example: {
      statusCode: 401,
      message: 'API 키가 없거나 형식이 올바르지 않아요.',
      error: 'Unauthorized'
    }
  }
})
@ApiForbiddenResponse({
  description: '이 API 키는 해당 서비스에 대한 접근 권한이 없어요.',
  schema: {
    example: {
      statusCode: 403,
      message: '해당 서비스(\'neis\')에 대한 접근 권한이 없는 API 키예요.',
      error: 'Forbidden'
    }
  }
})
@Controller('school-lunch')
@UseGuards(ApiKeyGuard)
@Service('neis')
export class NeisController {
  constructor(private readonly neisService: NeisService) {}

  @Get(':name')
  @ApiOperation({ 
    summary: '급식 메뉴', 
    description: '오늘 점심이나 저녁에 무엇이 나오는지 궁금하신가요? 학교 이름을 입력해 주시면 메뉴를 알려드릴게요!' 
  })
  @ApiParam({ 
    name: 'name', 
    description: '메뉴가 궁금한 학교 이름이에요. (예: 서울고등학교, 부산대신중학교 등)',
    required: true,
    example: '서울고등학교'
  })
  @ApiResponse({ 
    status: 200, 
    description: '오늘의 맛있는 급식 메뉴 정보를 불러왔어요. 맛있게 드세요!',
    schema: {
      type: 'object',
      properties: {
        STATUS: { type: 'string', description: '요청 결과 상태 (정상/오류)' },
        NAME: { type: 'string', description: '학교 이름' },
        datetime: { type: 'string', description: '조회 기준 날짜 (YYYY-MM-DD hh:mm:ss)' },
        MEALS: {
          type: 'array',
          description: '급식 메뉴 목록',
          items: {
            type: 'object',
            properties: {
              meal: { type: 'string', description: '식사 구분 (예: 중식, 석식)' },
              dish: { type: 'string', description: '식단 요리명 (개행은 [br]로 표시됨)' }
            }
          }
        }
      },
      example: {
        STATUS: "정상",
        NAME: "서울고등학교",
        datetime: "2026-03-26 00:00:00",
        MEALS: [
          {
            meal: "중식",
            dish: "보리밥[br]쇠고기미역국[br]돈까스[br]배추김치"
          }
        ]
      }
    }
  })
  async getLunch(@Param('name') name: string) {
    return this.neisService.getSchoolLunch(name);
  }
}
