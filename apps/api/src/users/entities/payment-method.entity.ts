import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BaseEntity,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';
import { PayappSeller } from './payapp-seller.entity.js';

@Entity('payment_methods')
export class PaymentMethod extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

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

  @Column()
  billingKey: string; // PayApp: encBill / Stripe: PaymentMethod id (pm_xxx)

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'varchar', nullable: true })
  memo: string | null; // 내부 관리용 메모

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
