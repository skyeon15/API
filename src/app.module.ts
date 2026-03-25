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

@Module({
  imports: [
    AdminPanelModule,
    WruaModule,
    LostarkModule,
    CommonModule,
    NeisModule,
    InfoModule,
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

