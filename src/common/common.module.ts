import { Module } from '@nestjs/common';
import { CommonController } from './common.controller.js';
import { TimeService } from './time.service.js';

import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKey } from '../admin/entities/api-key.entity.js';
import { ApiKeyGuard } from './guards/api-key.guard.js';

@Module({
  imports: [TypeOrmModule.forFeature([ApiKey])],
  controllers: [CommonController],
  providers: [TimeService, ApiKeyGuard],
  exports: [TimeService, ApiKeyGuard, TypeOrmModule],
})
export class CommonModule {}
