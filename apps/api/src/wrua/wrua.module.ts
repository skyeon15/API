import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { WruaController } from './wrua.controller.js';
import { WruaService } from './wrua.service.js';
import { CommonModule } from '../common/common.module.js';

@Module({
  imports: [HttpModule, CommonModule],
  controllers: [WruaController],
  providers: [WruaService],
})
export class WruaModule {}
