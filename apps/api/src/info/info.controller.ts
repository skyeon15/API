import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { InfoService } from './info.service.js';
import { ApiOperation, ApiQuery, ApiTags, ApiResponse, ApiProduces, ApiBearerAuth, ApiUnauthorizedResponse, ApiForbiddenResponse, ApiHeader } from '@nestjs/swagger';
import { Service } from '../common/decorators/service.decorator.js';
import { ApiKeyGuard } from '../common/guards/api-key.guard.js';

@ApiTags('정보조회')
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
      message: '해당 서비스(\'info\')에 대한 접근 권한이 없는 API 키예요.',
      error: 'Forbidden'
    }
  }
})
@Controller()
@UseGuards(ApiKeyGuard)
@Service('info')
export class InfoController {
  constructor(private readonly infoService: InfoService) { }

  @Get('weather')
  @ApiProduces('application/json', 'text/plain')
  @ApiOperation({
    summary: '현재 날씨',
    description: `궁금한 지역의 현재 날씨를 찾아봐요.\n\n**텍스트 응답 예시 (?type=text):**\n\`\`\`\n[ 서울의 현재 날씨는 맑음! ]\n조회시각 : 2026-03-26 07:31:05\n\n기온 : 15.2 (최저 10.1/최고 20.5)\n...\n\`\`\``
  })
  @ApiQuery({
    name: 'city',
    required: true,
    description: '날씨가 궁금한 지역 이름이에요.',
    example: '서울'
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['json', 'text'],
    description: '어떤 형식으로 결과를 보여드릴까요? (text 또는 json)',
    example: 'json'
  })
  @ApiResponse({
    status: 200,
    description: '요청하신 지역의 날씨 정보를 정성껏 준비했어요.',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            city: { type: 'string', description: '조회된 지역 명칭' },
            weather: { type: 'string', description: '현재 날씨 상태 (예: 맑음, 흐림)' },
            temp: { type: 'string', description: '현재 기온' },
            temp_low: { type: 'string', description: '오늘의 최저 기온' },
            temp_high: { type: 'string', description: '오늘의 최고 기온' },
            precipitation: { type: 'string', description: '강수 확률' },
            humidity: { type: 'string', description: '습도' },
            pm: { type: 'string', description: '미세먼지 상태' },
            pm_m: { type: 'string', description: '(초)미세먼지 상태' },
            ultraviolet: { type: 'string', description: '자외선 지수' },
            sunset: { type: 'string', description: '일몰 시간' },
            wind: {
              type: 'array',
              items: { type: 'string' },
              description: '바람 정보 [풍향, 풍속]'
            }
          }
        },
        example: {
          city: "관측된 도시명",
          weather: "현재 날씨",
          temp: "15",
          temp_low: "10",
          temp_high: "22",
          precipitation: "0%",
          humidity: "35%",
          pm: "좋음",
          pm_m: "좋음",
          ultraviolet: "보통",
          sunset: "18:45",
          wind: [
            "북서",
            "2.0m/s"
          ],
          datetime: "2024-03-26 00:00:00"
        }
      },
      'text/plain': {
        example: "[ 서울의 현재 날씨는 맑음! ][br]조회시각 : 2026-03-26 07:31:05[br][br]기온 : 15.2 (최저 10.1/최고 20.5)[br]바람 : 남서풍 2.1m/s[br]강수확률 : 0%[br]습도 : 35%[br]일몰시간 : 18:45[br]"
      }
    }
  })
  async getWeather(@Req() req: Request, @Query('city') city: string, @Query('type') type?: string) {
    const format = type || (req.headers.accept?.includes('text/plain') ? 'text' : 'json');
    return this.infoService.getWeather(city, format);
  }

  @Get('olympic')
  @ApiOperation({
    summary: '올림픽 메달 순위',
    description: '올림픽 경기가 한창인가요? 지금 바로 국가별 메달 획득 순위를 확인해 보세요!'
  })
  @ApiResponse({
    status: 200,
    description: '올림픽 메달 순위 목록을 불러왔어요. 대한민국 화이팅!',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '올림픽 대회 명칭' },
        grade: { type: 'string', description: '대한민국 현재 순위' },
        gold: { type: 'string', description: '금메달 개수' },
        silver: { type: 'string', description: '은메달 개수' },
        bronze: { type: 'string', description: '동메달 개수' }
      },
      example: {
        name: "2024 파리 올림픽",
        grade: "8",
        gold: "13",
        silver: "9",
        bronze: "10"
      }
    }
  })
  async getOlympic() {
    return this.infoService.getOlympicMedals();
  }

  @Get('covid19')
  @ApiProduces('application/json', 'text/plain')
  @ApiOperation({
    summary: '국내 코로나19 현황',
    description: `현재 우리나라의 코로나19 확진자 통계를 확인해 보세요.\n\n**텍스트 응답 예시 (?type=text):**\n\`\`\`\n[ 국내 코로나 현황 ]\n조회시각 : 2026-03-26 07:31:04\n\n직전 발표자료\n누적 확진자 : 34,436,586(+1,500)\n위중증 : 179(+0)\n사망자 : 35,812(+0)\n\`\`\``
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['json', 'text'],
    description: '어떤 형식으로 결과를 보여드릴까요? (text 또는 json)',
    example: 'json'
  })
  @ApiResponse({
    status: 200,
    description: '코로나19 현황 데이터를 성공적으로 가져왔어요.',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            datetime: { type: 'string', description: '데이터 갱신 시각 (YYYY-MM-DD hh:mm:ss)' },
            confirmed: {
              type: 'array',
              items: { type: 'number' },
              description: '확진자 정보 [누적 확진자, 전일 대비 증감]'
            },
            critical: {
              type: 'array',
              items: { type: 'number' },
              description: '위중증 환자 정보 [누적 위중증, 전일 대비 증감]'
            },
            deceased: {
              type: 'array',
              items: { type: 'number' },
              description: '사망자 정보 [누적 사망자, 전일 대비 증감]'
            }
          }
        },
        example: {
          datetime: "2024-03-26 00:00:00",
          confirmed: [
            31000000,
            1500
          ],
          critical: [
            150,
            5
          ],
          deceased: [
            35000,
            2
          ]
        }
      },
      'text/plain': {
        example: "[ 국내 코로나 현황 ][br]조회시각 : 2026-03-26 07:31:04[br][br]직전 발표자료[br]누적 확진자 : 34,436,586(+1,500)[br]위중증 : 179(+0)[br]사망자 : 35,812(+0)[br]"
      }
    }
  })
  async getCovid(@Req() req: Request, @Query('type') type?: string) {
    const format = type || (req.headers.accept?.includes('text/plain') ? 'text' : 'json');
    return this.infoService.getCovidStats(format);
  }
}
