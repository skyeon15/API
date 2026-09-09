import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { SsoAdminController } from './sso-admin.controller.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { User } from '../users/entities/user.entity.js';
import { ApiKey } from '../admin/entities/api-key.entity.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { UserSocialAccount } from './entities/user-social-account.entity.js';
import { OauthClient } from './entities/oauth-client.entity.js';
import { OauthGrant } from './entities/oauth-grant.entity.js';
import { OauthClientAdmin } from './entities/oauth-client-admin.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      RefreshToken,
      UserSocialAccount,
      OauthClient,
      OauthGrant,
      OauthClientAdmin,
      ApiKey, // ApiKeyOrSessionGuard(SSO 관리 API)용
    ]),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.API_JWT_SECRET || 'pds-jwt-secret',
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  providers: [AuthService, JwtAuthGuard],
  controllers: [AuthController, SsoAdminController],
  exports: [AuthService, JwtModule, JwtAuthGuard],
})
export class AuthModule {}
