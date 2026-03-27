import { Controller, Get, Post, Query, Body, Ip, UseGuards } from '@nestjs/common';
import { WruaService } from './wrua.service.js';
import { Service } from '../common/decorators/service.decorator.js';
import { ApiKeyGuard } from '../common/guards/api-key.guard.js';

@Controller('wrua')
@UseGuards(ApiKeyGuard)
@Service('wrua')
export class WruaController {
  constructor(private readonly wruaService: WruaService) { }

  @Get()
  async getEvents(@Query('name') name: string) {
    return this.wruaService.getEvents(name);
  }

  @Post('together')
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
