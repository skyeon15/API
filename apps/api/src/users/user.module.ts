import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { User } from './entities/user.entity.js';
import { PaymentMethod } from './entities/payment-method.entity.js';
import { PaymentMethodUsage } from './entities/payment-method-usage.entity.js';
import { PayappSeller } from './entities/payapp-seller.entity.js';
import { PaymentTransaction } from './entities/payment-transaction.entity.js';
import { ServiceCustomer } from './entities/service-customer.entity.js';
import { ServiceWebhook } from './entities/service-webhook.entity.js';
import { CashReceipt } from './entities/cash-receipt.entity.js';
import { VerificationCode } from './entities/verification-code.entity.js';
import { ProfileController } from './profile.controller.js';
import { StripeConfigController } from './stripe-config.controller.js';
import { PayappWebhookController } from './payapp-webhook.controller.js';
import { SsoPaymentController } from './sso-payment.controller.js';
import { ServiceStripeController } from './service-stripe.controller.js';
import { StripeWebhookController } from './stripe-webhook.controller.js';
import { ApiKey } from '../admin/entities/api-key.entity.js';
import { OauthClient } from '../auth/entities/oauth-client.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentService } from './payment.service.js';
import { StripeService } from './stripe.service.js';
import { ServiceWebhookService } from './service-webhook.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      PaymentMethod,
      PaymentMethodUsage,
      PayappSeller,
      PaymentTransaction,
      ServiceCustomer,
      ServiceWebhook,
      CashReceipt,
      VerificationCode,
      ApiKey,
      OauthClient,
    ]),
    forwardRef(() => AuthModule),
    HttpModule,
  ],
  controllers: [
    ProfileController,
    SsoPaymentController,
    ServiceStripeController,
    PayappWebhookController,
    StripeWebhookController,
    StripeConfigController,
  ],
  providers: [PaymentService, StripeService, ServiceWebhookService],
  exports: [TypeOrmModule, PaymentService, StripeService, ServiceWebhookService],
})
export class UserModule {}
