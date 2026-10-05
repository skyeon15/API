// Real HTTP authentication and generated PostgreSQL queries over CTE fixtures.
// Database access is read-only; the CTEs shadow all member tables used here.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Client } from 'pg';
import request from 'supertest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const output = mkdtempSync(path.join(root, '.verify-sso-members-'));
const db = new Client({
  host: process.env.MEMBERS_TEST_DB_HOST || process.env.API_DB_HOST,
  port: Number(process.env.API_DB_PORT || 5432),
  database: process.env.API_DB_NAME,
  user: process.env.API_DB_USER,
  password: process.env.API_DB_PASSWORD,
  connectionTimeoutMillis: 5000,
  options: '-c default_transaction_read_only=on -c statement_timeout=5000',
});
const fixtures = `WITH users AS (
  SELECT 'a-' || n::text AS id, '회원 ' || n::text AS name,
    'member' || n::text || '@example.test' AS email,
    '0100000' || lpad(n::text, 4, '0') AS phone, 'ACTIVE' AS status,
    timestamptz '2026-01-01 00:00:00+00' AS "createdAt"
  FROM generate_series(1, 35) n
  UNION ALL SELECT 'hidden', 'Hidden Name', 'hidden@example.test', '01099999999', 'ACTIVE', timestamptz '2025-01-01'
  UNION ALL SELECT 'b', 'Other service', 'other@example.test', '01088888888', 'ACTIVE', timestamptz '2025-01-01'
  UNION ALL SELECT 'revoked', 'Revoked Name', 'revoked@example.test', '01077777777', 'ACTIVE', timestamptz '2025-01-01'
), oauth_grants AS (
  SELECT 'grant-' || n::text AS id, 'a-' || n::text AS "userId", 'store-a' AS "clientId",
    'openid,profile,email,phone' AS "grantedScopes", 'ACTIVE' AS status,
    timestamptz '2026-01-02 00:00:00+00' + n * interval '1 hour' AS "createdAt"
  FROM generate_series(1, 35) n
  UNION ALL SELECT 'grant-hidden', 'hidden', 'store-a', 'openid', 'ACTIVE', timestamptz '2026-02-01'
  UNION ALL SELECT 'grant-b', 'b', 'store-b', 'openid,profile,email,phone', 'ACTIVE', timestamptz '2026-02-01'
  UNION ALL SELECT 'grant-revoked', 'revoked', 'store-a', 'openid,profile,email,phone', 'REVOKED', timestamptz '2026-02-01'
) `;
let app;
let queryCount = 0;
try {
  execFileSync(process.execPath, [require.resolve('typescript/lib/tsc.js'), '-p',
    'apps/api/tsconfig.build.json', '--outDir', output, '--incremental', 'false'],
  { cwd: root, stdio: 'inherit' });
  writeFileSync(path.join(output, 'package.json'), JSON.stringify({ type: 'module' }));
  const compiled = file => import(pathToFileURL(path.join(output, file)).href);
  const { SsoMembersController } = await compiled('auth/sso-members.controller.js');
  const { OauthClient } = await compiled('auth/entities/oauth-client.entity.js');
  const { OauthGrant } = await compiled('auth/entities/oauth-grant.entity.js');
  const { User } = await compiled('users/entities/user.entity.js');
  const source = new DataSource({ type: 'postgres', entities: [User, OauthClient, OauthGrant] });
  await source.buildMetadatas();
  await db.connect();
  assert.equal((await db.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only, 'on');
  const execute = async builder => {
    queryCount++;
    const [sql, parameters] = builder.getQueryAndParameters();
    return (await db.query(fixtures + sql, parameters)).rows;
  };
  const clients = [
    { clientId: 'store-a', clientSecret: 'fixture-a-secret' },
    { clientId: 'store-b', clientSecret: 'fixture-b-secret' },
    { clientId: 'empty-secret', clientSecret: '' },
  ];
  const module = await Test.createTestingModule({
    controllers: [SsoMembersController],
    providers: [
      { provide: getRepositoryToken(OauthClient), useValue: {
        findOneBy: async ({ clientId }) => clients.find(client => client.clientId === clientId) ?? null,
      } },
      { provide: getRepositoryToken(OauthGrant), useValue: {
        createQueryBuilder: alias => {
          const builder = source.getRepository(OauthGrant).createQueryBuilder(alias);
          builder.getCount = async () => Number((await execute(builder.clone().select('COUNT(*)', 'count')))[0].count);
          builder.getRawMany = () => execute(builder);
          return builder;
        },
      } },
    ],
  }).compile();
  app = module.createNestApplication();
  await app.init();
  const http = request(app.getHttpServer());
  const auth = (id = 'store-a', secret = 'fixture-a-secret') => `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
  for (const authorization of [undefined, 'Bearer fixture', 'Basic invalid', auth('store-a', 'wrong'), auth('missing', 'secret'), auth('empty-secret', '')]) {
    const call = http.get('/sso/members');
    if (authorization) call.set('Authorization', authorization);
    assert.equal((await call).status, 401);
  }
  assert.equal(queryCount, 0, 'unauthenticated requests must not query members');
  const get = query => http.get('/sso/members').set('Authorization', auth()).query(query);
  const first = await get({});
  assert.equal(first.status, 200);
  assert.equal(first.headers['cache-control'], 'private, no-store');
  assert.equal(first.body.total, 36);
  assert.equal(first.body.items.length, 30);
  assert.equal(first.body.items[0].id, 'hidden');
  assert.equal(first.body.items[0].name, null);
  assert.equal(first.body.items[0].email, null);
  assert.equal(first.body.items[0].phone, null);
  assert.deepEqual(Object.keys(first.body.items[0]).sort(), ['createdAt', 'email', 'firstLoginAt', 'id', 'name', 'phone', 'status']);
  assert.equal(first.body.items[1].id, 'a-35');
  const second = await get({ page: 2 });
  assert.equal(second.body.items.length, 6);
  assert.equal(new Set([...first.body.items, ...second.body.items].map(item => item.id)).size, 36);
  assert.equal((await get({ page: 'Infinity', perPage: '-5' })).body.perPage, 30);
  assert.equal((await get({ page: '999999999', perPage: 1 })).body.page, 36);
  assert.equal((await get({ perPage: 9999 })).body.perPage, 100);
  for (const q of ['Other service', 'Revoked Name', 'Hidden Name', 'hidden@example.test', '01099999999', '%', '_', "' OR 1=1 --"]) {
    const result = await get({ q });
    assert.equal(result.status, 200);
    assert.equal(result.body.total, 0, `search leaked or wildcard expanded: ${q}`);
  }
  const phone = await get({ q: '010-0000-0035' });
  assert.equal(phone.body.total, 1);
  assert.equal(phone.body.items[0].id, 'a-35');
  const email = await get({ q: 'MEMBER35@EXAMPLE.TEST', page: 500 });
  assert.equal(email.body.total, 1);
  assert.equal(email.body.page, 1);
  const other = await http.get('/sso/members').set('Authorization', auth('store-b', 'fixture-b-secret')).query({ clientId: 'store-a' });
  assert.equal(other.body.total, 1);
  assert.equal(other.body.items[0].id, 'b');
  console.log('OK: real HTTP authentication, tenant isolation, revoked consent, scope privacy, literal search, formatted phone search, pagination bounds and no-store; PostgreSQL CTE fixtures only, read-only.');
} finally {
  if (app) await app.close();
  await db.end();
  rmSync(output, { recursive: true, force: true });
}
