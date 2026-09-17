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
import type { Relation } from 'typeorm';
import { PaymentMethod } from './payment-method.entity.js';

@Entity('payment_method_usages')
export class PaymentMethodUsage extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  paymentMethodId: string;

  /**
   * 🔴 타입을 `PaymentMethod` 로 쓰면 **부팅이 죽는다** — 이 파일과
   * `payment-method.entity.ts` 가 서로를 import 하는데(저쪽의 `@OneToMany`),
   * ESM 에서는 `emitDecoratorMetadata` 가 내보내는
   * `__metadata("design:type", PaymentMethod)` 가 **즉시** 클래스를 참조해
   * `ReferenceError: Cannot access 'PaymentMethod' before initialization` 이 난다.
   * `Relation<>` 은 그 메타데이터를 `Object` 로 떨어뜨려 고리를 끊는다
   * (`() => PaymentMethod` 는 지연 호출이라 원래 안전하고, 저쪽 `usages: …[]` 는
   * 배열이라 design:type 이 `Array` 여서 안전하다 — 터지는 건 이 한 줄뿐이었다).
   */
  @ManyToOne(() => PaymentMethod, (pm) => pm.usages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'paymentMethodId' })
  paymentMethod: Relation<PaymentMethod>;

  @Column({ type: 'varchar' })
  @Index()
  clientId: string;

  @Column({ type: 'varchar' })
  label: string; // 예: "학생 구독 BV 6점 세트"

  @Column({ type: 'varchar', nullable: true })
  externalId: string | null; // 서비스측 구독 식별자

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
