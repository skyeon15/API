import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BaseEntity,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity.js';

/** 플랫폼이 연동 서비스에 쏘는 이벤트 종류 */
export const SERVICE_WEBHOOK_EVENTS = [
  'payment.paid',
  'payment.failed',
  'payment.refunded',
] as const;

export type ServiceWebhookEvent = (typeof SERVICE_WEBHOOK_EVENTS)[number];

/**
 * 결제 결과를 되돌려 받을 연동 서비스의 주소.
 *
 * 구독 단위가 **서비스(=API 키 소유자)** 인 이유: 키는 유출되면 갈아끼우는 물건이라
 * 거기 매달아 두면 키를 새로 발급할 때마다 웹훅이 조용히 끊긴다.
 */
@Entity('service_webhooks')
export class ServiceWebhook extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar' })
  url: string;

  /** 서명(HMAC-SHA256) 키. 만든 직후 한 번만 평문으로 보여준다 */
  @Column({ type: 'varchar' })
  secret: string;

  /** 받을 이벤트. **빈 배열이면 전부** 받는다 */
  @Column('text', { array: true, default: '{}' })
  events: string[];

  @Column({ default: true })
  isActive: boolean;

  // ── 마지막 배달 결과. 서비스가 안 받고 있는 것을 여기서만 알 수 있다 ──
  @Column({ type: 'int', nullable: true })
  lastStatus: number | null;

  @Column({ type: 'varchar', nullable: true })
  lastError: string | null;

  @Column({ type: 'timestamp', nullable: true })
  lastDeliveredAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
