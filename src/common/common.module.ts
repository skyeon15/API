import { Module } from '@nestjs/common';
import { CommonController } from './common.controller.js';
import { TimeService } from './time.service.js';

@Module({
  controllers: [CommonController],
  providers: [TimeService],
  exports: [TimeService],
})
export class CommonModule {}
