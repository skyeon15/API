import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity.js';
import { PaymentMethod } from './entities/payment-method.entity.js';
import { VerificationCode } from './entities/verification-code.entity.js';
import { ProfileController } from './profile.controller.js';
import { ApiKey } from '../admin/entities/api-key.entity.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, PaymentMethod, VerificationCode, ApiKey]),
    forwardRef(() => AuthModule),
  ],
  controllers: [ProfileController],
  exports: [TypeOrmModule],
})
export class UserModule {}
