import 'reflect-metadata';
import './admin-setup.js';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { SERVICE_REGISTRY } from './common/service-registry.js';

const REQUIRED_ENV_VARS = [
  'API_DB_HOST', 'API_DB_PORT', 'API_DB_NAME', 'API_DB_USER', 'API_DB_PASSWORD',
  'API_JWT_SECRET',
  'API_REDIS_HOST', 'API_REDIS_PORT',
];

const OPTIONAL_ENV_VARS = [
  'API_ALIGO_API_KEY', 'API_ALIGO_USER_ID', 'API_ALIGO_FAILOVER',
  'API_PAYAPP_USERID', 'API_PAYAPP_LINKKEY',
];

function checkEnvVars() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  const emptyOptional = OPTIONAL_ENV_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.warn('='.repeat(60));
    console.warn('[환경변수 경고] 다음 필수 환경변수가 설정되지 않았습니다:');
    missing.forEach((key) => console.warn(`  - ${key}`));
    console.warn('.env 파일을 확인해 주세요. 기본값으로 동작하거나 오류가 발생할 수 있습니다.');
    console.warn('='.repeat(60));
  }

  if (emptyOptional.length > 0) {
    console.info('[환경변수 정보] 다음 선택적 환경변수가 설정되지 않았습니다 (해당 기능 비활성화됨):');
    emptyOptional.forEach((key) => console.info(`  - ${key}`));
  }
}

async function bootstrap() {
  checkEnvVars();
  console.log('[BOOTSTRAP] Starting Nest application...');
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());

  app.enableCors({
    origin: (origin, callback) => {
      // 디버깅을 위한 로그 추가 (터미널에서 확인 가능)
      console.log(`[CORS DEBUG] Incoming Origin: ${origin}`);
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
    .setDescription('파란대나무숲에서 제공하는 다양한 API 서비스의 기술 문서예요!')
    .setVersion('1.0')
    .addServer(`http://localhost:${process.env.API_PORT || 10151}`, '로컬 개발 서버')
    .addServer('https://api.bbforest.net', '운영 서버')
    .addBearerAuth({ type: 'http', scheme: 'bearer', description: 'API 키를 입력하세요.' }, 'api-key');
  SERVICE_REGISTRY.forEach(({ label }) => builder.addTag(label));
  const config = builder.build();
  const document = SwaggerModule.createDocument(app, config);
  
  // Swagger JSON 엔드포인트 제공 (프론트엔드에서 가져다 쓸 용도)
  app.use('/docs/openapi.json', (req, res) => {
    res.json(document);
  });

  // Swagger 설정 끝

  const port = process.env.API_PORT || 10151;
  console.log(`[부트스트랩] 포트 ${port}번에서 서버 연결을 시도합니다...`);
  await app.listen(port);
  console.log(`[부트스트랩] API 서버가 실행되었습니다: http://localhost:${port}`);
}

bootstrap().catch(err => {
  console.error('\n' + '='.repeat(50));
  console.error('[부트스트랩 오류] 서버를 시작하는 중에 문제가 발생했습니다.');
  console.error('-'.repeat(50));
  console.error('오류 상세 내용:', err.message || err);
  
  if (err.message && err.message.includes('ECONNREFUSED')) {
    console.error('\n[도움말] 데이터베이스 연결에 실패했습니다.');
    console.error('1. .env 파일의 DB_HOST와 DB_PORT 설정을 확인해 주세요.');
    console.error('2. 데이터베이스 서버가 실행 중인지 확인해 주세요.');
    console.error('3. 네트워크 방화벽에서 해당 포트(5432 등)가 허용되어 있는지 확인해 주세요.');
  }
  console.error('='.repeat(50) + '\n');
  process.exit(1);
});
