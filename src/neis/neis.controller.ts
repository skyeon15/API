import { Controller, Get, Param } from '@nestjs/common';
import { NeisService } from './neis.service.js';
import { ApiOperation, ApiParam, ApiTags, ApiResponse } from '@nestjs/swagger';

@ApiTags('학교')
@Controller('school-lunch')
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
