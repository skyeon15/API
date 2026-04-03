import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { User } from '../users/entities/user.entity.js';
import { VerificationCode } from '../users/entities/verification-code.entity.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { UserSocialAccount } from './entities/user-social-account.entity.js';
import { OauthClient } from './entities/oauth-client.entity.js';
import { OauthGrant } from './entities/oauth-grant.entity.js';
import { AlimtalkModule } from '../alimtalk/alimtalk.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      VerificationCode,
      RefreshToken,
      UserSocialAccount,
      OauthClient,
      OauthGrant,
    ]),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.API_JWT_SECRET || 'pds-jwt-secret',
        signOptions: { expiresIn: '15m' },
      }),
    }),
    AlimtalkModule,
  ],
  providers: [AuthService, JwtAuthGuard],
  controllers: [AuthController],
  exports: [AuthService, JwtModule, JwtAuthGuard],
})
export class AuthModule {}
