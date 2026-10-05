// Real compiled services and migrations; all PG operations are fixtures.
// --db uses a temporary PostgreSQL schema and never changes customer transactions.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { DataSource } from 'typeorm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const output = mkdtempSync(path.join(root, '.verify-payment-metadata-'));
globalThis.fetch = async () => {
  throw Error('Payment verification must not contact external services');
};
const silent = { log() {}, warn() {}, error() {} };
let db, ds, schema;
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
  const metadata = await compiled('users/payment-metadata.js');
  const { PaymentService } = await compiled('users/payment.service.js');
  const { StripeService } = await compiled('users/stripe.service.js');
  const { AddActualPaymentMethod1791158400000: Migration } = await compiled(
    'migrations/1791158400000-AddActualPaymentMethod.js',
  );
  const approval = {
    mul_no: '99',
    pay_state: '4',
    pay_type: '1',
    card_name: '현대',
    card_quota: '00',
    card_num: 'private-card-number',
    linkkey: 'private-key',
    linkval: 'private-key',
    paymethod_group: '2',
  };
  const rawPayapp = {
    webhooks: [
      approval,
      { ...approval, pay_state: '64', card_name: 'cancel-only-name' },
    ],
  };
  const card = {
    brand: 'visa',
    funding: 'credit',
    installments: null,
    last4: 'private-last4',
  };
  const charge = {
    id: 'ch_fixture',
    payment_intent: 'pi_fixture',
    amount: 1000,
    currency: 'usd',
    paid: true,
    status: 'succeeded',
    receipt_url: 'https://receipt.fixture',
    payment_method_details: { type: 'card', card },
  };
  const pi = {
    id: 'pi_fixture',
    amount: 1000,
    currency: 'usd',
    status: 'succeeded',
    latest_charge: charge,
    metadata: { orderId: 'stripe-order' },
  };
  const expectedCard = { type: 'CARD', cardName: '현대', installmentMonths: 0 };
  const expectedStripe = {
    type: 'CARD',
    cardBrand: 'visa',
    cardType: 'CREDIT',
    installmentMonths: 0,
  };
  assert.deepEqual(
    metadata.approvedPayappMetadata(rawPayapp, '99'),
    expectedCard,
  );
  assert.equal(metadata.approvedPayappMetadata(rawPayapp, 'different'), null);
  assert.equal(
    metadata.approvedPayappMetadata({
      webhooks: [{ ...approval, pay_state: '64' }],
    }),
    null,
  );
  assert.deepEqual(
    metadata.payappPaymentMetadata({
      ...approval,
      paymethod_group: '35',
      card_quota: '03',
    }),
    {
      type: 'EASY_PAY',
      provider: 'PAYCO',
      fundingType: 'CARD',
      cardName: '현대',
      installmentMonths: 3,
    },
  );
  for (const [pay_type, type, provider] of [
    ['2', 'MOBILE'],
    ['6', 'TRANSFER'],
    ['7', 'VIRTUAL_ACCOUNT'],
    ['15', 'EASY_PAY', 'KAKAOPAY'],
    ['16', 'EASY_PAY', 'NAVERPAY'],
    ['23', 'EASY_PAY', 'APPLEPAY'],
  ]) {
    const result = metadata.payappPaymentMetadata({ pay_type });
    assert.equal(result.type, type);
    assert.equal(result.provider, provider);
    assert.equal(result.installmentMonths, undefined);
  }
  assert.equal(
    metadata.payappPaymentMetadata({ pay_type: 'unrecognized' }),
    null,
  );
  assert.deepEqual(metadata.stripeChargeMetadata(charge), expectedStripe);
  const wallet = {
    ...charge,
    payment_method_details: {
      type: 'card',
      card: {
        ...card,
        wallet: { type: 'apple_pay' },
        installments: { plan: { count: 3, interval: 'month' } },
      },
    },
  };
  assert.deepEqual(metadata.stripeChargeMetadata(wallet), {
    type: 'EASY_PAY',
    provider: 'APPLEPAY',
    fundingType: 'CARD',
    cardBrand: 'visa',
    cardType: 'CREDIT',
    installmentMonths: 3,
  });
  const thin = metadata.stripeChargeMetadata({
    ...charge,
    payment_method_details: { type: 'card', card: { brand: 'visa' } },
  });
  assert.equal(
    thin.installmentMonths,
    undefined,
    'missing data is not an installment claim',
  );
  assert.equal(
    metadata.stripeChargeMetadata({ ...charge, status: 'failed', paid: false }),
    null,
  );
  assert.equal(
    JSON.stringify([
      expectedCard,
      metadata.stripeChargeMetadata(wallet),
    ]).includes('private-'),
    false,
  );
  assert.deepEqual(
    metadata.recordedPaymentMetadata({
      provider: 'payapp',
      paidAt: new Date(),
      mulNo: '99',
      amount: 39000,
      currency: 'krw',
      rawResponse: rawPayapp,
    }),
    expectedCard,
  );
  assert.equal(
    metadata.recordedPaymentMetadata({
      provider: 'payapp',
      paidAt: null,
      amount: 39000,
      currency: 'krw',
      rawResponse: rawPayapp,
    }),
    null,
  );
  assert.deepEqual(
    metadata.recordedPaymentMetadata({
      provider: 'stripe',
      paidAt: new Date(),
      stripePaymentIntentId: 'pi_fixture',
      amount: 1000,
      currency: 'usd',
      rawResponse: { paymentIntent: pi },
    }),
    expectedStripe,
  );
  assert.equal(
    metadata.recordedPaymentMetadata({
      provider: 'stripe',
      paidAt: new Date(),
      stripePaymentIntentId: 'other',
      amount: 1000,
      currency: 'usd',
      rawResponse: { paymentIntent: pi },
    }),
    null,
  );

  const rows = new Map();
  let sequence = 0,
    saves = 0,
    updates = 0;
  const repo = {
    create: (data) => ({
      id: `fixture-${++sequence}`,
      provider: 'payapp',
      currency: 'krw',
      paidAt: null,
      cancelledAmount: 0,
      actualPaymentMethod: null,
      rawResponse: null,
      ...data,
    }),
    save: async (tx) => {
      saves++;
      rows.set(tx.id, tx);
      return tx;
    },
    update: async (id, patch) => {
      updates++;
      Object.assign(rows.get(id), patch);
      return { affected: 1 };
    },
    findOneBy: async (where) =>
      [...rows.values()].find((row) =>
        Object.entries(where).every(([key, value]) => row[key] === value),
      ) ?? null,
    findOne: async ({ where }) =>
      [...rows.values()].find((row) =>
        (Array.isArray(where) ? where : [where]).some((clause) =>
          Object.entries(clause).every(([key, value]) => row[key] === value),
        ),
      ) ?? null,
  };
  const payapp = new PaymentService({}, {}, {}, repo, {});
  payapp.logger = silent;
  const tx = repo.create({
    orderId: 'payapp-order',
    mulNo: '99',
    amount: 39000,
    status: 'pending',
    payMethod: 'payapp',
  });
  rows.set(tx.id, tx);
  await payapp.handlePayappWebhook({ ...approval, var1: tx.orderId });
  assert.equal(tx.status, 'paid');
  assert.deepEqual(tx.actualPaymentMethod, expectedCard);
  const paidAt = tx.paidAt;
  await payapp.handlePayappWebhook({
    ...approval,
    var1: tx.orderId,
    pay_state: '70',
    cancelprice: '1000',
    card_quota: '09',
  });
  assert.equal(tx.status, 'partial_cancelled');
  assert.equal(tx.cancelledAmount, 1000);
  assert.deepEqual(tx.actualPaymentMethod, expectedCard);
  await payapp.handlePayappWebhook({
    ...approval,
    var1: tx.orderId,
    pay_state: '70',
    cancelprice: '1000',
  });
  assert.equal(
    tx.cancelledAmount,
    1000,
    'duplicate partial cancellation is not counted again',
  );
  await payapp.handlePayappWebhook({
    ...approval,
    var1: tx.orderId,
    pay_state: '64',
    card_quota: '09',
  });
  assert.equal(tx.status, 'cancelled');
  assert.deepEqual(tx.actualPaymentMethod, expectedCard);
  assert.equal(tx.paidAt, paidAt);
  tx.actualPaymentMethod = null;
  const beforeSaves = saves;
  await payapp.handlePayappWebhook({
    ...approval,
    var1: tx.orderId,
    pay_state: '64',
  });
  assert.deepEqual(tx.actualPaymentMethod, expectedCard);
  assert.equal(saves, beforeSaves, 'duplicate backfill only writes metadata');
  const pending = repo.create({
    orderId: 'pending-order',
    mulNo: '100',
    amount: 1000,
    status: 'pending',
  });
  rows.set(pending.id, pending);
  await payapp.handlePayappWebhook({
    ...approval,
    var1: pending.orderId,
    mul_no: '100',
    pay_state: '1',
  });
  assert.equal(pending.actualPaymentMethod, null);
  payapp.callPayapp = async () => ({
    state: '1',
    mul_no: '101',
    CSTURL: 'https://receipt.fixture',
  });
  const billing = await payapp.chargeCardOnSeller(
    { id: 'owner', name: 'Fixture', phone: '01000000000' },
    { id: 'saved-card', cardName: '현대', billingKey: 'private-billing-key' },
    { id: 'seller', sellerId: 'seller-fixture' },
    { amount: 1000, goodName: 'Fixture' },
  );
  assert.deepEqual(billing.actualPaymentMethod, {
    type: 'CARD',
    cardName: '현대',
  });
  await payapp.handlePayappWebhook({
    ...approval,
    var1: billing.orderId,
    mul_no: '101',
    pay_type: '17',
  });
  assert.deepEqual(
    billing.actualPaymentMethod,
    expectedCard,
    'registered-card notification fills the actual installments',
  );
  payapp.callPayapp = async () => ({
    state: '0',
    errorMessage: 'fixture rejection',
  });
  await assert.rejects(() =>
    payapp.chargeCardOnSeller(
      { id: 'owner' },
      { id: 'saved-card', cardName: '현대', billingKey: 'private' },
      { id: 'seller', sellerId: 'fixture' },
      { amount: 1000, goodName: 'Fixture' },
    ),
  );
  assert.equal(
    [...rows.values()].at(-1).actualPaymentMethod,
    null,
    'failed charge has no approved snapshot',
  );
  console.log(
    'PayApp: approval, historical recovery, duplicate/cancellation preservation, pending/failed rejection and billing snapshots passed',
  );

  let retrieveCalls = 0;
  const dispatched = [];
  const stripe = new StripeService(
    {},
    repo,
    {},
    { dispatch: (row, event) => dispatched.push({ row, event }) },
  );
  stripe.logger = silent;
  stripe._stripe = {
    charges: {
      retrieve: async (id) => {
        assert.equal(id, charge.id);
        retrieveCalls++;
        return charge;
      },
    },
  };
  const stripeTx = repo.create({
    orderId: 'stripe-order',
    stripePaymentIntentId: 'pi_fixture',
    provider: 'stripe',
    amount: 1000,
    currency: 'usd',
    status: 'pending',
    receiptUrl: 'already-present',
  });
  rows.set(stripeTx.id, stripeTx);
  await stripe.syncPaymentIntent(
    { id: 'evt-paid' },
    { ...pi, latest_charge: charge.id },
    'paid',
  );
  assert.equal(stripeTx.status, 'paid');
  assert.deepEqual(stripeTx.actualPaymentMethod, expectedStripe);
  assert.equal(
    retrieveCalls,
    1,
    'known receipt does not suppress method capture',
  );
  const eventCount = stripeTx.rawResponse.events.length;
  stripeTx.actualPaymentMethod = null;
  await stripe.syncPaymentIntent(
    { id: 'evt-paid' },
    { ...pi, latest_charge: charge.id },
    'paid',
  );
  assert.deepEqual(stripeTx.actualPaymentMethod, expectedStripe);
  assert.equal(stripeTx.rawResponse.events.length, eventCount);
  await stripe.syncChargeRefund(
    { id: 'evt-refund' },
    { ...charge, amount_refunded: 1000 },
  );
  assert.equal(stripeTx.status, 'cancelled');
  assert.deepEqual(stripeTx.actualPaymentMethod, expectedStripe);
  await stripe.syncChargeRefund(
    { id: 'evt-refund' },
    { ...charge, amount_refunded: 1000 },
  );
  assert.equal(stripeTx.cancelledAmount, 1000);
  assert.equal(
    dispatched.filter((item) => item.event === 'payment.paid').length,
    1,
  );
  console.log(
    'Stripe: actual Charge capture, receipt-independent lookup, duplicate metadata recovery and refund preservation passed',
  );

  if (process.argv.includes('--db')) {
    const options = {
      host: process.env.PAYMENT_METADATA_TEST_DB_HOST || '127.0.0.1',
      port: Number(process.env.API_DB_PORT || 5432),
      user: process.env.API_DB_USER,
      password: process.env.API_DB_PASSWORD,
      database: process.env.API_DB_NAME,
      connectionTimeoutMillis: 5000,
    };
    db = new pg.Client(options);
    await db.connect();
    schema = `payment_metadata_test_${process.pid}_${Date.now()}`;
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.query(`SET search_path TO "${schema}"`);
    await db.query(`CREATE TABLE payment_transactions (
      id uuid PRIMARY KEY, provider text, "paidAt" timestamptz, "payMethod" text, "mulNo" text, "stripePaymentIntentId" text,
      amount integer, currency text, status text, "cancelledAmount" integer, "rawResponse" jsonb
    )`);
    const ids = [];
    for (let index = 1; index <= 505; index++) {
      const id = `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`;
      ids.push(id);
      await db.query(
        `INSERT INTO payment_transactions VALUES ($1,'payapp',now(),'payapp','99',NULL,39000,'krw','cancelled',39000,$2::jsonb)`,
        [id, JSON.stringify(rawPayapp)],
      );
    }
    await db.query(
      `INSERT INTO payment_transactions VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff','stripe',now(),'stripe',NULL,'pi_fixture',1000,'usd','paid',0,$1::jsonb)`,
      [JSON.stringify({ paymentIntent: pi })],
    );
    await db.query(
      `INSERT INTO payment_transactions VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','payapp',NULL,'payapp','99',NULL,39000,'krw','pending',0,$1::jsonb)`,
      [JSON.stringify(rawPayapp)],
    );
    const before = (
      await db.query('SELECT * FROM payment_transactions ORDER BY id')
    ).rows;
    const { AppDataSource } = await compiled('data-source.js');
    ds = new DataSource({
      ...AppDataSource.options,
      host: options.host,
      port: options.port,
      username: options.user,
      password: options.password,
      database: options.database,
      schema,
      logging: false,
      synchronize: false,
      migrations: [Migration],
      migrationsRun: true,
      installExtensions: false,
      extra: {
        connectionTimeoutMillis: 5000,
        options: `-c search_path=${schema}`,
      },
    });
    await ds.initialize();
    const after = (
      await db.query('SELECT * FROM payment_transactions ORDER BY id')
    ).rows;
    assert.equal(after.length, before.length);
    for (let index = 0; index < before.length; index++) {
      const { actualPaymentMethod, ...original } = after[index];
      assert.deepEqual(
        original,
        before[index],
        'migration changes only metadata, never status, amount, raw evidence or timestamps',
      );
      assert.deepEqual(
        actualPaymentMethod,
        !original.paidAt
          ? null
          : original.provider === 'stripe'
            ? expectedStripe
            : expectedCard,
      );
    }
    const runner = ds.createQueryRunner();
    await runner.connect();
    try {
      await new Migration().up(runner);
    } finally {
      await runner.release();
    }
    assert.deepEqual(
      (await db.query('SELECT * FROM payment_transactions ORDER BY id')).rows,
      after,
      'rerun preserves all snapshots',
    );
    assert.equal(
      (await ds.runMigrations()).length,
      0,
      'startup sees applied migration',
    );
    console.log(
      'PostgreSQL: full entity metadata initialization, automatic migration, 500-row pagination, original data preservation and idempotent backfill passed',
    );
  }
} finally {
  if (ds?.isInitialized) await ds.destroy();
  if (db) {
    if (schema) {
      await db.query('SET search_path TO public');
      await db.query(`DROP SCHEMA "${schema}" CASCADE`);
    }
    await db.end();
  }
  rmSync(output, { recursive: true, force: true });
}
