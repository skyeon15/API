import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, BaseEntity, ManyToOne, JoinColumn } from 'typeorm';
import { AlimtalkChannel } from './channel.entity.js';
import { User } from '../../users/entities/user.entity.js';

export enum TemplateType {
  BASIC = '기본형',
  EMPHASIS = '강조표기형',
  IMAGE = '이미지형',
}

@Entity('alimtalk_templates')
export class AlimtalkTemplate extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column()
  channelId: number;

  @ManyToOne(() => AlimtalkChannel, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'channelId' })
  channel: AlimtalkChannel;

  @Column({ type: 'enum', enum: TemplateType, default: TemplateType.BASIC })
  type: TemplateType;

  @Column({ type: 'varchar', nullable: true })
  title: string | null;

  @Column({ type: 'varchar', nullable: true })
  subtitle: string | null;

  @Column('text')
  content: string;

  @Column({ type: 'jsonb', nullable: true })
  buttons: Record<string, any>[] | null;

  @Column({ default: 'REG' })
  inspStatus: string;

  @Column({ default: false })
  isRemoved: boolean;

  @Column({ nullable: true })
  createdByUserId: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdByUserId' })
  createdByUser: User | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
