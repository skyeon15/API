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
import { OauthClient } from './oauth-client.entity.js';

export enum GrantStatus {
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
}

@Entity('oauth_grants')
@Index(['userId', 'clientId'], { unique: true })
export class OauthGrant extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  clientId: string;

  @ManyToOne(() => OauthClient, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clientId', referencedColumnName: 'clientId' })
  client: OauthClient;

  @Column('simple-array')
  grantedScopes: string[];

  @Column({ type: 'enum', enum: GrantStatus, default: GrantStatus.ACTIVE })
  status: GrantStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
