import { Module } from '@nestjs/common';
import { NeisController } from './neis.controller.js';
import { NeisService } from './neis.service.js';
import { CommonModule } from '../common/common.module.js';

@Module({
  imports: [CommonModule],
  controllers: [NeisController],
  providers: [NeisService],
})
export class NeisModule {}
