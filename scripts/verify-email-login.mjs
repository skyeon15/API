// Real HTTP, PostgreSQL transactions/migrations, and Redis Lua scripts.
// Docker containers are disposable, bound to localhost, and removed in finally.
// Resend is mocked: this test never sends mail or loads production secrets.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Redis } from 'ioredis';
import cookieParser from 'cookie-parser';
import request from 'supertest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const output = mkdtempSync(path.join(root, '.verify-email-login-'));
const containers = [];
const originalFetch = globalThis.fetch;
let app, database, redis;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const origin = 'https://platform.example';
process.env.API_WEB_URL = origin;
process.env.API_JWT_SECRET = 'local-email-login-jwt-secret-at-least-32-characters';
process.env.API_EMAIL_OTP_SECRET = 'local-email-code-signing-key-at-least-32-characters';
process.env.API_RESEND_API_KEY = 're_local_test_key';
process.env.API_RESEND_FROM = 'Test <no-reply@example.test>';
process.env.API_NODE_ENV = 'production';

function startContainer(kind, image, port, extra = []) {
  const name = 'pds-email-test-' + kind + '-' + process.pid;
  docker(['run', '-d', '--rm', '--name', name, '--memory', '256m',
    '-p', '127.0.0.1::' + port, ...extra, image]);
  containers.push(name);
  return Number(docker(['port', name, String(port)]).split(':').at(-1));
}

try {
  execFileSync(process.execPath, [require.resolve('typescript/lib/tsc.js'), '-p',
    'apps/api/tsconfig.build.json', '--outDir', output, '--incremental', 'false'],
  { cwd: root, stdio: 'inherit' });
  writeFileSync(path.join(output, 'package.json'), JSON.stringify({ type: 'module' }));
  const compiled = file => import(pathToFileURL(path.join(output, file)).href);
  const { User, UserStatus } = await compiled('users/entities/user.entity.js');
  const { RefreshToken } = await compiled('auth/entities/refresh-token.entity.js');
  const { UserSocialAccount } = await compiled('auth/entities/user-social-account.entity.js');
  const { OauthClient } = await compiled('auth/entities/oauth-client.entity.js');
  const { AuthService } = await compiled('auth/auth.service.js');
  const { AuthController } = await compiled('auth/auth.controller.js');
  const { EmailAuthService } = await compiled('auth/email-auth.service.js');
  const { EmailAuthController } = await compiled('auth/email-auth.controller.js');
  const { AddEmailLogin1792800000000 } = await compiled('migrations/1792800000000-AddEmailLogin.js');

  const pgPort = startContainer('pg', 'postgres:17-alpine', 5432, ['-e', 'POSTGRES_PASSWORD=isolated-email-test']);
  const redisPort = startContainer('redis', 'redis:7-alpine', 6379);
  database = new DataSource({
    type: 'postgres', host: '127.0.0.1', port: pgPort, username: 'postgres',
    password: 'isolated-email-test', database: 'postgres',
    entities: [User, RefreshToken, UserSocialAccount], synchronize: false,
    connectTimeoutMS: 1000,
  });
  for (let attempt = 0; ; attempt++) {
    try { await database.initialize(); break; }
    catch (error) { if (attempt >= 40) throw error; await sleep(250); }
  }
  await database.synchronize();
  redis = new Redis({ host: '127.0.0.1', port: redisPort, keyPrefix: 'email-test:', lazyConnect: true });
  await redis.connect();

  const migration = new AddEmailLogin1792800000000();
  const runner = database.createQueryRunner();
  await migration.down(runner);
  const legacyId = randomUUID();
  await database.query('INSERT INTO users(id, name, email) VALUES($1, $2, $3)', [legacyId, 'Legacy', 'legacy@example.test']);
  await migration.up(runner);
  assert.equal((await database.query('SELECT "loginEmail" FROM users WHERE id=$1', [legacyId]))[0].loginEmail, null);
  await runner.release();
  console.log('Migration: existing contact emails are not promoted to login credentials.');

  const users = database.getRepository(User);
  const refreshTokens = database.getRepository(RefreshToken);
  const socialAccounts = database.getRepository(UserSocialAccount);
  const jwt = new JwtService({ secret: process.env.API_JWT_SECRET });
  const auth = new AuthService(users, refreshTokens, socialAccounts, {}, {}, {}, jwt, redis);
  const emailAuth = new EmailAuthService(users, redis);
  const module = await Test.createTestingModule({
    imports: [JwtModule.register({ secret: process.env.API_JWT_SECRET })],
    controllers: [AuthController, EmailAuthController],
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: EmailAuthService, useValue: emailAuth },
      { provide: getRepositoryToken(OauthClient), useValue: {} },
    ],
  }).compile();
  app = module.createNestApplication({ logger: false });
  app.set('trust proxy', true);
  app.use(cookieParser());
  await app.init();
  const http = request(app.getHttpServer());

  const emails = [];
  let delivery = 'ok';
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://api.resend.com/emails', 'No unexpected external requests');
    assert.equal(init.headers.Authorization, 'Bearer re_local_test_key');
    assert.match(init.headers['Idempotency-Key'], /^email-login\/[a-f0-9]{64}$/);
    const email = JSON.parse(init.body);
    emails.push({ ...email, code: email.text.match(/인증코드: (\d{6})/)[1] });
    if (delivery === 'timeout') throw new Error('Simulated timeout');
    return new Response(JSON.stringify({ id: randomUUID() }), { status: delivery === 'ok' ? 200 : 503 });
  };
  const resetRates = async () => redis.flushdb();
  function client(userId) {
    const jar = new Map();
    if (userId) jar.set('access_token', jwt.sign({ sub: userId }, { expiresIn: '15m' }));
    return { jar, ip: '192.0.2.1' };
  }
  async function call(browser, method, route, body = {}, expected = 201, headers = {}) {
    const req = http[method](route).set({
      Origin: origin, 'X-Forwarded-For': browser.ip, ...headers,
    }).set('Cookie', [...browser.jar].map(([key, value]) => key + '=' + value));
    const response = await req.send(body).expect(expected);
    for (const cookie of response.headers['set-cookie'] || []) {
      const pair = cookie.split(';')[0];
      const i = pair.indexOf('=');
      const name = pair.slice(0, i), value = pair.slice(i + 1);
      if (value) browser.jar.set(name, value); else browser.jar.delete(name);
    }
    return response;
  }
  async function send(browser, email, purpose = 'login', expected = 201) {
    const response = await call(browser, 'post', '/auth/email/' + (purpose === 'link' ? 'link/' : '') + 'request', { email }, expected);
    if (expected !== 201) return response;
    const mail = emails.at(-1);
    assert.deepEqual(Object.keys(response.body).sort(), ['challengeId', 'expiresIn', 'retryAfter']);
    assert.equal(response.body.expiresIn, 300);
    assert.equal(response.body.retryAfter, 60);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.ok(!JSON.stringify(response.body).includes(mail.code));
    return { email: email.trim().toLowerCase(), challengeId: response.body.challengeId, code: mail.code };
  }
  const verify = (browser, payload, status = 201, purpose = 'login') =>
    call(browser, 'post', '/auth/email/' + (purpose === 'link' ? 'link/' : '') + 'verify', payload, status);
  const sessionId = browser => jwt.verify(decodeURIComponent(browser.jar.get('access_token'))).sub;
  const seed = (email, extra = {}) => users.save(users.create({ name: 'Existing', email, ...extra }));

  assert.equal((await http.get('/auth/email/status').expect(200)).body.enabled, true);
  const alice = client();
  let payload = await send(alice, ' New.User@Example.test ');
  assert.equal(emails.at(-1).to[0], 'new.user@example.test');
  await verify(client(), payload, 400); // Proof is bound to the initiating browser.
  await verify(alice, { ...payload, code: payload.code === '000000' ? '000001' : '000000' }, 400);
  const signedIn = await verify(alice, payload);
  const aliceId = sessionId(alice);
  const newUser = await users.findOneByOrFail({ id: aliceId });
  assert.equal(newUser.loginEmail, 'new.user@example.test');
  assert.equal(newUser.name, ''); // Existing profile-completion flow handles new signup.
  for (const name of ['access_token', 'refresh_token']) {
    const cookie = signedIn.headers['set-cookie'].find(c => c.startsWith(name + '='));
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.doesNotMatch(cookie, /Max-Age|Expires/);
  }
  assert.deepEqual(signedIn.body, { message: '로그인되었습니다.' });
  await verify(alice, payload, 400);
  console.log('Signup/login: browser binding, normalization, safe session cookies, and single use passed.');

  await resetRates();
  const concurrent = client();
  payload = await send(concurrent, newUser.loginEmail);
  const pair = await Promise.all([1, 2].map(() =>
    http.post('/auth/email/verify').set('Origin', origin)
      .set('Cookie', [...concurrent.jar].map(([k, v]) => k + '=' + v)).send(payload)));
  assert.deepEqual(pair.map(r => r.status).sort(), [201, 400]);

  await resetRates();
  const attempts = client();
  payload = await send(attempts, 'attempts@example.test');
  const wrong = payload.code === '000000' ? '000001' : '000000';
  for (let i = 0; i < 5; i++) await verify(attempts, { ...payload, code: wrong }, 400);
  await verify(attempts, payload, 400);

  await resetRates();
  const expired = client();
  payload = await send(expired, 'expired@example.test');
  await redis.expire('email-auth:challenge:' + payload.challengeId, -1);
  await verify(expired, payload, 400);

  await resetRates();
  const resend = client();
  const old = await send(resend, 'resend@example.test');
  const cooldown = await send(resend, old.email, 'login', 429);
  assert.ok(cooldown.body.retryAfter > 0);
  for (const key of await redis.keys('email-test:email-auth:cooldown:*')) await redis.del(key.replace('email-test:', ''));
  const latest = await send(resend, old.email);
  await verify(resend, old, 400);
  await verify(resend, latest);
  console.log('Codes: atomic parallel consume, five-attempt lockout, expiry, resend cooldown, and replacement passed.');

  await resetRates();
  const existing = client();
  const beforeCount = await users.count();
  payload = await send(existing, 'LEGACY@example.test');
  const conflict = await verify(existing, payload, 409);
  assert.match(conflict.body.message, /프로필/);
  assert.equal(existing.jar.has('access_token'), false);
  assert.equal(await users.count(), beforeCount);
  assert.equal((await users.findOneByOrFail({ id: legacyId })).loginEmail, null);

  const legacy = client(legacyId);
  await resetRates();
  payload = await send(legacy, 'legacy@example.test', 'link');
  const attacker = client(aliceId);
  attacker.jar.set('email_link_challenge', legacy.jar.get('email_link_challenge'));
  await verify(attacker, payload, 400, 'link');
  legacy.jar.set('email_login_challenge', legacy.jar.get('email_link_challenge'));
  await verify(legacy, payload, 400);
  await verify(legacy, payload, 201, 'link');
  assert.equal(sessionId(legacy), legacyId);
  assert.equal((await users.findOneByOrFail({ id: legacyId })).loginEmail, 'legacy@example.test');

  await resetRates();
  const relogin = client();
  payload = await send(relogin, 'legacy@example.test');
  await verify(relogin, payload);
  assert.equal(sessionId(relogin), legacyId);
  await auth.updateProfile(legacyId, { email: 'contact@example.test', loginEmail: 'unverified@example.test' });
  assert.equal((await users.findOneByOrFail({ id: legacyId })).loginEmail, 'legacy@example.test');
  assert.equal((await auth.getMyProfile(legacyId)).loginEmail, 'legacy@example.test');

  await resetRates();
  payload = await send(alice, 'legacy@example.test', 'link');
  await verify(alice, payload, 409, 'link');
  assert.equal((await users.findOneByOrFail({ id: aliceId })).loginEmail, newUser.loginEmail);
  console.log('Account linking: no contact-email merge, verified session binding, separate credential, and collision protection passed.');

  await resetRates();
  await call(client(), 'post', '/auth/email/link/request', { email: 'a@example.test' }, 401);
  const sso = client();
  sso.jar.set('access_token', jwt.sign({ sub: legacyId, typ: 'sso', aud: 'other-service' }));
  await call(sso, 'post', '/auth/email/link/request', { email: 'a@example.test' }, 401);
  await call(client(), 'post', '/auth/email/request', { email: 'csrf@example.test' }, 403, { Origin: 'https://attacker.example' });
  await call(client(), 'post', '/auth/email/request', { email: 'csrf@example.test' }, 403, { 'Sec-Fetch-Site': 'cross-site' });
  await http.post('/auth/email/request').set('Origin', origin).type('form').send({ email: 'csrf@example.test' }).expect(400);
  await call(client(), 'post', '/auth/email/request', { email: 'bad\nheader@example.test' }, 400);
  await call(client(), 'post', '/auth/email/request', { email: ['array@example.test'] }, 400);

  await resetRates();
  const blocked = await seed('blocked@example.test', { loginEmail: 'blocked@example.test', status: UserStatus.BLOCKED });
  const blockedBrowser = client();
  payload = await send(blockedBrowser, blocked.loginEmail);
  await verify(blockedBrowser, payload, 401);
  assert.equal(blockedBrowser.jar.has('access_token'), false);

  await resetRates();
  const quota = client();
  for (let i = 0; i < 5; i++) {
    for (const key of await redis.keys('email-test:email-auth:cooldown:*')) await redis.del(key.replace('email-test:', ''));
    await send(quota, 'quota@example.test');
  }
  for (const key of await redis.keys('email-test:email-auth:cooldown:*')) await redis.del(key.replace('email-test:', ''));
  const sent = emails.length;
  await send(quota, 'quota@example.test', 'login', 429);
  assert.equal(emails.length, sent);

  await resetRates();
  for (let i = 0; i < 30; i++) await send(quota, 'ip-' + i + '@example.test');
  await send(quota, 'ip-over@example.test', 'login', 429);

  await resetRates();
  process.env.API_EMAIL_OTP_HOURLY_LIMIT = '2';
  await send(quota, 'global-1@example.test');
  quota.ip = '192.0.2.2';
  await send(quota, 'global-2@example.test');
  quota.ip = '192.0.2.3';
  await send(quota, 'global-over@example.test', 'login', 429);
  delete process.env.API_EMAIL_OTP_HOURLY_LIMIT;

  await resetRates();
  const guesses = client();
  payload = await send(guesses, 'verify-ip@example.test');
  for (let i = 0; i < 30; i++) await verify(guesses, { ...payload, challengeId: 'a'.repeat(64) }, 400);
  await verify(guesses, payload, 429);

  for (const mode of ['error', 'timeout']) {
    await resetRates();
    delivery = mode;
    await send(client(), 'delivery@example.test', 'login', 503);
    assert.equal((await redis.keys('email-test:email-auth:challenge:*')).length, 0);
  }
  delivery = 'ok';
  await resetRates();
  const savedKey = process.env.API_RESEND_API_KEY;
  delete process.env.API_RESEND_API_KEY;
  assert.equal((await http.get('/auth/email/status')).body.enabled, false);
  await send(client(), 'disabled@example.test', 'login', 503);
  process.env.API_RESEND_API_KEY = savedKey;
  const offlineRedis = redis.duplicate({ lazyConnect: true });
  const offlineAuth = new EmailAuthService(users, offlineRedis);
  await assert.rejects(() => offlineAuth.requestCode('offline@example.test', '127.0.0.1', 'login'),
    error => error.getStatus() === 503);
  offlineRedis.disconnect();
  console.log('Abuse/failure handling: origin checks, SSO rejection, blocked users, email/IP/global quotas, verification quota, delivery failures, and Redis fail-closed passed.');

  await call(alice, 'delete', '/auth/email/link', {}, 400); // Email-only account cannot lose its last login.
  await socialAccounts.save(socialAccounts.create({ userId: aliceId, provider: 'google', providerUserId: 'alice-google' }));
  await auth.unlinkSocialAccount(aliceId, 'google');
  assert.equal(await socialAccounts.countBy({ userId: aliceId }), 0);
  await assert.rejects(() => emailAuth.unlink(aliceId), error => error.getStatus() === 400);
  await socialAccounts.save(socialAccounts.create({ userId: aliceId, provider: 'google', providerUserId: 'alice-google' }));
  const unlinkResults = await Promise.allSettled([
    emailAuth.unlink(aliceId), auth.unlinkSocialAccount(aliceId, 'google'),
  ]);
  assert.equal(unlinkResults.filter(r => r.status === 'fulfilled').length, 1);
  const aliceAfter = await users.findOneByOrFail({ id: aliceId });
  assert.ok(aliceAfter.loginEmail || await socialAccounts.countBy({ userId: aliceId }) > 0);
  console.log('Credential lifecycle: last-login protection survives concurrent email/social unlink.');

  const originalRefresh = decodeURIComponent(relogin.jar.get('refresh_token'));
  const originalRecord = await refreshTokens.findOneByOrFail({ token: originalRefresh });
  assert.ok(originalRecord.sessionExpiresAt);
  const beforeRefresh = originalRecord.sessionExpiresAt.getTime();
  const refreshed = await call(relogin, 'post', '/auth/refresh', {});
  const rotated = await refreshTokens.findOneByOrFail({ token: decodeURIComponent(relogin.jar.get('refresh_token')) });
  assert.equal(rotated.sessionExpiresAt.getTime(), beforeRefresh);
  assert.equal(rotated.expiresAt.getTime(), beforeRefresh);
  assert.doesNotMatch(refreshed.headers['set-cookie'].find(c => c.startsWith('refresh_token=')), /Max-Age|Expires/);
  const reused = client();
  reused.jar.set('refresh_token', originalRefresh);
  await call(reused, 'post', '/auth/refresh', {}, 401);
  const nearExpiry = new Date(Date.now() + 45000);
  await refreshTokens.update(rotated.id, { sessionExpiresAt: nearExpiry, expiresAt: nearExpiry });
  await call(relogin, 'post', '/auth/refresh', {});
  const access = jwt.verify(decodeURIComponent(relogin.jar.get('access_token')));
  assert.ok(access.exp * 1000 <= nearExpiry.getTime());
  const currentRefresh = decodeURIComponent(relogin.jar.get('refresh_token'));
  const refreshPair = await Promise.all([1, 2].map(() =>
    http.post('/auth/refresh').set('Cookie', 'refresh_token=' + currentRefresh).send({})));
  assert.deepEqual(refreshPair.map(r => r.status).sort(), [201, 401]);
  const last = await refreshTokens.findOneByOrFail({ userId: legacyId });
  await refreshTokens.update({ userId: legacyId }, { expiresAt: new Date(Date.now() - 1000) });
  relogin.jar.set('refresh_token', last.token);
  await call(relogin, 'post', '/auth/refresh', {}, 401);
  console.log('Temporary sessions: absolute expiry, bounded access token lifetime, refresh rotation, and replay/concurrency rejection passed.');


  const raceUser = await seed('race@example.test', { loginEmail: 'race@example.test' });
  for (let i = 0; i < 5; i++) {
    await emailAuth.link(raceUser.id, 'race@example.test');
    const raceSession = await auth.createEmailSession(raceUser.id, 'race@example.test');
    const outcomes = await Promise.allSettled([
      auth.refresh(raceSession.refreshToken),
      emailAuth.link(raceUser.id, 'race-new@example.test'),
    ]);
    assert.equal(outcomes[1].status, 'fulfilled');
    assert.equal(await refreshTokens.countBy({ userId: raceUser.id }), 0,
      'Concurrent refresh must not resurrect a session after an email change');
    await assert.rejects(() => auth.createEmailSession(raceUser.id, 'race@example.test'),
      error => error.getStatus() === 401);
  }
  console.log('Credential changes and refresh cannot recreate revoked email sessions.');

  await assert.rejects(() => users.update(legacyId, { loginEmail: 'UPPER@example.test' }));
  await assert.rejects(() => users.save(users.create({ name: 'Duplicate', loginEmail: 'legacy@example.test' })));
  console.log('Email login: all HTTP, Redis, database, migration, and session checks passed. No emails sent.');
} finally {
  globalThis.fetch = originalFetch;
  await app?.close();
  redis?.disconnect();
  if (database?.isInitialized) await database.destroy();
  for (const name of containers.reverse()) {
    try { docker(['rm', '-f', name]); } catch {}
  }
  // output is created by mkdtempSync directly under this repository.
  if (path.dirname(output) === root && path.basename(output).startsWith('.verify-email-login-')) {
    rmSync(output, { recursive: true, force: true });
  }
}
