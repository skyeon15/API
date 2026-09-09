import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  BaseEntity,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';

/**
 * 서비스(SSO 클라이언트)별 관리자.
 *
 * 플랫폼 전체 관리자(`users.roles` 의 ADMIN)와 다르다 — 이쪽은 «그 서비스 안에서만»
 * 관리자다. 연동 서비스는 `GET /auth/userinfo` 의 `isServiceAdmin` 으로 판별한다.
 * 자기 서비스의 관리자 목록은 플랫폼 ADMIN 이 관리 콘솔에서 지정한다.
 */
@Entity('oauth_client_admins')
@Unique(['clientId', 'userId'])
export class OauthClientAdmin extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // oauth_clients.clientId (uuid PK 가 아니라 토큰 aud 에 실리는 문자열 id)
  @Column()
  clientId: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
