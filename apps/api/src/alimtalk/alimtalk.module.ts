import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlimtalkChannel } from './entities/channel.entity.js';
import { AlimtalkTemplate } from './entities/template.entity.js';
import { AlimtalkMessage } from './entities/message.entity.js';
import { User } from '../users/entities/user.entity.js';
import { AlimtalkController } from './alimtalk.controller.js';
import { AlimtalkService } from './alimtalk.service.js';
import { AligoProvider } from './aligo.provider.js';
import { AuditModule } from '../audit/audit.module.js';
import { CommonModule } from '../common/common.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AlimtalkChannel,
      AlimtalkTemplate,
      AlimtalkMessage,
      User,
    ]),
    AuditModule,
    CommonModule,
  ],
  controllers: [AlimtalkController],
  providers: [AlimtalkService, AligoProvider],
  exports: [AlimtalkService, AligoProvider],
})
export class AlimtalkModule {}
