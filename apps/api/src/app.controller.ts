import { Controller, Get, Redirect } from '@nestjs/common';
import { AppService } from './app.service.js';
import { SERVICE_REGISTRY } from './common/service-registry.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Get()
  @Redirect('https://platform.bbforest.net', 302)
  getRoot() {}

  @Get('services')
  getServices() {
    return SERVICE_REGISTRY;
  }

  @Get('news')
  getNews(): string {
    return '에케 API - 뉴스 (Legacy)';
  }
}
