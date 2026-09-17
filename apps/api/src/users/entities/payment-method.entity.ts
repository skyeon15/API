import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BaseEntity,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';
import { PayappSeller } from './payapp-seller.entity.js';
import { PaymentMethodUsage } from './payment-method-usage.entity.js';
import { ServiceCustomer } from './service-customer.entity.js';

@Entity('payment_methods')
export class PaymentMethod extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 플랫폼 계정의 카드면 그 사람. **연동 서비스 손님의 카드면 비어 있고**
  // 대신 `serviceCustomerId` 가 찬다(둘 중 하나는 반드시 있다).
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  // 연동 서비스의 최종 사용자(= 그 사람 전용 Stripe Customer). PayApp 미사용
  @Column({ type: 'uuid', nullable: true })
  serviceCustomerId: string | null;

  @ManyToOne(() => ServiceCustomer, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'serviceCustomerId' })
  serviceCustomer: ServiceCustomer | null;

  @Column({ type: 'varchar', default: 'payapp' })
  provider: string; // 'payapp' | 'stripe'

  @Column()
  cardNo: string; // PayApp: 4518********1111 / Stripe: last4

  @Column()
  cardName: string; // PayApp: [신한] / Stripe: 카드 브랜드(visa 등)

  @Column({ type: 'uuid', nullable: true })
  sellerId: string | null; // PayApp: 빌링키가 귀속된 판매자(payapp_sellers.id). Stripe 미사용

  @ManyToOne(() => PayappSeller, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'sellerId' })
  seller: PayappSeller | null;

  @Column({ type: 'varchar', nullable: true })
  merchantId: string | null; // PayApp: PG사 판매자 회원 아이디 (Stripe 미사용)

  @Column({ type: 'varchar', nullable: true })
  customerId: string | null; // Stripe Customer id (cus_xxx)

  @Column({ type: 'varchar', nullable: true })
  pmType: string | null; // Stripe 결제수단 종류: 'card' | 'naver_pay' | 'kakao_pay' 등 (PayApp 미사용)

  @Column({ type: 'jsonb', nullable: true })
  pmDetail: Record<string, any> | null; // 수단별 상세(네이버페이 buyerId/funding, 카드 exp·funding, mandateId 등)

  @Column()
  billingKey: string; // PayApp: encBill / Stripe: PaymentMethod id (pm_xxx)

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'varchar', nullable: true })
  memo: string | null; // 내부 관리용 메모

  @OneToMany(() => PaymentMethodUsage, (usage) => usage.paymentMethod)
  usages: PaymentMethodUsage[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
