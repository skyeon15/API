import 'reflect-metadata';
import './admin-setup.js';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import session from 'express-session';
import { AppModule } from './app.module.js';
import { SERVICE_REGISTRY } from './common/service-registry.js';

async function bootstrap() {
  console.log('[BOOTSTRAP] Starting Nest application...');
  const app = await NestFactory.create(AppModule);

  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'pds-secret-key',
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      },
    }),
  );

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
    .addServer(`http://localhost:${process.env.PORT || 10151}`, '로컬 개발 서버')
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

  const port = process.env.PORT || 10151;
  console.log(`[BOOTSTRAP] Attempting to listen on port ${port}...`);
  await app.listen(port);
  console.log(`[BOOTSTRAP] API Server is running on: http://localhost:${port}`);
}
bootstrap().catch(err => {
  console.error('[BOOTSTRAP] Failed to start:', err);
});
