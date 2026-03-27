import { Module } from '@nestjs/common';
import { InfoController } from './info.controller.js';
import { InfoService } from './info.service.js';

import { CommonModule } from '../common/common.module.js';

@Module({
  imports: [CommonModule],
  controllers: [InfoController],
  providers: [InfoService],
})
export class InfoModule {}
