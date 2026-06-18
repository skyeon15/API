import { Global, Module } from '@nestjs/common';
import { Redis } from 'ioredis';
import { RedisService } from './redis.service.js';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: () => {
        return new Redis({
          host: process.env.API_REDIS_HOST || 'localhost',
          port: parseInt(process.env.API_REDIS_PORT || '6379', 10),
          username: process.env.API_REDIS_USERNAME || undefined,
          password: process.env.API_REDIS_PASSWORD || undefined,
          db: parseInt(process.env.API_REDIS_DB || '0', 10),
          // 공유 Redis 인스턴스에서 키 충돌 방지용 네임스페이스
          keyPrefix: process.env.API_REDIS_PREFIX || 'api:',
        });
      },
    },
    RedisService,
  ],
  exports: ['REDIS_CLIENT', RedisService],
})
export class RedisModule {}
