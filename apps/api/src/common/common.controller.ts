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
import { ApiTags } from '@nestjs/swagger';

@ApiTags('공통')
@Controller()
@UseGuards(ApiKeyGuard)
@Service('common')
export class CommonController {
  private readonly logger = new Logger(CommonController.name);

  constructor(private readonly timeService: TimeService) {}

  @Get('ip')
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
  getTimeDefault() {}

  @Get('time/:url')
  async getTime(@Param('url') urlParam: string) {
    const url = urlParam.replace('http://', '').replace('https://', '');
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
