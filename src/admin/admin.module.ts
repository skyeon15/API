import { Module } from '@nestjs/common';
import { AdminModule } from '@adminjs/nestjs';
import { IpRestrictionGuard } from '../common/guards/ip-restriction.guard.js';
import AdminJS from 'adminjs';
import * as AdminJSTypeorm from '@adminjs/typeorm';

AdminJS.registerAdapter({
  Resource: AdminJSTypeorm.Resource,
  Database: AdminJSTypeorm.Database,
});

@Module({
  imports: [
    AdminModule.createAdmin({
      adminJsOptions: {
        rootPath: '/skyeon15',
        resources: [], // 테이블 추가 시 여기 나열
        branding: {
          companyName: '파란대나무숲',
          logo: '/public/logo.png',
          favicon: '/public/favicon.svg',
        },
      },
    }),
  ],
})
export class AdminPanelModule {}
