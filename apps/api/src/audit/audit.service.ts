import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AuditLog,
  AuditAction,
  AuditResource,
} from './entities/audit-log.entity.js';

export interface AuditContext {
  apiKeyId?: string;
  userId?: string;
  ip?: string;
}

interface LogParams extends AuditContext {
  action: AuditAction;
  resource: AuditResource;
  resourceId: string;
  before?: Record<string, any>;
  after?: Record<string, any>;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async log(params: LogParams): Promise<void> {
    await this.repo.save(this.repo.create(params));
  }
}
