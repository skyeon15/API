import 'reflect-metadata';
import './admin-setup.js';
import { config } from 'dotenv';
import path from 'path';

// 전역 타임존을 서울로 설정
process.env.TZ = 'Asia/Seoul';

// 루트 .env와 현재 디렉토리 .env를 모두 로드 시도
config({ path: path.join(process.cwd(), '.env') });
config({ path: path.join(process.cwd(), '../../.env') });

import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { SERVICE_REGISTRY } from './common/service-registry.js';
import { setupAxiosLogger } from './common/axios-logger.js';

const REQUIRED_ENV_VARS = [
  'API_DB_HOST',
  'API_DB_PORT',
  'API_DB_NAME',
  'API_DB_USER',
  'API_DB_PASSWORD',
  'API_JWT_SECRET',
  'API_REDIS_HOST',
  'API_REDIS_PORT',
];

const OPTIONAL_ENV_VARS = [
  'API_ALIGO_API_KEY',
  'API_ALIGO_USER_ID',
  'API_ALIGO_FAILOVER',
  'API_PAYAPP_USERID',
  'API_PAYAPP_LINKKEY',
  'API_STRIPE_SECRET_KEY',
  'API_STRIPE_WEBHOOK_SECRET',
  'API_KAKAO_CLIENT_ID',
  'API_NAVER_CLIENT_ID',
  'API_GOOGLE_CLIENT_ID',
];

function checkEnvVars() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  const emptyOptional = OPTIONAL_ENV_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.warn('='.repeat(60));
    console.warn('[환경변수 경고] 다음 필수 환경변수가 설정되지 않았습니다:');
    missing.forEach((key) => console.warn(`  - ${key}`));
    console.warn(
      '.env 파일을 확인해 주세요. 기본값으로 동작하거나 오류가 발생할 수 있습니다.',
    );
    console.warn('='.repeat(60));
  }

  if (emptyOptional.length > 0) {
    console.info(
      '[환경변수 정보] 다음 선택적 환경변수가 설정되지 않았습니다 (해당 기능 비활성화됨):',
    );
    emptyOptional.forEach((key) => console.info(`  - ${key}`));
  }
}

async function bootstrap() {
  checkEnvVars();
  console.log('[BOOTSTRAP] Starting Nest application...');

  // Axios 전역 로거 설정
  setupAxiosLogger();

  // rawBody: Stripe 웹훅 서명검증에 원본 바디가 필요 (req.rawBody)
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  // Pino 로거 사용
  app.useLogger(app.get(Logger));

  app.use(cookieParser());

  app.enableCors({
    origin: (origin, callback) => {
      // 모든 오리진 허용
      callback(null, true);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    optionsSuccessStatus: 204,
  });

  // 프록시 환경에서 클라이언트 IP를 정확히 가져오기 위해 설정
  (app as any).set('trust proxy', true);

  // Swagger 설정 시작
  const builder = new DocumentBuilder()
    .setTitle('파란대나무숲 API')
    .setDescription(
      '파란대나무숲에서 제공하는 다양한 API 서비스의 기술 문서예요!',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', description: 'API 키를 입력하세요.' },
      'api-key',
    );
  SERVICE_REGISTRY.forEach(({ label }) => builder.addTag(label));
  const config = builder.build();
  const document = SwaggerModule.createDocument(app, config);

  // 요청 오리진에 따라 servers를 동적으로 결정한다.
  //  - bbforest.net 도메인: https://<host>/api  (프록시가 /api prefix를 그대로 전달)
  //  - 그 외(로컬 등): <proto>://<host>  (prefix 없음)
  const pickHeader = (v?: string | string[]): string =>
    (Array.isArray(v) ? v[0] : v) || '';
  const resolveServers = (req: any) => {
    const host =
      pickHeader(req.headers['x-forwarded-host']) || req.headers.host || '';
    const proto =
      pickHeader(req.headers['x-forwarded-proto']) ||
      (req.secure ? 'https' : 'http');
    const hostname = host.split(':')[0];
    const url = hostname.endsWith('bbforest.net')
      ? `${proto}://${host}/api`
      : `${proto}://${host}`;
    return [{ url, description: '현재 오리진' }];
  };

  // Swagger JSON 엔드포인트 — 오리진별 servers 반영 (프론트엔드 codegen 용도 겸용)
  app.use('/docs/openapi.json', (req, res) => {
    res.json({ ...document, servers: resolveServers(req) });
  });

  // Swagger UI 설정 — 위 동적 스펙을 가져와 렌더하므로 server도 오리진에 맞춰 표시됨
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      // 페이지가 trailing slash 없이 '/docs'로 제공되므로, nest 에셋과 동일한
      // './docs/...' 상대경로를 써야 '/docs/openapi.json'(운영: '/api/docs/openapi.json')로 해석됨
      url: './docs/openapi.json',
      persistAuthorization: true,
    },
    customSiteTitle: '파란대나무숲 API 문서',
  });

  // Swagger 설정 끝

  const port = process.env.API_PORT || 10151;
  const baseUrl = process.env.API_URL || `http://localhost:${port}`;

  const logger = app.get(Logger);
  logger.log(`[부트스트랩] 포트 ${port}번에서 서버 연결을 시도합니다...`);

  await app.listen(port);
  logger.log(`[부트스트랩] API 서버가 실행되었습니다: ${baseUrl}`);
}

bootstrap().catch((err) => {
  console.error('\n' + '='.repeat(50));
  console.error('[부트스트랩 오류] 서버를 시작하는 중에 문제가 발생했습니다.');
  console.error('-'.repeat(50));
  console.error('오류 상세 내용:', err.message || err);

  if (err.message && err.message.includes('ECONNREFUSED')) {
    console.error('\n[도움말] 데이터베이스 연결에 실패했습니다.');
    console.error('1. .env 파일의 DB_HOST와 DB_PORT 설정을 확인해 주세요.');
    console.error('2. 데이터베이스 서버가 실행 중인지 확인해 주세요.');
    console.error(
      '3. 네트워크 방화벽에서 해당 포트(5432 등)가 허용되어 있는지 확인해 주세요.',
    );
  }
  console.error('='.repeat(50) + '\n');
  process.exit(1);
});
