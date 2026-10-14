// Exercise real social callbacks with session cookies and repository fixtures.
// No social credentials, production database, or external requests are used.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import cookieParser from 'cookie-parser';
import request from 'supertest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const output = mkdtempSync(path.join(root, '.verify-social-login-'));
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

  const users = [];
  const accounts = [];
  const refreshTokens = [];
  let writes = 0;
  let profile;
  const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
  const userRepo = {
    findOneBy: async (where) => users.find(user =>
      (Array.isArray(where) ? where : [where]).some(condition => matches(user, condition)),
    ) ?? null,
    create: (data) => ({ ...data }),
    save: async (data) => {
      writes++;
      const user = { id: `new-user-${users.length}`, ...data };
      user.save = async () => { writes++; return user; };
      users.push(user);
      return user;
    },
  };
  const socialRepo = {
    findOne: async ({ where }) => {
      const account = accounts.find(row => matches(row, where));
      return account ? { ...account, user: users.find(user => user.id === account.userId),
        save: async () => { writes++; },
      } : null;
    },
    create: (data) => ({ ...data }),
    save: async (data) => { writes++; accounts.push(data); return data; },
  };
  const refreshRepo = {
    create: (data) => data,
    save: async (data) => { refreshTokens.push(data); return data; },
  };
  const jwt = new JwtService({ secret: 'local-social-login-test-secret' });
  const service = new AuthService(userRepo, refreshRepo, socialRepo, {}, {}, {}, jwt, {});
  for (const method of ['getKakaoProfile', 'getNaverProfile', 'getGoogleProfile']) {
    service[method] = async () => profile;
  }
  const module = await Test.createTestingModule({
    imports: [JwtModule.register({ secret: 'local-social-login-test-secret' })],
    controllers: [AuthController],
    providers: [
      { provide: AuthService, useValue: service },
      { provide: getRepositoryToken(OauthClient), useValue: {} },
    ],
  }).compile();
  app = module.createNestApplication({ logger: false });
  app.use(cookieParser());
  await app.init();
  const http = request(app.getHttpServer());
  const reset = () => {
    users.length = accounts.length = refreshTokens.length = writes = 0;
    profile = {
      providerUserId: 'incoming-social-id', name: 'Incoming User',
      email: 'incoming@example.test', phone: '01012345678', birthDate: '1990-01-02',
    };
  };
  const seedUser = (id, data = {}) => {
    const user = { id, name: 'Existing User', email: `${id}@example.test`, phone: null,
      birthDate: null, ...data };
    user.save = async () => { writes++; return user; };
    users.push(user);
    return user;
  };
  const snapshot = () => JSON.stringify({ users, accounts, refreshTokens, writes });
  const callback = async (provider, sessionId, status = 302) => {
    const query = { code: 'fixture-code', state: 'https://platform.example/profile',
      finalRedirect: 'https://platform.example/profile' };
    let req = http.get(`/auth/${provider}/callback`).query(query).set({
      'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'platform.example',
    });
    if (sessionId) req = req.set('Cookie', `access_token=${jwt.sign({ sub: sessionId })}`);
    return req.expect(status);
  };
  const assertSession = (response, userId) => {
    assert.equal(response.headers.location, 'https://platform.example/profile');
    const cookies = response.headers['set-cookie'];
    const access = cookies.find(cookie => cookie.startsWith('access_token='));
    assert.equal(jwt.verify(decodeURIComponent(access.split(';')[0].slice('access_token='.length))).sub, userId);
    assert.equal(refreshTokens.at(-1).userId, userId);
  };

  for (const provider of ['kakao', 'naver', 'google']) {
    // Reproduce the incident: another social identity arrives with an existing session.
    reset();
    const sessionUser = seedUser('session-user');
    const original = JSON.stringify(sessionUser);
    const response = await callback(provider, sessionUser.id);
    assert.equal(JSON.stringify(sessionUser), original, `${provider}: session user's profile must remain untouched`);
    assert.equal(users.length, 2);
    assert.equal(accounts.length, 1);
    const newUser = users[1];
    assert.equal(newUser.email, profile.email);
    assert.equal(newUser.phone, profile.phone);
    assert.equal(newUser.birthDate, profile.birthDate);
    assert.equal(accounts[0].userId, newUser.id);
    assert.equal(accounts[0].provider, provider);
    assert.equal(accounts[0].providerUserId, profile.providerUserId);
    assertSession(response, newUser.id);

    // An existing social login switches to its owner even if a different session is present.
    reset();
    const other = seedUser('session-user');
    const owner = seedUser('social-owner', { email: profile.email });
    accounts.push({ provider, providerUserId: profile.providerUserId, userId: owner.id });
    const previous = JSON.stringify(other);
    assertSession(await callback(provider, other.id), owner.id);
    assert.equal(JSON.stringify(other), previous);
    assert.equal(users.length, 2);
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0].userId, owner.id);
  }

  // Preserve users that already have several social identities linked.
  reset();
  const legacy = seedUser('legacy-user', { email: profile.email, phone: '01087654321', birthDate: '1980-03-04' });
  for (const provider of ['kakao', 'naver', 'google']) {
    accounts.push({ provider, providerUserId: profile.providerUserId, userId: legacy.id });
  }
  const originalLinks = JSON.stringify(accounts);
  for (const provider of ['kakao', 'naver', 'google']) assertSession(await callback(provider), legacy.id);
  assert.equal(JSON.stringify(accounts), originalLinks);
  assert.equal(users.length, 1);
  assert.equal(legacy.phone, '01087654321');
  assert.equal(legacy.birthDate, '1980-03-04');

  // Neither matching email nor CI may turn a new social identity into an account link.
  for (const conflict of ['email', 'ci', 'email-with-different-ci']) {
    reset();
    seedUser('existing-user', conflict === 'ci' ? { ci: 'shared-ci' } : { email: profile.email });
    if (conflict === 'ci') profile.ci = 'shared-ci';
    if (conflict === 'email-with-different-ci') profile.ci = 'new-ci';
    const before = snapshot();
    const response = await callback('naver', 'existing-user', 400);
    assert.match(response.body.message, /기존 로그인 수단/);
    assert.equal(response.headers['set-cookie'], undefined);
    assert.equal(snapshot(), before, `${conflict}: rejection must not modify users or links`);
  }

  // New Google users with no phone, birthday or email can still enter profile completion.
  reset();
  profile = { providerUserId: 'minimal-google-id' };
  assertSession(await callback('google'), users[0].id);
  assert.equal(users[0].name, '');
  assert.equal(users[0].phoneVerified, false);
  console.log('Social login: all 3 providers ignore unrelated sessions; existing links preserved; email/CI merging rejected; new signup passed.');
} finally {
  await app?.close();
  rmSync(output, { recursive: true, force: true });
}
