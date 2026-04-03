import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  BaseEntity,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { AlimtalkChannel } from './channel.entity.js';
import { User } from '../../users/entities/user.entity.js';

export enum MessageType {
  IMMEDIATE = '즉시',
  SCHEDULED = '예약',
  CANCELLED = '취소',
}

@Entity('alimtalk_messages')
export class AlimtalkMessage extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', nullable: true })
  transactionId: string | null;

  @Column({ type: 'varchar', nullable: true })
  aligoMsgId: string | null;

  @Column()
  channelId: string;

  @ManyToOne(() => AlimtalkChannel, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'channelId' })
  channel: AlimtalkChannel;

  @Column()
  templateCode: string;

  @Column()
  receiverPhone: string;

  @Column('text')
  content: string;

  @Column({ type: 'varchar', nullable: true })
  title: string | null;

  @Column({ type: 'varchar', nullable: true })
  subtitle: string | null;

  @Column({ type: 'jsonb', nullable: true })
  buttons: Record<string, any>[] | null;

  @Column({ type: 'enum', enum: MessageType, default: MessageType.IMMEDIATE })
  type: MessageType;

  @Column({ type: 'timestamp', nullable: true })
  scheduledAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  apiResponse: string | null;

  @Column({ type: 'varchar', nullable: true })
  resultCode: string | null;

  @Column({ type: 'varchar', nullable: true })
  resultMessage: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resultCheckedAt: Date | null;

  @Column({ default: false })
  isCompleted: boolean;

  @Column({ default: false })
  isRemoved: boolean;

  @Column({ nullable: true })
  sentByUserId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sentByUserId' })
  sentByUser: User | null;

  @CreateDateColumn()
  createdAt: Date;
}
