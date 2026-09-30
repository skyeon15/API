// Compile into an isolated directory and exercise the real HTTP controller and guards.
// Repositories and Stripe are fixtures: no database, network payment or credentials.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const output = mkdtempSync(path.join(root, '.verify-sso-stripe-'));
let app;
try {
  execFileSync(
    process.execPath,
    [
      require.resolve('typescript/lib/tsc.js'),
      '-p',
      'apps/api/tsconfig.build.json',
      '--outDir',
      output,
      '--incremental',
      'false',
    ],
    { cwd: root, stdio: 'inherit' },
  );
  writeFileSync(
    path.join(output, 'package.json'),
    JSON.stringify({ type: 'module' }),
  );
  const compiled = (file) =>
    import(pathToFileURL(path.join(output, file)).href);
  const { SsoStripeController } = await compiled(
    'users/sso-stripe.controller.js',
  );
  const { StripeService } = await compiled('users/stripe.service.js');
  const { User } = await compiled('users/entities/user.entity.js');
  const { PaymentTransaction } = await compiled(
    'users/entities/payment-transaction.entity.js',
  );
  const { ApiKeyOrSessionGuard } = await compiled(
    'common/guards/api-key-or-session.guard.js',
  );
  const buyer = {
    id: 'buyer',
    name: 'Buyer',
    stripeCustomerId: 'cus_existing',
  };
  const calls = [];
  const queries = [];
  const rows = [
    {
      id: 'other-buyer',
      userId: 'other',
      provider: 'stripe',
      externalOrderId: 'store-order',
      status: 'paid',
    },
    {
      id: 'other-provider',
      userId: buyer.id,
      provider: 'payapp',
      externalOrderId: 'store-order',
      status: 'paid',
    },
    {
      id: 'other-order',
      userId: buyer.id,
      provider: 'stripe',
      externalOrderId: 'another-order',
      status: 'paid',
    },
    {
      id: 'own',
      userId: buyer.id,
      provider: 'stripe',
      externalOrderId: 'store-order',
      status: 'pending',
      amount: 5000,
      currency: 'usd',
      rawResponse: { private: true },
      stripePaymentIntentId: 'pi_private',
    },
  ];
  const module = await Test.createTestingModule({
    imports: [JwtModule.register({ secret: 'local-test-only-secret' })],
    controllers: [SsoStripeController],
    providers: [
      {
        provide: getRepositoryToken(User),
        useValue: {
          findOneBy: async ({ id }) => (id === buyer.id ? buyer : null),
        },
      },
      {
        provide: getRepositoryToken(PaymentTransaction),
        useValue: {
          find: async (options) => {
            queries.push(options);
            return rows
              .filter((row) =>
                Object.entries(options.where).every(
                  ([key, value]) => row[key] === value,
                ),
              )
              .map((row) =>
                Object.fromEntries(
                  options.select
                    .filter((key) => key in row)
                    .map((key) => [key, row[key]]),
                ),
              );
          },
        },
      },
      {
        provide: StripeService,
        useValue: {
          createPaymentIntent: async (user, body) => {
            calls.push({ user, body });
            return {
              clientSecret: 'pi_fixture_secret_fixture',
              transactionId: 'own',
              orderId: 'platform-order',
            };
          },
        },
      },
    ],
  }).compile();
  app = module.createNestApplication({ logger: false });
  await app.init();
  const jwt = module.get(JwtService);
  const token = (payload = {}, options = {}) =>
    jwt.sign(
      {
        sub: buyer.id,
        typ: 'sso',
        aud: 'store',
        scope: 'openid payment',
        ...payload,
      },
      { expiresIn: '15m', ...options },
    );
  const valid = token();
  const body = {
    amount: 5000,
    currency: 'usd',
    goodName: 'Tracker strap',
    externalOrderId: 'store-order',
    savePaymentMethod: false,
  };
  const http = request(app.getHttpServer());
  const prepare = (bearer) =>
    http
      .post('/sso/stripe/payment-intent')
      .set('Authorization', `Bearer ${bearer}`)
      .send(body);

  await http.post('/sso/stripe/payment-intent').send(body).expect(401);
  for (const invalid of [
    'service-api-key',
    token({ typ: 'session' }),
    token({}, { expiresIn: -1 }),
    token({ aud: undefined }),
  ]) {
    await prepare(invalid).expect(401);
    await http
      .get('/sso/stripe/transactions?externalOrderId=store-order')
      .set('Authorization', `Bearer ${invalid}`)
      .expect(401);
  }
  await prepare(token({ scope: 'openid profile' })).expect(403);
  await http
    .get('/sso/stripe/transactions?externalOrderId=store-order')
    .set('Authorization', `Bearer ${token({ scope: 'profile' })}`)
    .expect(403);
  assert.equal(calls.length, 0);
  assert.equal(queries.length, 0);
  console.log(
    'PASS: SSO type, audience, expiry and payment scope reject unauthorized requests before payment/query.',
  );

  await http
    .post('/sso/stripe/payment-intent')
    .set('Authorization', `Bearer ${valid}`)
    .send({ ...body, userId: 'other', customerId: 'cus_other' })
    .expect(201);
  assert.equal(calls.length, 1);
  assert.strictEqual(calls[0].user, buyer);
  assert.deepEqual(calls[0].body, body);
  for (const invalid of [
    { amount: 0 },
    { amount: -1 },
    { amount: 1.5 },
    { amount: '5000' },
    { goodName: '' },
    { externalOrderId: '' },
    { currency: 'INVALID' },
    { currency: 123 },
    { savePaymentMethod: true },
  ]) {
    await http
      .post('/sso/stripe/payment-intent')
      .set('Authorization', `Bearer ${valid}`)
      .send({ ...body, ...invalid })
      .expect(400);
  }
  await prepare(token({ sub: 'missing-user' })).expect(404);
  assert.equal(calls.length, 1);
  console.log(
    'PASS: payment remains with the token buyer and existing customer; invalid amounts/fields and card saving are rejected.',
  );

  await http
    .get('/sso/stripe/transactions')
    .set('Authorization', `Bearer ${valid}`)
    .expect(400);
  const found = await http
    .get('/sso/stripe/transactions?externalOrderId=store-order&userId=other')
    .set('Authorization', `Bearer ${valid}`)
    .expect(200);
  assert.deepEqual(found.body, [
    {
      id: 'own',
      provider: 'stripe',
      externalOrderId: 'store-order',
      status: 'pending',
      amount: 5000,
      currency: 'usd',
    },
  ]);
  assert.deepEqual(queries[0].where, {
    userId: buyer.id,
    provider: 'stripe',
    externalOrderId: 'store-order',
  });
  await http
    .get('/sso/stripe/transactions?externalOrderId=store-order')
    .set('Authorization', `Bearer ${token({ sub: 'other' })}`)
    .expect(200)
    .expect((res) => assert.equal(res.body[0].id, 'other-buyer'));
  console.log(
    'PASS: transaction lookup filters buyer, Stripe and order; private provider response and intent ID are omitted.',
  );

  const generalGuard = new ApiKeyOrSessionGuard(new Reflector(), jwt, {
    findOne: async () => null,
  });
  const context = (authorization) => ({
    getHandler: () => () => {},
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization }, cookies: {} }),
    }),
  });
  await assert.rejects(
    generalGuard.canActivate(context(`Bearer ${valid}`)),
    (error) => error.getStatus() === 401,
  );
  assert.equal(
    await generalGuard.canActivate(
      context(`Bearer ${token({ typ: 'session' })}`),
    ),
    true,
  );
  console.log(
    'PASS: platform profile guard still rejects SSO and accepts platform session tokens.',
  );
} finally {
  if (app) await app.close();
  rmSync(output, { recursive: true, force: true });
}
