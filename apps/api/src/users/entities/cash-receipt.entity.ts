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
import { PayappSeller } from './payapp-seller.entity.js';
import { PaymentTransaction } from './payment-transaction.entity.js';

export enum CashReceiptType {
  INCOME_DEDUCTION = '소득공제',
  EXPENSE_PROOF = '지출증빙',
}

export enum CashReceiptStatus {
  REQUEST = 'request',
  ISSUED = 'issued',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

@Entity('cash_receipts')
export class CashReceipt extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid', nullable: true })
  transactionId: string | null;

  @ManyToOne(() => PaymentTransaction, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'transactionId' })
  transaction: PaymentTransaction | null;

  @Column({ type: 'uuid' })
  sellerId: string;

  @ManyToOne(() => PayappSeller, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sellerId' })
  seller: PayappSeller;

  @Column({ type: 'enum', enum: CashReceiptType })
  type: CashReceiptType;

  @Column({ type: 'varchar' })
  buyerName: string;

  @Column({ type: 'varchar' })
  idInfo: string; // 휴대폰번호 또는 사업자번호 (숫자만)

  @Column({ type: 'varchar' })
  goodName: string;

  @Column({ type: 'int' })
  amount: number;

  @Column({ type: 'int' })
  supplyAmount: number;

  @Column({ type: 'int' })
  taxAmount: number;

  @Column({ type: 'varchar', nullable: true })
  cashstno: string | null; // 페이앱 현금영수증 번호

  @Column({ type: 'text', nullable: true })
  cashsturl: string | null;

  @Column({
    type: 'enum',
    enum: CashReceiptStatus,
    default: CashReceiptStatus.REQUEST,
  })
  status: CashReceiptStatus;

  @Column({ type: 'jsonb', nullable: true })
  rawResponse: Record<string, any> | null;

  @Column({ type: 'timestamp', nullable: true })
  issuedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
