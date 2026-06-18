import { Inject, Injectable } from '@nestjs/common';
import {
  HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { Redis } from 'ioredis';

/**
 * ioredis 클라이언트를 PING 하는 커스텀 헬스 인디케이터.
 * terminus 기본 제공 인디케이터에는 Redis가 없어 직접 구현한다.
 */
@Injectable()
export class RedisHealthIndicator {
  constructor(
    @Inject('REDIS_CLIENT') private readonly client: Redis,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    try {
      // Redis 다운 시 ioredis가 명령을 큐잉해 무한 대기할 수 있으므로 타임아웃을 건다.
      const pong = await Promise.race([
        this.client.ping(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('ping timeout')), 2000),
        ),
      ]);
      if (pong !== 'PONG') {
        return indicator.down({ message: `unexpected ping response: ${pong}` });
      }
      return indicator.up();
    } catch (e) {
      return indicator.down({ message: (e as Error).message });
    }
  }
}
