import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { User } from './entities/user.entity.js';
import { PaymentMethod } from './entities/payment-method.entity.js';
import { PayappSeller } from './entities/payapp-seller.entity.js';
import { VerificationCode } from './entities/verification-code.entity.js';
import { ProfileController } from './profile.controller.js';
import { ApiKey } from '../admin/entities/api-key.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentService } from './payment.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      PaymentMethod,
      PayappSeller,
      VerificationCode,
      ApiKey,
    ]),
    forwardRef(() => AuthModule),
    HttpModule,
  ],
  controllers: [ProfileController],
  providers: [PaymentService],
  exports: [TypeOrmModule, PaymentService],
})
export class UserModule {}
