import { Controller, Get, Redirect } from '@nestjs/common';
import { AppService } from './app.service.js';
import { SERVICE_REGISTRY } from './common/service-registry.js';

import { ApiExcludeController } from '@nestjs/swagger';

@ApiExcludeController()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Get()
  @Redirect('https://platform.bbforest.net', 302)
  getRoot() { }

  @Get('services')
  getServices() {
    return SERVICE_REGISTRY;
  }
}
