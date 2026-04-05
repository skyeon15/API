import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Ip,
  UseGuards,
} from '@nestjs/common';
import { WruaService } from './wrua.service.js';
import { Service } from '../common/decorators/service.decorator.js';
import { ApiKeyGuard } from '../common/guards/api-key.guard.js';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiBody,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiHeader,
} from '@nestjs/swagger';

@ApiTags('일정관리')
@ApiBearerAuth('api-key')
@ApiHeader({
  name: 'Authorization',
  description: 'Bearer {API_KEY} 형태로 입력해 주세요.',
  required: true,
  example: 'Bearer YOUR_SECRET_TOKEN',
})
@ApiUnauthorizedResponse({
  description: 'API 키가 없거나 형식이 올바르지 않아요.',
})
@ApiForbiddenResponse({
  description: '이 API 키는 해당 서비스에 대한 접근 권한이 없어요.',
})
@Controller('wrua')
@UseGuards(ApiKeyGuard)
@Service('wrua')
export class WruaController {
  constructor(private readonly wruaService: WruaService) {}

  @Get()
  @ApiOperation({
    summary: '일정 목록 조회',
    description: '특정 사용자의 전체 일정 목록을 가져와요.',
  })
  @ApiQuery({
    name: 'name',
    description: '조회할 사용자 이름 (예: 광현, 에케)',
    required: true,
    example: '광현',
  })
  @ApiResponse({
    status: 200,
    description: '일정 목록을 성공적으로 가져왔어요.',
  })
  async getEvents(@Query('name') name: string) {
    return this.wruaService.getEvents(name);
  }

  @Post('together')
  @ApiOperation({
    summary: '함께한 일정 검색',
    description: '특정 사용자와 함께한 일정을 검색해요.',
  })
  @ApiQuery({
    name: 'name',
    description: '검색 대상 캘린더 소유자 이름 (예: 광현, 에케)',
    required: true,
    example: '에케',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['withName'],
      properties: {
        withName: {
          type: 'string',
          description: '함께한 사람의 이름',
          example: '광현',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: '함께한 일정 목록을 성공적으로 찾았어요.',
  })
  async searchTogether(
    @Query('name') calendarOwner: string,
    @Body() body: any,
    @Ip() clientIp: string,
  ) {
    // IPv6 support for local testing (::1 or ::ffff:127.0.0.1)
    const normalizedIp = clientIp.includes('::ffff:')
      ? clientIp.split('::ffff:')[1]
      : clientIp;
    return this.wruaService.searchTogether(calendarOwner, body, normalizedIp);
  }
}
