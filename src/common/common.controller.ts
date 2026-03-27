import { Controller, Get, Param, Req, Res, Redirect, Ip, Logger, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { TimeService } from './time.service.js';
import axios from 'axios';
import { ApiOperation, ApiParam, ApiTags, ApiResponse, ApiBearerAuth, ApiUnauthorizedResponse, ApiForbiddenResponse, ApiHeader } from '@nestjs/swagger';
import { Service } from './decorators/service.decorator.js';
import { ApiKeyGuard } from './guards/api-key.guard.js';

@ApiTags('공통')
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
      message: '해당 서비스(\'common\')에 대한 접근 권한이 없는 API 키예요.',
      error: 'Forbidden'
    }
  }
})
@Controller()
@UseGuards(ApiKeyGuard)
@Service('common')
export class CommonController {
  private readonly logger = new Logger(CommonController.name);

  constructor(private readonly timeService: TimeService) { }

  @Get('ip')
  @ApiOperation({
    summary: '내 IP 확인',
    description: '현재 서버에 접속하신 고객님의 IP 주소를 확인해 드려요.'
  })
  @ApiResponse({
    status: 200,
    description: '접속하신 IP 주소를 문자열로 반환해요.',
    schema: { example: '123.123.123.123' }
  })
  getIp(@Ip() ip: string) {
    let clientIp = ip;
    if (clientIp.startsWith('::ffff:')) {
      clientIp = clientIp.replace('::ffff:', '');
    }
    this.logger.log(`IP 조회: ${clientIp}`);
    return clientIp;
  }

  @Get('time')
  @Redirect('/time/bbforest.net')
  @ApiOperation({
    summary: '서버 시간 확인',
    description: '파란대나무숲 서버의 현재 시간을 바로 확인할 수 있어요.'
  })
  @ApiResponse({ status: 302, description: '/time/bbforest.net 으로 리다이렉트해요.' })
  getTimeDefault() { }

  @Get('time/:url')
  @ApiOperation({
    summary: '다른 서버 시간 확인',
    description: '특정 웹사이트의 서버 시간을 확인해요. 지연시간(Latency)과 함께 해당 서버의 현재 시간을 알 수 있어요.'
  })
  @ApiParam({
    name: 'url',
    description: '시간을 확인하고 싶은 대상 웹사이트 주소예요.',
    required: true,
    example: 'naver.com'
  })
  @ApiResponse({
    status: 200,
    description: '해당 서버의 시간 정보와 지연 시간을 포함한 데이터를 보내드려요.',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: '요청 처리 상태 (정상/오류)' },
        url: { type: 'string', description: '조회한 대상 웹사이트 주소' },
        abbreviation: { type: 'string', description: '시간대 약어 (예: KST)' },
        timezone: { type: 'string', description: '서버 시간대 (예: Asia/Seoul)' },
        utc_offset: { type: 'string', description: 'UTC 기준 오차 (예: UTC+09:00)' },
        url_datetime: { type: 'string', description: '대상 서버의 현재 시간 (응답 헤더 기준)' },
        server_datetime: { type: 'string', description: '우리 서버의 현재 시간' },
        latency: { type: 'string', description: '응답을 받기까지 걸린 지연 시간' }
      },
      example: {
        status: "정상",
        url: "naver.com",
        abbreviation: "KST",
        timezone: "Asia/Seoul",
        utc_offset: "UTC+09:00",
        url_datetime: "2026-03-26 06:47:25.123",
        server_datetime: "2026-03-26 06:47:25.456",
        latency: "333ms"
      }
    }
  })
  async getTime(@Param('url') urlParam: string) {
    const url = urlParam.replace('http://', '').replace('https://', '');
    const send = new Date().getTime();
    this.logger.log(`시간 조회 요청: ${url}`);

    try {
      const response = await axios.get(`https://${url}`);
      return {
        status: "정상",
        url: url,
        abbreviation: "KST",
        timezone: "Asia/Seoul",
        utc_offset: "UTC+09:00",
        url_datetime: this.timeService.format("YYYY-MM-DD hh:mm:ss.CCC", response.headers.date),
        server_datetime: this.timeService.format("YYYY-MM-DD hh:mm:ss.CCC"),
        latency: new Date().getTime() - send + 'ms'
      };
    } catch (error) {
      this.logger.error(`시간 조회 오류: ${url}`, error.message);
      return {
        status: "오류",
        url: url,
        abbreviation: "KST",
        timezone: "Asia/Seoul",
        utc_offset: "UTC+09:00",
        server_datetime: this.timeService.format("YYYY-MM-DD hh:mm:ss.CCC"),
        latency: new Date().getTime() - send + 'ms'
      };
    }
  }

  @Get('redirect/*path')
  @ApiOperation({
    summary: 'URL 리다이렉트',
    description: '페이지 이동용 리다이렉트 엔드포인트예요. `http://` 또는 `https://`로 시작하는 URL만 지원해요.'
  })
  @ApiParam({
    name: 'path',
    description: '리다이렉트할 대상 URL이에요. 반드시 http:// 또는 https://로 시작해야 해요.',
    required: true,
    example: 'https://bbforest.net'
  })
  @ApiResponse({
    status: 302,
    description: '지정한 URL로 성공적으로 이동시켜 드려요.',
  })
  @ApiResponse({
    status: 200,
    description: 'URL 형식이 올바르지 않을 때 오류 메시지를 텍스트로 반환해요.',
  })
  handleRedirect(@Req() req: Request, @Res() res: Response) {
    const url = req.originalUrl.substring(10);
    this.logger.log(`리다이렉트 요청: ${url}`);

    if (url.startsWith('http')) {
      return res.redirect(url);
    } else {
      return res.send(`URL이 올바르지 않습니다. http:// 또는 https://가 포함되어야 합니다.<br>
      사용법 : api.bbforest.net/redirect/이동할주소<br>
      입력된URL : api.bbforest.net/redirect/${url}<br>
      파란대나무숲. Parandaenamusup. By.에케(@skyeon15)`);
    }
  }
}
