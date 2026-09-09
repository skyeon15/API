import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  BaseEntity,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';

@Entity('refresh_tokens')
export class RefreshToken extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  token: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // SSO 토큰 교환으로 발급된 경우의 클라이언트 id. 브라우저 세션용은 null 이다.
  // `POST /auth/refresh`(세션 갱신)는 이 값이 있는 토큰을 거부한다.
  @Column({ type: 'varchar', nullable: true })
  clientId: string | null;

  @Column()
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
