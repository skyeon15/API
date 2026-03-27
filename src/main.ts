import 'reflect-metadata';
import './admin-setup.js';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'; // 추가
import { apiReference } from '@scalar/nestjs-api-reference';
import { AppModule } from './app.module.js';
import { SERVICE_REGISTRY } from './common/service-registry.js';

async function bootstrap() {
  console.log('[BOOTSTRAP] Starting Nest application...');
  const app = await NestFactory.create(AppModule);
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
    .setDescription('파란대나무숲에서 제공하는 다양한 API 서비스의 기술 문서예요! 각 엔드포인트에 대한 상세한 설명과 테스트 방법을 확인할 수 있어요.')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', description: 'API 키를 입력하세요.' }, 'api-key');
  SERVICE_REGISTRY.forEach(({ label }) => builder.addTag(label));
  const config = builder.build();
  const document = SwaggerModule.createDocument(app, config);
  app.use(
    '/api',
    apiReference({
      pageTitle: '파란대나무숲 API 문서',
      content: document,
      hideDownloadButton: true,
      favicon: '/public/favicon.svg',
      defaultOpenAllTags: true,
      expandAllResponses: true,
      expandAllModelSections: true,
      pathRouting: { basePath: '/api' },
    }),
  ); // http://localhost:1015/api 로 접속
  // Swagger 설정 끝

  const port = process.env.PORT || 1015;
  console.log(`[BOOTSTRAP] Attempting to listen on port ${port}...`);
  await app.listen(port);
  console.log(`[BOOTSTRAP] Application is running on: http://localhost:${port}/api`);
}
bootstrap().catch(err => {
  console.error('[BOOTSTRAP] Failed to start:', err);
});
