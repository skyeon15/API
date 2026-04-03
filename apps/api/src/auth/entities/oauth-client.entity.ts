import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BaseEntity,
} from 'typeorm';

@Entity('oauth_clients')
export class OauthClient extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  clientId: string;

  @Column()
  clientSecret: string;

  @Column()
  clientName: string;

  @Column('simple-array')
  redirectUris: string[];

  // IAM UI Branding Configuration
  @Column({ nullable: true })
  logoUrl: string;

  @Column({ default: '#000000' })
  primaryColor: string;

  @Column({ type: 'jsonb', nullable: true })
  themeConfig: Record<string, any>;

  // Scope Management
  @Column('simple-array', { default: 'openid,profile' })
  allowedScopes: string[];

  @Column('simple-array', { default: 'openid,profile' })
  requiredScopes: string[];

  @Column({ default: false })
  autoGrant: boolean; // 내부 서비스의 경우 동의 생략 여부

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
