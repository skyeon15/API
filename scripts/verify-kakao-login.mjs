// Exercise the real HTTP redirects with fixtures, without social credentials or a database.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const output = mkdtempSync(path.join(root, '.verify-kakao-login-'));
let app;
try {
  execFileSync(process.execPath, [
    require.resolve('typescript/lib/tsc.js'),
    '-p', 'apps/api/tsconfig.build.json',
    '--outDir', output,
    '--incremental', 'false',
  ], { cwd: root, stdio: 'inherit' });
  writeFileSync(path.join(output, 'package.json'), JSON.stringify({ type: 'module' }));
  const compiled = (file) => import(pathToFileURL(path.join(output, file)).href);
  const { AuthController } = await compiled('auth/auth.controller.js');
  const { AuthService } = await compiled('auth/auth.service.js');
  const { OauthClient } = await compiled('auth/entities/oauth-client.entity.js');
  const { CONFIG } = await compiled('common/constants.js');
  CONFIG.KAKAO.CLIENT_ID = 'fixture-kakao-client';
  CONFIG.WEB_URL = 'https://platform.example';
  const profileCalls = [];
  const module = await Test.createTestingModule({
    imports: [JwtModule.register({ secret: 'local-test-only-secret' })],
    controllers: [AuthController],
    providers: [
      {
        provide: AuthService,
        useValue: {
          getKakaoProfile: async (code, callbackUrl) => {
            profileCalls.push({ code, callbackUrl });
            return { providerUserId: 'fixture-kakao-user' };
          },
          findOrCreateSocialUser: async () => ({ id: 'fixture-user' }),
          issueRefreshToken: async () => 'fixture-refresh-token',
        },
      },
      { provide: getRepositoryToken(OauthClient), useValue: {} },
    ],
  }).compile();
  app = module.createNestApplication({ logger: false });
  await app.init();
  const http = request(app.getHttpServer());
  const forwarded = {
    'X-Forwarded-Proto': 'https',
    'X-Forwarded-Host': 'platform.example',
  };
  const callbackUrl = 'https://platform.example/api/auth/kakao/callback';
  const scope = 'openid profile email phone address payment';

  const redirects = [
    undefined,
    'https://platform.example/profile',
    'https://platform.example/login?redirect=%2Fcheckout%3Fgift%3Dfixture%26country%3DJP&label=%EC%A6%9D%EC%A0%95%20%2B%20%25#login',
  ];
  for (const [locale, next] of [
    ['ko', '/tracker'],
    ['ko', '/checkout?gift=fixture&country=KR'],
    ['en', '/en/checkout?gift=fixture&country=US'],
    ['ja', '/ja/checkout?gift=fixture&country=JP'],
  ]) {
    const authorize = await http.get('/auth/authorize').query({
      client_id: 'fixture-store',
      redirect_uri: 'https://store.example/api/auth/callback',
      response_type: 'code',
      scope,
      state: `fixture-${locale}`,
    }).set(forwarded).expect(302);
    const login = new URL(authorize.headers.location);
    assert.equal(login.searchParams.get('scope'), scope);
    // Preserve the SSO query just as the login page's social button does.
    login.searchParams.set('redirect', next);
    redirects.push(login.toString());
  }

  for (const redirect of redirects) {
    const response = await http.get('/auth/kakao')
      .query(redirect ? { redirect } : {})
      .set({ ...forwarded, Origin: 'https://platform.example' })
      .expect(302);
    const kakao = new URL(response.headers.location);
    const expectedRedirect = redirect ?? 'https://platform.example/profile';
    assert.equal(kakao.origin + kakao.pathname, 'https://kauth.kakao.com/oauth/authorize');
    assert.equal(kakao.searchParams.get('client_id'), 'fixture-kakao-client');
    assert.equal(kakao.searchParams.get('redirect_uri'), callbackUrl);
    assert.equal(kakao.searchParams.get('response_type'), 'code');
    assert.equal(kakao.searchParams.get('scope'), null, 'SSO scope must not become Kakao consent');
    assert.deepEqual(kakao.searchParams.getAll('state'), [expectedRedirect]);
    assert.deepEqual([...kakao.searchParams.keys()].sort(), [
      'client_id', 'redirect_uri', 'response_type', 'state',
    ]);
    const callback = await http.get('/auth/kakao/callback').query({
      code: 'fixture-code',
      state: kakao.searchParams.get('state'),
    }).set(forwarded).expect(302);
    assert.equal(callback.headers.location, expectedRedirect);
    assert.equal(callback.headers['set-cookie'].length, 2);
  }
  assert.equal(profileCalls.length, redirects.length);
  assert.ok(profileCalls.every(call => call.code === 'fixture-code' && call.callbackUrl === callbackUrl));
  console.log(`Kakao login: ${redirects.length} authorization/callback flows passed; SSO scope stays inside state.`);
} finally {
  await app?.close();
  rmSync(output, { recursive: true, force: true });
}
