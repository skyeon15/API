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

  /**
   * 이 서비스의 **수납 판매자 계정**(`payapp_sellers.id`).
   *
   * 최종 사용자의 카드는 이 판매자로 빌링키를 발급받는다 — 빌링키는 판매자 계정에
   * 귀속되므로, 서비스가 매달 자기 이름으로 청구하려면 여기가 채워져 있어야 한다.
   * 비어 있으면 그 서비스는 정기결제를 쓸 수 없다(일회성 결제창은 영향 없다).
   */
  @Column({ type: 'uuid', nullable: true })
  payappSellerId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
