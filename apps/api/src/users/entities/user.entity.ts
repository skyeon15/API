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
  phone: string;

  @Column({ nullable: true })
  zipCode: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  detailAddress: string;

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
