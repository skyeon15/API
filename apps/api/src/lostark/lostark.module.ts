import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { LostarkController } from './lostark.controller.js';
import { LostarkService } from './lostark.service.js';
import { CommonModule } from '../common/common.module.js';

@Module({
  imports: [HttpModule, CommonModule],
  controllers: [LostarkController],
  providers: [LostarkService],
})
export class LostarkModule {}
