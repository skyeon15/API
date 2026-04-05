import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  Redirect,
  Ip,
  Logger,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { TimeService } from './time.service.js';
import axios from 'axios';
import { Service } from './decorators/service.decorator.js';
import { ApiKeyGuard } from './guards/api-key.guard.js';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiHeader,
} from '@nestjs/swagger';

@ApiTags('공통')
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
@Controller()
@UseGuards(ApiKeyGuard)
@Service('common')
export class CommonController {
  private readonly logger = new Logger(CommonController.name);

  constructor(private readonly timeService: TimeService) {}

  @Get('ip')
  @ApiOperation({
    summary: '클라이언트 IP 조회',
    description: '현재 요청을 보내는 기기의 공인 IP 주소를 확인해요.',
  })
  @ApiResponse({
    status: 200,
    description: '성공적으로 IP 주소를 가져왔어요.',
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
  @ApiOperation({
    summary: '서버 시간 조회 (기본)',
    description: '기본적으로 bbforest.net 서버의 현재 시각을 조회해요.',
  })
  @Redirect('/time/bbforest.net')
  getTimeDefault() {}

  @Get('time/:url')
  @ApiOperation({
    summary: '특정 서버 시간 조회',
    description: '입력한 URL 서버의 응답 헤더(Date)를 기반으로 현재 시각과 응답 속도를 확인해요.',
  })
  @ApiParam({
    name: 'url',
    description: '시간을 조회하고 싶은 서버 주소 (예: naver.com, google.com)',
    required: true,
    example: 'bbforest.net',
  })
  @ApiResponse({
    status: 200,
    description: '서버 시간 정보를 성공적으로 가져왔어요.',
  })
  async getTime(@Param('url') urlParam: string) {
...
    const send = new Date().getTime();
    this.logger.log(`시간 조회 요청: ${url}`);

    try {
      const response = await axios.get(`https://${url}`);
      return {
        status: '정상',
        url: url,
        abbreviation: 'KST',
        timezone: 'Asia/Seoul',
        utc_offset: 'UTC+09:00',
        url_datetime: this.timeService.format(
          'YYYY-MM-DD hh:mm:ss.CCC',
          response.headers.date,
        ),
        server_datetime: this.timeService.format('YYYY-MM-DD hh:mm:ss.CCC'),
        latency: new Date().getTime() - send + 'ms',
      };
    } catch (error) {
      this.logger.error(`시간 조회 오류: ${url}`, error.message);
      return {
        status: '오류',
        url: url,
        abbreviation: 'KST',
        timezone: 'Asia/Seoul',
        utc_offset: 'UTC+09:00',
        server_datetime: this.timeService.format('YYYY-MM-DD hh:mm:ss.CCC'),
        latency: new Date().getTime() - send + 'ms',
      };
    }
  }

  @Get('redirect/*path')
  handleRedirect(@Req() req: Request, @Res() res: Response) {
    const url = req.originalUrl.substring(10);
    this.logger.log(`리다이렉트 요청: ${url}`);

    if (url.startsWith('http')) {
      return res.redirect(url);
    } else {
      return res.send(`URL이 올바르지 않습니다. http:// 또는 https://가 포함되어야 합니다.<br>
      사용법 : gaon.bbforest.net/redirect/이동할주소<br>
      입력된URL : gaon.bbforest.net/redirect/${url}<br>
      파란대나무숲. Parandaenamusup. By.에케(@skyeon15)`);
    }
  }
}
