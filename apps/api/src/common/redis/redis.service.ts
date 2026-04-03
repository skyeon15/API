import { Injectable, OnModuleDestroy, Logger, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private isConnected = false;

  // In-memory fallbacks
  private readonly memoryStore = new Map<string, string>();
  private readonly hashStore = new Map<string, Map<string, string>>();

  constructor(
    @Inject('REDIS_CLIENT')
    private readonly client: Redis,
  ) {
    this.client.on('connect', () => {
      const { host, port } = (this.client as any).options;
      this.logger.log(`Redis connected to ${host}:${port}`);
    });

    this.client.on('ready', () => {
      this.isConnected = true;
      this.logger.log('Redis is ready to accept commands.');
    });

    this.client.on('error', (err) => {
      this.isConnected = false;
      const { host, port } = (this.client as any).options;
      this.logger.error(`Redis 연결 오류 (${host}:${port}): ${err.message}`);
    });

    this.client.on('close', () => {
      this.isConnected = false;
      const { host, port } = (this.client as any).options;
      this.logger.warn(
        `Redis 연결이 끊어졌습니다 (${host}:${port}). 인메모리 폴백으로 동작합니다.`,
      );
    });
  }

  onModuleDestroy() {
    // client is managed by RedisModule
  }

  getClient(): Redis {
    return this.client;
  }

  // Basic Key-Value
  async get(key: string): Promise<string | null> {
    try {
      if (this.isConnected) {
        return await this.client.get(key);
      }
    } catch (e) {
      this.logger.warn(
        `Redis get failed for key "${key}", falling back to memory.`,
      );
    }
    return this.memoryStore.get(key) || null;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<'OK'> {
    this.memoryStore.set(key, value);

    try {
      if (this.isConnected) {
        if (ttlSeconds) {
          await this.client.set(key, value, 'EX', ttlSeconds);
        } else {
          await this.client.set(key, value);
        }
        return 'OK';
      }
    } catch (e) {
      this.logger.warn(
        `Redis set failed for key "${key}", saved to memory only.`,
      );
    }
    return 'OK';
  }

  async del(key: string): Promise<number> {
    this.memoryStore.delete(key);
    try {
      if (this.isConnected) {
        return await this.client.del(key);
      }
    } catch (e) {
      this.logger.warn(
        `Redis del failed for key "${key}", removed from memory only.`,
      );
    }
    return 1;
  }

  // Hashes
  async hgetall(key: string): Promise<Record<string, string>> {
    try {
      if (this.isConnected) {
        return await this.client.hgetall(key);
      }
    } catch (e) {
      this.logger.warn(
        `Redis hgetall failed for key "${key}", falling back to memory.`,
      );
    }

    const memoryMap = this.hashStore.get(key);
    if (!memoryMap) return {};

    const obj: Record<string, string> = {};
    memoryMap.forEach((val, field) => {
      obj[field] = val;
    });
    return obj;
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    let memoryMap = this.hashStore.get(key);
    if (!memoryMap) {
      memoryMap = new Map();
      this.hashStore.set(key, memoryMap);
    }
    memoryMap.set(field, value);

    try {
      if (this.isConnected) {
        return await this.client.hset(key, field, value);
      }
    } catch (e) {
      this.logger.warn(
        `Redis hset failed for key "${key}", saved to memory only.`,
      );
    }
    return 1;
  }

  async hdel(key: string, field: string): Promise<number> {
    const memoryMap = this.hashStore.get(key);
    if (memoryMap) {
      memoryMap.delete(field);
    }

    try {
      if (this.isConnected) {
        return await this.client.hdel(key, field);
      }
    } catch (e) {
      this.logger.warn(
        `Redis hdel failed for key "${key}", removed from memory only.`,
      );
    }
    return 1;
  }
}
