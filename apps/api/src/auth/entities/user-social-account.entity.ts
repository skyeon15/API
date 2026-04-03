import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  BaseEntity,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';

export enum SocialProvider {
  KAKAO = 'kakao',
  NAVER = 'naver',
  GOOGLE = 'google',
  APPLE = 'apple',
  PHONE = 'phone',
}

@Entity('user_social_accounts')
@Index(['provider', 'providerUserId'], { unique: true })
export class UserSocialAccount extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: SocialProvider })
  provider: SocialProvider;

  @Column()
  providerUserId: string; // 소셜 서비스에서의 고유 ID

  @Column({ type: 'jsonb', nullable: true })
  rawProfile: Record<string, any>; // 소셜에서 넘어온 전체 데이터

  @Column({ nullable: true })
  syncedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
