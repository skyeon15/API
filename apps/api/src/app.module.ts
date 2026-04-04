import { Logger, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AdminPanelModule } from './admin/admin.module.js';
import { IpRestrictionGuard } from './common/guards/ip-restriction.guard.js';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { WruaModule } from './wrua/wrua.module.js';
import { LostarkModule } from './lostark/lostark.module.js';
import { CommonModule } from './common/common.module.js';
import { RedisModule } from './common/redis/redis.module.js';
import { NeisModule } from './neis/neis.module.js';
import { InfoModule } from './info/info.module.js';
import { AlimtalkModule } from './alimtalk/alimtalk.module.js';
import { UserModule } from './users/user.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { ApiKey } from './admin/entities/api-key.entity.js';
import { User } from './users/entities/user.entity.js';
import { PaymentMethod } from './users/entities/payment-method.entity.js';
import { PayappSeller } from './users/entities/payapp-seller.entity.js';
import { VerificationCode } from './users/entities/verification-code.entity.js';
import { RefreshToken } from './auth/entities/refresh-token.entity.js';
import { UserSocialAccount } from './auth/entities/user-social-account.entity.js';
import { OauthClient } from './auth/entities/oauth-client.entity.js';
import { OauthGrant } from './auth/entities/oauth-grant.entity.js';
import { AuditLog } from './audit/entities/audit-log.entity.js';
import { AlimtalkChannel } from './alimtalk/entities/channel.entity.js';
import { AlimtalkTemplate } from './alimtalk/entities/template.entity.js';
import { AlimtalkMessage } from './alimtalk/entities/message.entity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            singleLine: false, // 객체를 여러 줄로 보기 편하게 출력
            levelFirst: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
            messageFormat: '{req.method} {req.url} {res.statusCode} - {msg}',
          },
        },
        // 요청 및 응답에서 필요한 정보만 추출하고 안전하게 직렬화
        serializers: {
          req: (req) => {
            const raw = req.raw || req;
            return {
              id: req.id,
              method: req.method,
              url: req.url,
              // 'simple-array' 에러 방지를 위해 깊은 복사/직렬화 수행
              query: JSON.parse(JSON.stringify((req as any).query || {})),
              body: JSON.parse(JSON.stringify(raw.body || {})),
              remoteAddress: raw.headers?.['x-forwarded-for'] || raw.socket?.remoteAddress,
            };
          },
          res: (res) => {
            const raw = (res as any).raw || res;
            return {
              statusCode: res.statusCode,
              body: raw.body || (res as any).body,
            };
          },
        },
        redact: {
          paths: [
            'req.body.password',
            'req.body.token',
            'req.body.secret',
            'req.body.api_key',
            'req.body.apiKey',
            'req.headers.authorization',
          ],
          censor: '***',
        },
        autoLogging: {
          ignore: (req) => req.url === '/health',
        },
        // 성공/실패 메시지 커스텀
        customSuccessMessage: (req, res) => `Request completed`,
        customErrorMessage: (req, res, err) => `Request failed: ${err.message}`,
      },
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => {
        const logger = new Logger('Database');
        const host = process.env.API_DB_HOST || 'localhost';
        const port = parseInt(process.env.API_DB_PORT || '5432', 10);
        const database = process.env.API_DB_NAME || 'pds_api';
        const username = process.env.API_DB_USER || 'pds_user';

        logger.log(`데이터베이스 연결을 시도합니다...`);
        logger.log(
          `언결 설정: Host=${host}, Port=${port}, Database=${database}, User=${username}`,
        );

        return {
          type: 'postgres',
          host,
          port,
          username,
          password: process.env.API_DB_PASSWORD || 'pds_password',
          database,
          entities: [
            ApiKey,
            User,
            PaymentMethod,
            PayappSeller,
            VerificationCode,
            RefreshToken,
            UserSocialAccount,
            OauthClient,
            OauthGrant,
            AuditLog,
            AlimtalkChannel,
            AlimtalkTemplate,
            AlimtalkMessage,
          ],
          synchronize: false,
          migrations: [join(__dirname, 'migrations/*.{ts,js}')],
          migrationsRun: true,
          migrationsTransactionMode: 'each',
          retryAttempts: 3,
          retryDelay: 3000,
          verboseRetryLog: true,
        };
      },
    }),
    AdminPanelModule,
    UserModule,
    AuditModule,
    WruaModule,
    LostarkModule,
    CommonModule,
    RedisModule,
    NeisModule,
    InfoModule,
    AlimtalkModule,
    AuthModule,
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public'),
      serveRoot: '/public',
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: IpRestrictionGuard,
    },
  ],
})
export class AppModule {}

