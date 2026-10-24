// Browser smoke tests in a disposable Next.js checkout. All API calls are mocked.
// Run with EMAIL_TEST_PLAYWRIGHT pointing to an installed Playwright package.
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.EMAIL_TEST_PLAYWRIGHT || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = mkdtempSync(path.join(root, '.verify-email-ui-'));
let server, browser;
let logs = '';
try {
  cpSync(path.join(root, 'apps/web'), sandbox, { recursive: true, filter: source => {
    const name = path.basename(source);
    return !['node_modules', '.next', 'tsconfig.tsbuildinfo'].includes(name) && !name.startsWith('.env');
  } });
  symlinkSync(path.join(root, 'node_modules'), path.join(sandbox, 'node_modules'), 'dir');
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: sandbox, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', API_PROXY_TARGET: 'http://127.0.0.1:1' },
  });
  server.stdout.on('data', data => { logs += data.toString(); });
  server.stderr.on('data', data => { logs += data.toString(); });
  const origin = 'http://127.0.0.1:' + port;
  for (let attempt = 0; ; attempt++) {
    try { const response = await fetch(origin + '/login'); if (response.ok) break; }
    catch {}
    if (attempt >= 90 || server.exitCode !== null) throw new Error('Next failed to start: ' + logs.slice(-4000));
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const account = {
    id: 'test-user', name: '테스트', nickname: '테스트', gender: 'U',
    birthDate: '1990-01-01', phone: '01012345678', email: 'member@example.test',
    loginEmail: null, roles: ['USER'], createdAt: '2026-01-01T00:00:00Z',
  };

  async function context(initial = {}) {
    const state = { loggedIn: false, enabled: true, user: { ...account }, requests: [], ...initial };
    const ctx = await browser.newContext();
    await ctx.route('**/api/**', async route => {
      const req = route.request(), url = new URL(req.url());
      const endpoint = url.pathname.slice('/api'.length);
      let status = 200, body = {};
      if (endpoint === '/auth/me') { status = state.loggedIn ? 200 : 401; body = state.loggedIn ? state.user : {}; }
      else if (endpoint === '/auth/refresh') status = 401;
      else if (endpoint === '/auth/email/status') body = { enabled: state.enabled };
      else if (endpoint.endsWith('/request') && endpoint.startsWith('/auth/email/')) {
        state.requests.push({ endpoint, body: req.postDataJSON() });
        body = { challengeId: 'a'.repeat(64), expiresIn: 300, retryAfter: 60 };
      } else if (endpoint.endsWith('/verify') && endpoint.startsWith('/auth/email/')) {
        const data = req.postDataJSON();
        if (data.code !== '123456') { status = 400; body = { message: '인증코드가 올바르지 않습니다.' }; }
        else {
          state.loggedIn = true;
          if (endpoint === '/auth/email/link/verify') state.user.loginEmail = data.email;
          body = { message: '인증되었습니다.' };
        }
      } else if (endpoint === '/auth/email/link' && req.method() === 'DELETE') {
        state.user.loginEmail = null; body = { message: '해제되었습니다.' };
      } else if (endpoint.startsWith('/auth/client/')) body = { clientId: 'demo', clientName: '연동 서비스' };
      else body = [];
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    return { ctx, state, page: await ctx.newPage() };
  }

  const first = await context();
  await first.page.goto(origin + '/login?redirect=%2Fprofile');
  await first.page.getByLabel('이메일', { exact: true }).fill('member@example.test');
  await first.page.getByRole('button', { name: '인증코드 받기', exact: true }).click();
  const code = first.page.getByLabel('6자리 인증코드');
  await code.fill('000000');
  await first.page.getByRole('button', { name: '이메일로 로그인', exact: true }).click();
  await first.page.getByText('인증코드가 올바르지 않습니다.', { exact: true }).waitFor();
  assert.match(await first.page.getByText('인증코드가 올바르지 않습니다.', { exact: true }).innerText(), /올바르지/);
  await code.fill('123456');
  await first.page.getByRole('button', { name: '이메일로 로그인', exact: true }).click();
  await first.page.waitForURL(origin + '/profile');
  assert.equal(first.state.requests[0].body.email, 'member@example.test');
  console.log('Browser: request, wrong-code error, verification, auth refresh, and return to profile passed.');

  const form = first.page.locator('form').filter({ has: first.page.getByRole('button', { name: '인증코드 받기', exact: true }) });
  await form.getByLabel('이메일', { exact: true }).fill('linked@example.test');
  await form.getByRole('button', { name: '인증코드 받기', exact: true }).click();
  await first.page.getByLabel('6자리 인증코드').fill('123456');
  await first.page.getByRole('button', { name: '인증하고 연결하기', exact: true }).click();
  await first.page.getByText('이메일 로그인이 연결되었습니다.', { exact: true }).waitFor();
  assert.equal(first.state.user.loginEmail, 'linked@example.test');
  await first.page.getByRole('button', { name: '이메일 변경', exact: true }).click();
  const changeForm = first.page.locator('form').filter({ has: first.page.getByRole('button', { name: '인증코드 받기', exact: true }) });
  await changeForm.getByLabel('이메일', { exact: true }).fill('changed@example.test');
  await changeForm.getByRole('button', { name: '인증코드 받기', exact: true }).click();
  await first.page.getByLabel('6자리 인증코드').fill('123456');
  await first.page.getByRole('button', { name: '인증하고 연결하기', exact: true }).click();
  await first.page.getByText('이메일 로그인이 연결되었습니다.', { exact: true }).waitFor();
  assert.equal(first.state.user.loginEmail, 'changed@example.test');
  first.page.once('dialog', dialog => dialog.accept());
  await first.page.getByRole('button', { name: '연결 해제', exact: true }).click();
  await first.page.getByText('이메일 로그인 연결을 해제했습니다.', { exact: true }).waitFor();
  assert.equal(first.state.user.loginEmail, null);
  await first.ctx.close();
  console.log('Browser: profile email enrollment, replacement, and unlink passed.');

  const signup = await context({ user: { ...account, name: '', nickname: '' } });
  const params = new URLSearchParams({ client_id: 'demo', redirect_uri: 'https://client.example/callback', scope: 'openid profile', state: 'preserve-me' });
  await signup.page.goto(origin + '/login?' + params);
  await signup.page.getByLabel('이메일', { exact: true }).fill('new@example.test');
  await signup.page.getByRole('button', { name: '인증코드 받기', exact: true }).click();
  await signup.page.getByLabel('6자리 인증코드').fill('123456');
  await signup.page.getByRole('button', { name: '이메일로 로그인', exact: true }).click();
  await signup.page.waitForURL(url => url.pathname === '/register');
  const destination = new URL(signup.page.url());
  for (const [name, value] of params) assert.equal(destination.searchParams.get(name), value);
  await signup.ctx.close();
  console.log('Browser: new signup preserves all SSO parameters during profile completion.');

  const disabled = await context({ enabled: false });
  await disabled.page.goto(origin + '/login');
  await disabled.page.getByText('현재 이메일 인증을 사용할 수 없습니다. 다른 로그인 수단을 이용해주세요.').waitFor();
  assert.equal(await disabled.page.getByRole('button', { name: 'Google로 시작하기' }).count(), 1);
  await disabled.ctx.close();
  console.log('Browser: disabled configuration leaves social login available. All UI checks passed.');
} finally {
  await browser?.close();
  if (server?.pid && server.exitCode === null) {
    process.kill(-server.pid, 'SIGTERM');
    await new Promise(resolve => server.once('exit', resolve));
  }
  if (path.dirname(sandbox) === root && path.basename(sandbox).startsWith('.verify-email-ui-')) {
    rmSync(sandbox, { recursive: true, force: true });
  }
}
