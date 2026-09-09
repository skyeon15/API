import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BaseEntity,
} from 'typeorm';

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  BLOCKED = 'BLOCKED',
  WITHDRAWN = 'WITHDRAWN',
}

export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  DEVELOPER = 'DEVELOPER',
}

@Entity('users')
export class User extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true, unique: true })
  ci: string; // 본인확인 고유값 (Connecting Information)

  @Column({ nullable: true, unique: true })
  email: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  nickname: string;

  @Column({ nullable: true })
  profileImageUrl: string;

  @Column({ nullable: true })
  birthDate: string; // YYYY-MM-DD

  @Column({ nullable: true })
  gender: string; // M, F, U

  @Column({ nullable: true })
  phone: string; // 국내는 01012345678, 해외는 E.164(+14155550123)

  // 번호의 주인이 확인됐는지. 전화번호는 로그인 수단이 아니라 연락처라 본인이 직접
  // 입력하며(=false), 카카오·네이버가 본인확인을 끝내고 넘겨준 번호만 true 다.
  // 알림톡 발송·결제처럼 «주인이 확인된 번호»가 필요한 곳은 phone 유무가 아니라 이 값을 봐야 한다.
  @Column({ default: false })
  phoneVerified: boolean;

  @Column({ nullable: true })
  zipCode: string;

  // Stripe Customer id (cus_xxx) — 사용자당 1개 재사용
  @Column({ type: 'varchar', nullable: true })
  stripeCustomerId: string | null;

  @Column({ nullable: true })
  address: string; // 도로명주소 / line1

  @Column({ nullable: true })
  detailAddress: string; // 동·호수 / line2

  // 해외 주소용. 국내 주소는 도로명주소 한 줄로 성립하지만 그 밖의 나라는
  // 도시·주가 있어야 주소가 완성된다. country 는 ISO 3166-1 alpha-2.
  @Column({ type: 'varchar', length: 2, nullable: true })
  addressCountry: string | null;

  @Column({ nullable: true })
  addressCity: string;

  @Column({ nullable: true })
  addressState: string;

  @Column({ nullable: true })
  company: string;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Column({
    type: 'text',
    array: true,
    default: '{USER}',
  })
  roles: UserRole[];

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
