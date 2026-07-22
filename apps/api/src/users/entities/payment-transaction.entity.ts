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
import { PaymentMethod } from './payment-method.entity.js';
import { PayappSeller } from './payapp-seller.entity.js';

export enum PaymentTransactionStatus {
  PENDING = 'pending',
  PAID = 'paid',
  PARTIAL_CANCELLED = 'partial_cancelled',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

export enum PaymentProvider {
  PAYAPP = 'payapp',
  STRIPE = 'stripe',
}

@Entity('payment_transactions')
export class PaymentTransaction extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid', nullable: true })
  paymentMethodId: string | null;

  @ManyToOne(() => PaymentMethod, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'paymentMethodId' })
  paymentMethod: PaymentMethod | null;

  // Stripe(MoR) 결제는 셀러 개념이 없어 nullable
  @Column({ type: 'uuid', nullable: true })
  sellerId: string | null; // PayappSeller.id

  @ManyToOne(() => PayappSeller, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'sellerId' })
  seller: PayappSeller | null;

  @Column({ type: 'varchar', default: PaymentProvider.PAYAPP })
  provider: PaymentProvider;

  @Index({ unique: true })
  @Column({ type: 'varchar' })
  orderId: string; // 우리 측 주문번호 (PayApp: var1 / Stripe: metadata.orderId)

  @Index()
  @Column({ type: 'varchar', nullable: true })
  externalOrderId: string | null; // 호출 서비스측 주문번호 (대사용)

  @Column({ type: 'varchar', nullable: true })
  mulNo: string | null; // 페이앱 결제요청번호

  @Index()
  @Column({ type: 'varchar', nullable: true })
  stripePaymentIntentId: string | null; // Stripe PaymentIntent id (pi_xxx)

  @Column({ type: 'varchar', nullable: true })
  receiptUrl: string | null; // PG 영수증 URL (PayApp: pay_url / Stripe: charge.receipt_url)

  // ISO 4217 소문자 (예: krw, usd). Stripe 멀티통화 지원, amount는 최소 화폐단위
  @Column({ type: 'varchar', default: 'krw' })
  currency: string;

  @Column({ type: 'varchar' })
  goodName: string;

  @Column({ type: 'int' })
  amount: number;

  @Column({ type: 'int', default: 0 })
  cancelledAmount: number;

  @Column({ type: 'varchar', nullable: true })
  buyerName: string;

  @Column({ type: 'varchar', nullable: true })
  buyerPhone: string;

  @Column({ type: 'varchar', default: 'billing' })
  payMethod: string; // billing | payrequest

  @Column({
    type: 'enum',
    enum: PaymentTransactionStatus,
    default: PaymentTransactionStatus.PENDING,
  })
  status: PaymentTransactionStatus;

  @Column({ type: 'jsonb', nullable: true })
  rawResponse: Record<string, any> | null;

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'text', nullable: true })
  memo: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
