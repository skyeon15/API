import { Controller, Get, Post, Query, Body, Ip, UseGuards } from '@nestjs/common';
import { WruaService } from './wrua.service.js';
import { ApiTags, ApiOperation, ApiQuery, ApiBody, ApiResponse, ApiBearerAuth, ApiUnauthorizedResponse, ApiForbiddenResponse, ApiHeader } from '@nestjs/swagger';
import { Service } from '../common/decorators/service.decorator.js';
import { ApiKeyGuard } from '../common/guards/api-key.guard.js';

@ApiTags('일정관리')
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
      message: '해당 서비스(\'wrua\')에 대한 접근 권한이 없는 API 키예요.',
      error: 'Forbidden'
    }
  }
})
@Controller('wrua')
@UseGuards(ApiKeyGuard)
@Service('wrua')
export class WruaController {
  constructor(private readonly wruaService: WruaService) { }

  @Get()
  @ApiOperation({
    summary: '일정 확인',
    description: '어떤 친구의 일정이 궁금하신가요? 사용자 이름을 입력해 주시면 그 친구의 앞으로의 일정을 쏙쏙 골라 보여드려요.'
  })
  @ApiQuery({
    name: 'name',
    description: '일정을 확인하고 싶은 사용자의 이름이에요.',
    required: true,
    example: '에케'
  })
  @ApiResponse({
    status: 200,
    description: '성공적으로 일정 목록을 찾아냈어요. 각 일정의 제목, 시간, 장소 등을 확인해 보세요!',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '사용자 이름' },
        events: {
          type: 'array',
          description: '앞으로의 일정 목록',
          items: {
            type: 'object',
            properties: {
              start_datetime: { type: 'string', description: '일정 시작 시간 (YYYY-MM-DD hh:mm:ss)' },
              end_datetime: { type: 'string', description: '일정 종료 시간 (YYYY-MM-DD hh:mm:ss)' },
              summary: { type: 'string', description: '일정 제목 (비공개 처리될 수 있음)' },
              location: { type: 'string', description: '장소 정보' }
            }
          }
        }
      },
      example: {
        name: "에케",
        events: [
          {
            start_datetime: "2026-03-26 09:00:00",
            end_datetime: "2026-03-26 10:00:00",
            summary: "09-10시 팀 회의",
            location: "온라인"
          }
        ]
      }
    }
  })
  async getEvents(@Query('name') name: string) {
    return this.wruaService.getEvents(name);
  }

  @Post('together')
  @ApiOperation({
    summary: '함께한 일정 확인',
    description: '지정한 친구와 함께했던 일정을 최근 12개월 기록에서 검색해 드려요. 누구와 함께했는지 이름을 알려주세요!'
  })
  @ApiQuery({
    name: 'name',
    description: '일정을 검색할 기준이 되는 캘린더 소유자의 이름이에요.',
    required: true,
    example: '광현'
  })
  @ApiBody({
    description: '함께 일정을 보낸 친구의 이름을 입력하는 객체예요.',
    schema: {
      type: 'object',
      required: ['withName'],
      properties: {
        withName: { type: 'string', description: '함께한 일정을 검색할 친구의 이름이에요.', example: '에케' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '함께한 일정들이 담긴 목록을 보내드려요. 참 보기 좋네요!',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '검색된 친구의 이름' },
        count: { type: 'number', description: '검색된 총 일정 개수' },
        events: {
          type: 'array',
          description: '함께한 일정 목록',
          items: {
            type: 'object',
            properties: {
              start: { type: 'string', format: 'date-time', description: '일정 시작 시간' },
              end: { type: 'string', format: 'date-time', description: '일정 종료 시간' },
              summary: { type: 'string', description: '일정 제목' },
              location: { type: 'string', description: '장소 정보' }
            }
          }
        }
      },
      example: {
        name: "에케",
        count: 1,
        events: [
          {
            start_datetime: "2025-12-25 12:00:00",
            end_datetime: "2025-12-25 14:00:00",
            summary: "크리스마스 파티",
            location: "에케네"
          }
        ]
      }
    }
  })
  @ApiResponse({
    status: 403,
    description: '다른 사람의 추억은 볼 수 없어요.',
    schema: {
      example: {
        statusCode: 403,
        message: '다른 사람의 추억은 볼 수 없어요.',
        error: 'Forbidden'
      }
    }
  })
  async searchTogether(
    @Query('name') calendarOwner: string,
    @Body() body: any,
    @Ip() clientIp: string,
  ) {
    // IPv6 support for local testing (::1 or ::ffff:127.0.0.1)
    const normalizedIp = clientIp.includes('::ffff:') ? clientIp.split('::ffff:')[1] : clientIp;
    return this.wruaService.searchTogether(calendarOwner, body, normalizedIp);
  }
}
