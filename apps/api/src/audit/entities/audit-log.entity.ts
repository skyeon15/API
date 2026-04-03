import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  BaseEntity,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ApiKey } from '../../admin/entities/api-key.entity.js';
import { User } from '../../users/entities/user.entity.js';

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  SEND = 'SEND',
  CANCEL = 'CANCEL',
}

export enum AuditResource {
  CHANNEL = 'channel',
  TEMPLATE = 'template',
  MESSAGE = 'message',
  USER = 'user',
  API_KEY = 'api_key',
}

@Entity('audit_logs')
export class AuditLog extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  apiKeyId: string;

  @ManyToOne(() => ApiKey, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'apiKeyId' })
  apiKey: ApiKey;

  @Column({ nullable: true })
  userId: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: AuditAction })
  action: AuditAction;

  @Column({ type: 'enum', enum: AuditResource })
  resource: AuditResource;

  @Column()
  resourceId: string;

  @Column({ type: 'jsonb', nullable: true })
  before: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  after: Record<string, any>;

  @Column({ nullable: true })
  ip: string;

  @CreateDateColumn()
  createdAt: Date;
}
