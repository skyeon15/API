import { Module } from '@nestjs/common';
import { CommonController } from './common.controller.js';
import { TimeService } from './time.service.js';
import { RedisModule } from './redis/redis.module.js';

import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ApiKey } from '../admin/entities/api-key.entity.js';
import { ApiKeyGuard } from './guards/api-key.guard.js';
import { ApiKeyOrSessionGuard } from './guards/api-key-or-session.guard.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([ApiKey]),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.API_JWT_SECRET || 'pds-jwt-secret',
        signOptions: { expiresIn: '15m' },
      }),
    }),
    RedisModule,
  ],
  controllers: [CommonController],
  providers: [TimeService, ApiKeyGuard, ApiKeyOrSessionGuard],
  exports: [
    TimeService,
    ApiKeyGuard,
    ApiKeyOrSessionGuard,
    TypeOrmModule,
    JwtModule,
    RedisModule,
  ],
})
export class CommonModule {}
