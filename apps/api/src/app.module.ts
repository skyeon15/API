import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AdminPanelModule } from './admin/admin.module.js';
import { IpRestrictionGuard } from './common/guards/ip-restriction.guard.js';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { WruaModule } from './wrua/wrua.module.js';
import { LostarkModule } from './lostark/lostark.module.js';
import { CommonModule } from './common/common.module.js';
import { NeisModule } from './neis/neis.module.js';
import { InfoModule } from './info/info.module.js';
import { AlimtalkModule } from './alimtalk/alimtalk.module.js';
import { UserModule } from './users/user.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKey } from './admin/entities/api-key.entity.js';
import { User } from './users/entities/user.entity.js';
import { PaymentMethod } from './users/entities/payment-method.entity.js';
import { VerificationCode } from './users/entities/verification-code.entity.js';
import { AuditLog } from './audit/entities/audit-log.entity.js';
import { AlimtalkChannel } from './alimtalk/entities/channel.entity.js';
import { AlimtalkTemplate } from './alimtalk/entities/template.entity.js';
import { AlimtalkMessage } from './alimtalk/entities/message.entity.js';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER || 'pds_user',
      password: process.env.DB_PASSWORD || 'pds_password',
      database: process.env.DB_NAME || 'pds_api',
      entities: [ApiKey, User, PaymentMethod, VerificationCode, AuditLog, AlimtalkChannel, AlimtalkTemplate, AlimtalkMessage],
      synchronize: false,
      migrations: [join(process.cwd(), 'dist/migrations/*.js')],
      migrationsRun: true,
    }),
    AdminPanelModule,
    UserModule,
    AuditModule,
    WruaModule,
    LostarkModule,
    CommonModule,
    NeisModule,
    InfoModule,
    AlimtalkModule,
    AuthModule,
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public'),
      serveRoot: '/public',
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: IpRestrictionGuard,
    },
  ],
})
export class AppModule {}
