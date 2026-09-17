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

/**
 * 연동 서비스의 **최종 사용자** 한 명 = Stripe Customer 하나.
 *
 * 플랫폼 계정이 없는 사람이다 — 그 서비스에만 로그인한 손님이다. 그래서 식별자는
 * `users.id` 가 아니라 **서비스가 부르는 자기 사용자 id**(`externalUserId`)이고,
 * 같은 문자열이라도 서비스가 다르면 남남이다(유니크가 두 칸 묶음인 이유).
 *
 * 🔴 이 표가 있어야 «서비스 키로 최종 사용자 카드 저장» 이 금지 패턴을 벗어난다.
 *    금지가 막는 것은 카드가 키 소유자 한 명의 Customer 에 섞이는 것인데,
 *    여기서는 사람마다 Customer 가 따로 서므로 오청구가 성립하지 않는다.
 */
@Entity('service_customers')
@Index(['serviceUserId', 'externalUserId'], { unique: true })
export class ServiceCustomer extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 서비스(=API 키 소유자). 정산 귀속도 계속 이 사람이다 */
  @Column({ type: 'uuid' })
  serviceUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'serviceUserId' })
  serviceUser: User;

  /** 서비스측 사용자 id. 플랫폼은 뜻을 모르고 그대로 되돌려 준다 */
  @Column({ type: 'varchar' })
  externalUserId: string;

  @Column({ type: 'varchar' })
  stripeCustomerId: string;

  /** 표시용 이름. 청구 화면·영수증에서 사람을 알아보려고 둔다(없어도 된다) */
  @Column({ type: 'varchar', nullable: true })
  label: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
