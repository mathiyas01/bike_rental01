import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { createApp } from '../src/app.js';
import { AuthError } from '../src/auth/errors.js';
import { parseEnvironment } from '../src/config/env.js';
import { initializeFirebase } from '../src/config/firebase.js';
import { PaymentService } from '../src/payment/payment.service.js';

const config = parseEnvironment({
  NODE_ENV: 'test',
  FIREBASE_PROJECT_ID: 'bike-rental-test',
  JWT_SECRET: 'local-test-secret-with-at-least-32-bytes',
  BCRYPT_ROUNDS: '4',
  ...(process.env.FIRESTORE_EMULATOR_HOST
    ? { FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST }
    : {}),
});

const TRACKED_COLLECTIONS = [
  'app_users',
  'unique_keys',
  'customers',
  'bikes',
  'rentals',
  'rental_charges',
  'active_rental_locks',
  'rental_charge_cursors',
  'payments',
  'payment_allocations',
  'payment_reversals',
];

async function reachable(host: string): Promise<boolean> {
  const [hostname, portText] = host.split(':');
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: hostname, port: Number(portText) });
    const finish = (value: boolean) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(500, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

async function clearCollections(firestore: Firestore): Promise<void> {
  for (const collection of TRACKED_COLLECTIONS) {
    await firestore.recursiveDelete(firestore.collection(collection));
  }
}

async function snapshotCounts(firestore: Firestore): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const collection of TRACKED_COLLECTIONS) {
    const snap = await firestore.collection(collection).count().get();
    result[collection] = snap.data().count;
  }
  return result;
}

async function sendRequest(
  app: ReturnType<typeof createApp>,
  path: string,
  method: 'GET' | 'POST' | 'PUT',
  authHeader?: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> | unknown[] }> {
  const server = app.listen(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(authHeader !== undefined ? { Authorization: authHeader } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : {} };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function makeToken(
  userId: string,
  email: string,
  role: string,
  authVersion = 0,
  options?: { secret?: string; expiresInSeconds?: number; iatOffsetSeconds?: number },
): string {
  const nowSec = Math.floor(Date.now() / 1000) + (options?.iatOffsetSeconds ?? 0);
  return jwt.sign(
    {
      sub: email.toLowerCase(),
      userId,
      email,
      role,
      lang: 'en',
      authVersion,
      iat: nowSec,
      exp: nowSec + (options?.expiresInSeconds ?? 3600),
    },
    options?.secret ?? config.jwtSecret,
    { algorithm: 'HS256' },
  );
}

async function seedBaseUser(
  firestore: Firestore,
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    isActive?: boolean;
    authVersion?: number;
    tokenIssuedBefore?: Date;
  },
) {
  const now = new Date();
  await firestore.collection('app_users').doc(user.id).set({
    email: user.email,
    emailNormalized: user.email.toLowerCase(),
    passwordHash: '$2b$04$fakehashforauthintegrationtesting1234567890123456',
    fullName: user.fullName,
    role: user.role,
    preferredLanguage: 'en',
    preferredCurrency: 'RON',
    isActive: user.isActive ?? true,
    authVersion: user.authVersion ?? 0,
    ...(user.tokenIssuedBefore ? { tokenIssuedBefore: Timestamp.fromDate(user.tokenIssuedBefore) } : {}),
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
  });
}

async function seedCustomerAndRentalWithCharges(
  firestore: Firestore,
  options: {
    customerId: string;
    customerName: string;
    rentalId: string;
    currency?: 'RON' | 'EUR' | 'USD';
    charges: Array<{
      sequence: number;
      dueDate: string;
      amount: string;
      status?: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
      paidAmount?: string;
    }>;
  },
) {
  const now = new Date();
  const bikeId = randomUUID();
  const currency = options.currency ?? 'RON';

  await firestore.collection('customers').doc(options.customerId).set({
    fullName: options.customerName,
    phone: '+40700000001',
    isArchived: false,
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
  });

  await firestore.collection('bikes').doc(bikeId).set({
    registrationNumber: `B-${bikeId.slice(0, 5)}`,
    vin: `VIN-${bikeId.slice(0, 8)}`,
    make: 'Honda',
    model: 'PCX 125',
    status: 'RENTED',
    isArchived: false,
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
  });

  await firestore.collection('rentals').doc(options.rentalId).set({
    id: options.rentalId,
    customerId: options.customerId,
    customerName: options.customerName,
    customerPhone: '+40700000001',
    bikeId,
    bikeRegistrationNumber: `B-${bikeId.slice(0, 5)}`,
    bikeMakeModel: 'Honda PCX 125',
    startDate: '2026-10-01',
    plannedEndDate: null,
    actualClosedDate: null,
    weeklyRate: '300.00',
    currency,
    depositAmount: '0.00',
    depositCurrency: currency,
    paymentFrequency: 'WEEKLY',
    scheduleAnchorDay: 'START_DAY',
    status: 'ACTIVE',
    termsAndNotes: null,
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
  });

  for (const ch of options.charges) {
    const docId = `${options.rentalId}_${ch.sequence}`;
    const paidAmount = ch.paidAmount ?? '0.00';
    const remaining = (Number(ch.amount) - Number(paidAmount)).toFixed(2);
    await firestore.collection('rental_charges').doc(docId).set({
      id: docId,
      rentalId: options.rentalId,
      customerId: options.customerId,
      bikeId,
      chargeSequence: ch.sequence,
      periodStartDate: ch.dueDate,
      periodEndDate: ch.dueDate,
      dueDate: ch.dueDate,
      amount: ch.amount,
      currency,
      status: ch.status ?? 'UNPAID',
      paidAmount,
      remainingAmount: remaining,
      notes: `Charge #${ch.sequence}`,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });
  }
}

test('Stage C4 authentication matrix across all 7 payment routes (including ROLE_CUSTOMER allowed)', async (context) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !await reachable(process.env.FIRESTORE_EMULATOR_HOST)) {
    context.skip('Run with the Firestore emulator');
    return;
  }

  const { firestore } = initializeFirebase(config);
  await clearCollections(firestore);
  const app = createApp(config, firestore);

  const ownerId = randomUUID();
  const customerUserId = randomUUID();
  const revokedUserId = randomUUID();
  const deletedUserId = randomUUID();
  const inactiveUserId = randomUUID();
  const customerId = randomUUID();
  const rentalId = randomUUID();

  await seedBaseUser(firestore, { id: ownerId, email: 'owner@test.ro', fullName: 'Test Owner', role: 'ROLE_OWNER' });
  await seedBaseUser(firestore, { id: customerUserId, email: 'cust@test.ro', fullName: 'Customer User', role: 'ROLE_CUSTOMER' });
  await seedBaseUser(firestore, {
    id: revokedUserId,
    email: 'revoked@test.ro',
    fullName: 'Revoked User',
    role: 'ROLE_OWNER',
    authVersion: 2,
    tokenIssuedBefore: new Date(Date.now() + 60_000),
  });
  await seedBaseUser(firestore, {
    id: inactiveUserId,
    email: 'inactive@test.ro',
    fullName: 'Inactive User',
    role: 'ROLE_OWNER',
    isActive: false,
  });

  await seedCustomerAndRentalWithCharges(firestore, {
    customerId,
    customerName: 'Andrei Vasilescu',
    rentalId,
    charges: [{ sequence: 1, dueDate: '2026-10-01', amount: '100.00' }],
  });

  const ownerToken = makeToken(ownerId, 'owner@test.ro', 'ROLE_OWNER');
  const customerToken = makeToken(customerUserId, 'cust@test.ro', 'ROLE_CUSTOMER');
  const expiredToken = makeToken(ownerId, 'owner@test.ro', 'ROLE_OWNER', 0, {
    iatOffsetSeconds: -7200,
    expiresInSeconds: 3600,
  });
  const wrongSecretToken = makeToken(ownerId, 'owner@test.ro', 'ROLE_OWNER', 0, {
    secret: 'wrong-secret-000000000000000000000000',
  });
  const revokedVersionToken = makeToken(revokedUserId, 'revoked@test.ro', 'ROLE_OWNER', 1);
  const revokedIatToken = makeToken(revokedUserId, 'revoked@test.ro', 'ROLE_OWNER', 2, { iatOffsetSeconds: -10 });
  const deletedUserToken = makeToken(deletedUserId, 'deleted@test.ro', 'ROLE_OWNER');
  const inactiveUserToken = makeToken(inactiveUserId, 'inactive@test.ro', 'ROLE_OWNER');

  // Seed one payment via owner to test GET/reverse routes cleanly
  const seedPaymentRes = await sendRequest(app, '/api/v1/payments', 'POST', `Bearer ${ownerToken}`, {
    customerId,
    rentalId,
    paymentDate: '2026-10-02',
    amount: 50,
    currency: 'RON',
    paymentMethod: 'CASH',
  });
  assert.equal(seedPaymentRes.status, 201);
  const seededPaymentId = String((seedPaymentRes.body as Record<string, unknown>).id);

  // Also create a second payment for ROLE_CUSTOMER reversal test
  const secondPaymentRes = await sendRequest(app, '/api/v1/payments', 'POST', `Bearer ${customerToken}`, {
    customerId,
    rentalId,
    paymentDate: '2026-10-03',
    amount: 50,
    currency: 'RON',
    paymentMethod: 'BANK_TRANSFER',
  });
  // ROLE_CUSTOMER is permitted on POST /api/v1/payments (never 403)
  assert.equal(secondPaymentRes.status, 201);
  const customerCreatedPaymentId = String((secondPaymentRes.body as Record<string, unknown>).id);
  assert.equal((secondPaymentRes.body as Record<string, unknown>).recordedByUserName, 'Customer User');

  const routeMatrix: Array<{
    name: string;
    method: 'GET' | 'POST';
    path: string;
    body?: Record<string, unknown>;
    expectedSuccessStatus: number;
  }> = [
    {
      name: 'Route 31 POST /api/v1/payments',
      method: 'POST',
      path: '/api/v1/payments',
      body: {
        customerId,
        paymentDate: '2026-10-05',
        amount: 25,
        currency: 'RON',
        paymentMethod: 'CASH',
      },
      expectedSuccessStatus: 201,
    },
    {
      name: 'Route 32 POST /api/v1/payments/:id/reverse',
      method: 'POST',
      path: `/api/v1/payments/${customerCreatedPaymentId}/reverse`,
      body: { reason: 'Customer canceled transfer' },
      expectedSuccessStatus: 200,
    },
    {
      name: 'Route 33 GET /api/v1/payments/:id',
      method: 'GET',
      path: `/api/v1/payments/${seededPaymentId}`,
      expectedSuccessStatus: 200,
    },
    {
      name: 'Route 34 GET /api/v1/payments',
      method: 'GET',
      path: '/api/v1/payments',
      expectedSuccessStatus: 200,
    },
    {
      name: 'Route 35 GET /api/v1/payments/customer/:customerId',
      method: 'GET',
      path: `/api/v1/payments/customer/${customerId}`,
      expectedSuccessStatus: 200,
    },
    {
      name: 'Route 36 GET /api/v1/payments/rental/:rentalId',
      method: 'GET',
      path: `/api/v1/payments/rental/${rentalId}`,
      expectedSuccessStatus: 200,
    },
    {
      name: 'Route 37 GET /api/v1/payments/balance-summary/:customerId',
      method: 'GET',
      path: `/api/v1/payments/balance-summary/${customerId}`,
      expectedSuccessStatus: 200,
    },
  ];

  const badAuthHeaders = [
    undefined,
    'Basic dXNlcjpwYXNz',
    'Bearer ',
    'Bearer not-a-jwt',
    `Bearer ${wrongSecretToken}`,
    `Bearer ${expiredToken}`,
    `Bearer ${revokedVersionToken}`,
    `Bearer ${revokedIatToken}`,
    `Bearer ${deletedUserToken}`,
    `Bearer ${inactiveUserToken}`,
  ];

  for (const route of routeMatrix) {
    const beforeCounts = await snapshotCounts(firestore);
    for (const badHeader of badAuthHeaders) {
      const res = await sendRequest(app, route.path, route.method, badHeader, route.body);
      assert.equal(res.status, 401, `${route.name} must reject bad auth with 401`);
      const errBody = res.body as Record<string, unknown>;
      assert.equal(errBody.error, 'UNAUTHORIZED');
    }
    const afterCounts = await snapshotCounts(firestore);
    assert.deepEqual(afterCounts, beforeCounts, `${route.name} failed auth must perform zero writes`);

    // Valid ROLE_CUSTOMER token must reach handler without 403 on every route
    const custRes = await sendRequest(
      app,
      route.path,
      route.method,
      `Bearer ${customerToken}`,
      route.body,
    );
    assert.equal(
      custRes.status,
      route.expectedSuccessStatus,
      `${route.name} must allow authenticated ROLE_CUSTOMER`,
    );
  }

  // Stage C3 rental routes must keep owner-only 403 enforcement unchanged
  const rentalForbiddenRes = await sendRequest(app, '/api/v1/rentals', 'GET', `Bearer ${customerToken}`);
  assert.equal(rentalForbiddenRes.status, 403);

  // Direct transaction check: missing or inactive app_users/{id} inside PaymentService throws 401 with zero writes
  const paymentService = new PaymentService(firestore, config);
  const preTxCounts = await snapshotCounts(firestore);
  for (const invalidUser of [
    { id: deletedUserId, email: 'deleted@test.ro', role: 'ROLE_OWNER' },
    { id: inactiveUserId, email: 'inactive@test.ro', role: 'ROLE_OWNER' },
  ]) {
    await assert.rejects(
      () =>
        paymentService.recordPayment(
          {
            customerId,
            paymentDate: '2026-10-06',
            amount: 10,
            currency: 'RON',
            paymentMethod: 'CASH',
          },
          { ...invalidUser, authVersion: 0, issuedAt: Math.floor(Date.now() / 1000) },
        ),
      (err) => err instanceof AuthError && err.status === 401,
    );
    await assert.rejects(
      () =>
        paymentService.reversePayment(
          seededPaymentId,
          { reason: 'Valid reversal reason text' },
          { ...invalidUser, authVersion: 0, issuedAt: Math.floor(Date.now() / 1000) },
        ),
      (err) => err instanceof AuthError && err.status === 401,
    );
  }
  assert.deepEqual(await snapshotCounts(firestore), preTxCounts);
});

test('Stage C4 AUTO_FIFO, MANUAL, money validation, repeated charge allocations, and status-correction writes', async (context) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !await reachable(process.env.FIRESTORE_EMULATOR_HOST)) {
    context.skip('Run with the Firestore emulator');
    return;
  }

  const { firestore } = initializeFirebase(config);
  await clearCollections(firestore);
  const app = createApp(config, firestore);

  const ownerId = randomUUID();
  await seedBaseUser(firestore, { id: ownerId, email: 'owner@test.ro', fullName: 'Owner Audit', role: 'ROLE_OWNER' });
  const token = `Bearer ${makeToken(ownerId, 'owner@test.ro', 'ROLE_OWNER')}`;

  const customerId = randomUUID();
  const rentalA = randomUUID();
  const rentalB = randomUUID();
  const otherCustomerId = randomUUID();
  const otherRentalId = randomUUID();

  await seedCustomerAndRentalWithCharges(firestore, {
    customerId,
    customerName: 'Maria Ionescu',
    rentalId: rentalA,
    currency: 'RON',
    charges: [
      { sequence: 1, dueDate: '2026-10-01', amount: '300.00' },
      { sequence: 2, dueDate: '2026-10-08', amount: '300.00' },
    ],
  });

  await seedCustomerAndRentalWithCharges(firestore, {
    customerId: otherCustomerId,
    customerName: 'Other Customer',
    rentalId: otherRentalId,
    currency: 'EUR',
    charges: [{ sequence: 1, dueDate: '2026-10-01', amount: '100.00' }],
  });

  // Also add an EUR rental for Maria so EUR charge exists
  await seedCustomerAndRentalWithCharges(firestore, {
    customerId,
    customerName: 'Maria Ionescu',
    rentalId: rentalB,
    currency: 'EUR',
    charges: [{ sequence: 1, dueDate: '2026-10-02', amount: '200.00' }],
  });

  // 1. Monetary precision acceptance & rejection via HTTP
  const invalidMoneyPayloads = [
    { amount: '1.000' },
    { amount: 1.005 },
    { amount: '1.005' },
    { amount: 0.005 },
    { amount: '0.005' },
    { amount: 0 },
    { amount: '0.00' },
    { amount: 1e-7 },
    { amount: 'abc' },
    { currency: 'ron' },
    { currency: ' RON ' },
    { paymentMethod: 'CREDIT_CARD' },
  ];

  const countsBeforeInvalid = await snapshotCounts(firestore);
  for (const override of invalidMoneyPayloads) {
    const res = await sendRequest(app, '/api/v1/payments', 'POST', token, {
      customerId,
      paymentDate: '2026-10-10',
      amount: 100,
      currency: 'RON',
      paymentMethod: 'CASH',
      ...override,
    });
    assert.equal(res.status, 400, `Expected 400 for payload override ${JSON.stringify(override)}`);
  }
  assert.deepEqual(await snapshotCounts(firestore), countsBeforeInvalid, 'Invalid inputs must write zero docs');

  // 2. Numeric 1.000 accepted under Rule N & string "250.50" accepted under Rule S (MANUAL with empty/null/absent allocations -> 201)
  for (const variant of [
    { amount: 1.000, manualAllocations: undefined },
    { amount: '250.50', manualAllocations: null },
    { amount: 250.50, manualAllocations: [] },
  ]) {
    const body: Record<string, unknown> = {
      customerId,
      paymentDate: '2026-10-10',
      amount: variant.amount,
      currency: 'USD',
      paymentMethod: 'CASH',
      allocationMode: 'MANUAL',
    };
    if (variant.manualAllocations !== undefined) {
      body.manualAllocations = variant.manualAllocations;
    }
    const res = await sendRequest(app, '/api/v1/payments', 'POST', token, body);
    assert.equal(res.status, 201);
    const dto = res.body as Record<string, unknown>;
    assert.equal(dto.status, 'CONFIRMED');
    assert.deepEqual(dto.allocations, []);
    assert.equal(dto.recordedByUserName, 'Owner Audit');
  }

  // 3. AUTO_FIFO across charges of same customer & currency (skips Maria's EUR charge cleanly)
  const autoFifoRes = await sendRequest(app, '/api/v1/payments', 'POST', token, {
    customerId,
    rentalId: null,
    paymentDate: '2026-10-10',
    amount: 450,
    currency: 'RON',
    paymentMethod: 'CASH',
    referenceNumber: 'REC-FIFO-1',
    allocationMode: 'AUTO_FIFO',
  });
  assert.equal(autoFifoRes.status, 201);
  const autoDto = autoFifoRes.body as Record<string, unknown>;
  assert.equal(autoDto.amount, 450);
  const autoAllocs = autoDto.allocations as Array<Record<string, unknown>>;
  assert.equal(autoAllocs.length, 2);
  assert.equal(autoAllocs[0]?.rentalChargeId, `${rentalA}_1`);
  assert.equal(autoAllocs[0]?.allocatedAmount, 300);
  assert.equal(autoAllocs[1]?.rentalChargeId, `${rentalA}_2`);
  assert.equal(autoAllocs[1]?.allocatedAmount, 150);

  const charge1Snap = await firestore.collection('rental_charges').doc(`${rentalA}_1`).get();
  const charge2Snap = await firestore.collection('rental_charges').doc(`${rentalA}_2`).get();
  assert.equal(charge1Snap.data()?.status, 'PAID');
  assert.equal(charge1Snap.data()?.paidAmount, '300.00');
  assert.equal(charge2Snap.data()?.status, 'PARTIALLY_PAID');
  assert.equal(charge2Snap.data()?.paidAmount, '150.00');
  assert.equal(charge2Snap.data()?.remainingAmount, '150.00');

  // 4. AUTO_FIFO unallocated remainder + unknown allocationMode fallback to AUTO_FIFO
  const excessRes = await sendRequest(app, '/api/v1/payments', 'POST', token, {
    customerId,
    rentalId: rentalA,
    paymentDate: '2026-10-11',
    amount: 200,
    currency: 'RON',
    paymentMethod: 'BANK_TRANSFER',
    allocationMode: 'UNKNOWN_MODE',
  });
  assert.equal(excessRes.status, 201);
  const excessAllocs = (excessRes.body as Record<string, unknown>).allocations as Array<Record<string, unknown>>;
  assert.equal(excessAllocs.length, 1);
  assert.equal(excessAllocs[0]?.allocatedAmount, 150);
  assert.equal((excessRes.body as Record<string, unknown>).amount, 200);

  // 5. AUTO_FIFO stale status-correction write (§2.2 AUTO_FIFO 7a)
  const staleRentalId = randomUUID();
  await seedCustomerAndRentalWithCharges(firestore, {
    customerId: otherCustomerId,
    customerName: 'Other Customer',
    rentalId: staleRentalId,
    currency: 'USD',
    charges: [
      { sequence: 1, dueDate: '2026-10-01', amount: '100.00', status: 'UNPAID', paidAmount: '0.00' },
      { sequence: 2, dueDate: '2026-10-08', amount: '100.00', status: 'UNPAID', paidAmount: '0.00' },
    ],
  });
  // Seed a confirmed prior payment & allocation on staleRentalId_1 while leaving charge doc UNPAID
  const priorPayId = randomUUID();
  await firestore.collection('payments').doc(priorPayId).set({
    id: priorPayId,
    customerId: otherCustomerId,
    customerName: 'Other Customer',
    rentalId: staleRentalId,
    paymentDate: '2026-10-01',
    amount: '100.00',
    currency: 'USD',
    paymentMethod: 'CASH',
    referenceNumber: null,
    notes: null,
    status: 'CONFIRMED',
    recordedByUserId: ownerId,
    recordedByUserName: 'Owner Audit',
    allocationMode: 'MANUAL',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  await firestore.collection('payment_allocations').doc(randomUUID()).set({
    id: 'alloc-prior-stale',
    paymentId: priorPayId,
    rentalChargeId: `${staleRentalId}_1`,
    chargeSequence: 1,
    chargeDueDate: '2026-10-01',
    allocatedAmount: '100.00',
    currency: 'USD',
    allocatedAt: Timestamp.now(),
  });
  const staleFifoRes = await sendRequest(app, '/api/v1/payments', 'POST', token, {
    customerId: otherCustomerId,
    rentalId: staleRentalId,
    paymentDate: '2026-10-09',
    amount: 50,
    currency: 'USD',
    paymentMethod: 'CASH',
  });
  assert.equal(staleFifoRes.status, 201);
  const staleAllocs = (staleFifoRes.body as Record<string, unknown>).allocations as Array<Record<string, unknown>>;
  assert.equal(staleAllocs.length, 1);
  assert.equal(staleAllocs[0]?.rentalChargeId, `${staleRentalId}_2`);
  const healedChargeSnap = await firestore.collection('rental_charges').doc(`${staleRentalId}_1`).get();
  assert.equal(healedChargeSnap.data()?.status, 'PAID');
  assert.equal(healedChargeSnap.data()?.paidAmount, '100.00');

  // 6. MANUAL repeated rentalChargeId validation & success
  const manualOverRepeatCounts = await snapshotCounts(firestore);
  const manualOverRepeatRes = await sendRequest(app, '/api/v1/payments', 'POST', token, {
    customerId,
    paymentDate: '2026-10-12',
    amount: 200,
    currency: 'EUR',
    paymentMethod: 'BANK_TRANSFER',
    allocationMode: 'manual',
    manualAllocations: [
      { rentalChargeId: `${rentalB}_1`, amount: 120 },
      { rentalChargeId: `${rentalB}_1`, amount: 90 },
    ],
  });
  assert.equal(manualOverRepeatRes.status, 400);
  assert.deepEqual(await snapshotCounts(firestore), manualOverRepeatCounts);

  const manualRepeatOkRes = await sendRequest(app, '/api/v1/payments', 'POST', token, {
    customerId,
    paymentDate: '2026-10-12',
    amount: 200,
    currency: 'EUR',
    paymentMethod: 'BANK_TRANSFER',
    allocationMode: 'manual',
    manualAllocations: [
      { rentalChargeId: `${rentalB}_1`, amount: 120 },
      { rentalChargeId: `${rentalB}_1`, amount: 80 },
    ],
  });
  assert.equal(manualRepeatOkRes.status, 201);
  const manualAllocs = (manualRepeatOkRes.body as Record<string, unknown>).allocations as Array<Record<string, unknown>>;
  assert.equal(manualAllocs.length, 2);
  assert.notEqual(manualAllocs[0]?.id, manualAllocs[1]?.id);
  const eurChargeSnap = await firestore.collection('rental_charges').doc(`${rentalB}_1`).get();
  assert.equal(eurChargeSnap.data()?.status, 'PAID');
  assert.equal(eurChargeSnap.data()?.paidAmount, '200.00');

  // 7. Manual business & not-found error cases (zero writes)
  const beforeBizErrors = await snapshotCounts(firestore);
  // Missing customer -> 404
  assert.equal(
    (await sendRequest(app, '/api/v1/payments', 'POST', token, {
      customerId: randomUUID(),
      paymentDate: '2026-10-12',
      amount: 10,
      currency: 'RON',
      paymentMethod: 'CASH',
    })).status,
    404,
  );
  // Missing rental -> 404
  assert.equal(
    (await sendRequest(app, '/api/v1/payments', 'POST', token, {
      customerId,
      rentalId: randomUUID(),
      paymentDate: '2026-10-12',
      amount: 10,
      currency: 'RON',
      paymentMethod: 'CASH',
    })).status,
    404,
  );
  // Rental wrong customer -> 400
  assert.equal(
    (await sendRequest(app, '/api/v1/payments', 'POST', token, {
      customerId,
      rentalId: otherRentalId,
      paymentDate: '2026-10-12',
      amount: 10,
      currency: 'RON',
      paymentMethod: 'CASH',
    })).status,
    400,
  );
  // Missing charge -> 404
  assert.equal(
    (await sendRequest(app, '/api/v1/payments', 'POST', token, {
      customerId,
      paymentDate: '2026-10-12',
      amount: 10,
      currency: 'RON',
      paymentMethod: 'CASH',
      allocationMode: 'MANUAL',
      manualAllocations: [{ rentalChargeId: `${rentalA}_99`, amount: 10 }],
    })).status,
    404,
  );
  // Charge wrong customer -> 400
  assert.equal(
    (await sendRequest(app, '/api/v1/payments', 'POST', token, {
      customerId,
      paymentDate: '2026-10-12',
      amount: 10,
      currency: 'EUR',
      paymentMethod: 'CASH',
      allocationMode: 'MANUAL',
      manualAllocations: [{ rentalChargeId: `${otherRentalId}_1`, amount: 10 }],
    })).status,
    400,
  );
  // Currency mismatch -> 400
  assert.equal(
    (await sendRequest(app, '/api/v1/payments', 'POST', token, {
      customerId: otherCustomerId,
      paymentDate: '2026-10-12',
      amount: 10,
      currency: 'RON',
      paymentMethod: 'CASH',
      allocationMode: 'MANUAL',
      manualAllocations: [{ rentalChargeId: `${otherRentalId}_1`, amount: 10 }],
    })).status,
    400,
  );
  // Total manual > payment amount -> 400
  assert.equal(
    (await sendRequest(app, '/api/v1/payments', 'POST', token, {
      customerId: otherCustomerId,
      paymentDate: '2026-10-12',
      amount: 10,
      currency: 'EUR',
      paymentMethod: 'CASH',
      allocationMode: 'MANUAL',
      manualAllocations: [{ rentalChargeId: `${otherRentalId}_1`, amount: 20 }],
    })).status,
    400,
  );
  // Allocation > charge unpaid balance -> 400
  assert.equal(
    (await sendRequest(app, '/api/v1/payments', 'POST', token, {
      customerId: otherCustomerId,
      paymentDate: '2026-10-12',
      amount: 200,
      currency: 'EUR',
      paymentMethod: 'CASH',
      allocationMode: 'MANUAL',
      manualAllocations: [{ rentalChargeId: `${otherRentalId}_1`, amount: 150 }],
    })).status,
    400,
  );
  assert.deepEqual(await snapshotCounts(firestore), beforeBizErrors);
});

test('Stage C4 reversal (Route 32), search/get/customer/rental/balance-summary (Routes 33-37), and Stage C3 charge parity', async (context) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !await reachable(process.env.FIRESTORE_EMULATOR_HOST)) {
    context.skip('Run with the Firestore emulator');
    return;
  }

  const { firestore } = initializeFirebase(config);
  await clearCollections(firestore);
  const app = createApp(config, firestore);

  const ownerId = randomUUID();
  await seedBaseUser(firestore, { id: ownerId, email: 'owner@test.ro', fullName: 'Reversal Owner', role: 'ROLE_OWNER' });
  const token = `Bearer ${makeToken(ownerId, 'owner@test.ro', 'ROLE_OWNER')}`;

  const customerId = randomUUID();
  const rentalId = randomUUID();
  const eurRentalId = randomUUID();

  await seedCustomerAndRentalWithCharges(firestore, {
    customerId,
    customerName: 'Ion Popescu',
    rentalId,
    currency: 'RON',
    charges: [{ sequence: 1, dueDate: '2026-10-01', amount: '100.00' }],
  });
  await seedCustomerAndRentalWithCharges(firestore, {
    customerId,
    customerName: 'Ion Popescu',
    rentalId: eurRentalId,
    currency: 'EUR',
    charges: [{ sequence: 1, dueDate: '2026-10-05', amount: '200.00' }],
  });

  // Two payments on RON charge: 40 + 60 -> PAID
  const payA = await sendRequest(app, '/api/v1/payments', 'POST', token, {
    customerId,
    rentalId,
    paymentDate: '2026-10-02',
    amount: 40,
    currency: 'RON',
    paymentMethod: 'CASH',
  });
  assert.equal(payA.status, 201);
  const payAId = String((payA.body as Record<string, unknown>).id);

  const payB = await sendRequest(app, '/api/v1/payments', 'POST', token, {
    customerId,
    rentalId,
    paymentDate: '2026-10-03',
    amount: 60,
    currency: 'RON',
    paymentMethod: 'BANK_TRANSFER',
  });
  assert.equal(payB.status, 201);
  const payBId = String((payB.body as Record<string, unknown>).id);

  // Overpayment in USD with 0 USD charges to verify clamping to 0 in balance summary
  const payUsd = await sendRequest(app, '/api/v1/payments', 'POST', token, {
    customerId,
    paymentDate: '2026-10-04',
    amount: 50,
    currency: 'USD',
    paymentMethod: 'CASH',
  });
  assert.equal(payUsd.status, 201);

  // Invalid reversal reason / missing payment
  assert.equal(
    (await sendRequest(app, `/api/v1/payments/${payAId}/reverse`, 'POST', token, { reason: 'no' })).status,
    400,
  );
  assert.equal(
    (await sendRequest(app, `/api/v1/payments/${randomUUID()}/reverse`, 'POST', token, { reason: 'Valid reason' })).status,
    404,
  );

  // Reverse Payment A (40 RON)
  const reverseRes = await sendRequest(app, `/api/v1/payments/${payAId}/reverse`, 'POST', token, {
    reason: 'Duplicate cash entry',
  });
  assert.equal(reverseRes.status, 200);
  const revDto = reverseRes.body as Record<string, unknown>;
  assert.equal(revDto.status, 'REVERSED');
  assert.equal(revDto.reversalReason, 'Duplicate cash entry');
  assert.ok(typeof revDto.reversedAt === 'string');

  // Double reversal -> 400
  assert.equal(
    (await sendRequest(app, `/api/v1/payments/${payAId}/reverse`, 'POST', token, { reason: 'Another try' })).status,
    400,
  );

  // Allocation documents preserved; charge recalculated from Payment B (60 RON) only
  const allocsSnap = await firestore.collection('payment_allocations').where('paymentId', '==', payAId).get();
  assert.equal(allocsSnap.docs.length, 1);
  const ronChargeSnap = await firestore.collection('rental_charges').doc(`${rentalId}_1`).get();
  assert.equal(ronChargeSnap.data()?.status, 'PARTIALLY_PAID');
  assert.equal(ronChargeSnap.data()?.paidAmount, '60.00');
  assert.equal(ronChargeSnap.data()?.remainingAmount, '40.00');

  // Stage C3 charge endpoint reflects 60 paid / 40 remaining (excluding reversed Payment A)
  const c3ChargesRes = await sendRequest(app, `/api/v1/rental-charges/rental/${rentalId}`, 'GET', token);
  assert.equal(c3ChargesRes.status, 200);
  const c3Charges = c3ChargesRes.body as Array<Record<string, unknown>>;
  assert.equal(c3Charges[0]?.paidAmount, 60);
  assert.equal(c3Charges[0]?.remainingAmount, 40);

  // Route 33: GET /api/v1/payments/:id & 404
  const getRes = await sendRequest(app, `/api/v1/payments/${payAId}`, 'GET', token);
  assert.equal(getRes.status, 200);
  assert.equal((getRes.body as Record<string, unknown>).reversalReason, 'Duplicate cash entry');
  assert.equal((await sendRequest(app, `/api/v1/payments/${randomUUID()}`, 'GET', token)).status, 404);

  // Route 35: customer payment list DESC
  const custPayments = (await sendRequest(app, `/api/v1/payments/customer/${customerId}`, 'GET', token)).body as Array<Record<string, unknown>>;
  assert.equal(custPayments.length, 3);
  assert.equal(custPayments[0]?.paymentDate, '2026-10-04');
  assert.equal(custPayments[2]?.id, payAId);
  assert.deepEqual(
    (await sendRequest(app, `/api/v1/payments/customer/${randomUUID()}`, 'GET', token)).body,
    [],
  );

  // Route 36: rental payment list DESC
  const rentalPayments = (await sendRequest(app, `/api/v1/payments/rental/${rentalId}`, 'GET', token)).body as Array<Record<string, unknown>>;
  assert.equal(rentalPayments.length, 2);
  assert.equal(rentalPayments[0]?.id, payBId);
  assert.deepEqual(
    (await sendRequest(app, `/api/v1/payments/rental/${randomUUID()}`, 'GET', token)).body,
    [],
  );

  // Route 37: balance summary isolates RON/EUR/USD and excludes REVERSED payment A (40 RON)
  const summaryRes = await sendRequest(app, `/api/v1/payments/balance-summary/${customerId}`, 'GET', token);
  assert.equal(summaryRes.status, 200);
  const summary = summaryRes.body as Record<string, unknown>;
  assert.equal(summary.customerName, 'Ion Popescu');
  const balances = summary.balances as Record<string, Record<string, unknown>>;
  assert.deepEqual(balances.RON, { currency: 'RON', totalBilled: 100, totalPaid: 60, totalOutstanding: 40 });
  assert.deepEqual(balances.EUR, { currency: 'EUR', totalBilled: 200, totalPaid: 0, totalOutstanding: 200 });
  assert.deepEqual(balances.USD, { currency: 'USD', totalBilled: 0, totalPaid: 50, totalOutstanding: 0 });
  assert.equal((await sendRequest(app, `/api/v1/payments/balance-summary/${randomUUID()}`, 'GET', token)).status, 404);

  // Route 34: multi-page search (> 25 items), filters, case-insensitive sorting, and 400 invalid sort
  for (let i = 1; i <= 25; i += 1) {
    const day = String(i).padStart(2, '0');
    const created = await sendRequest(app, '/api/v1/payments', 'POST', token, {
      customerId,
      paymentDate: `2026-11-${day}`,
      amount: 10 + i,
      currency: 'EUR',
      paymentMethod: 'BANK_TRANSFER',
    });
    assert.equal(created.status, 201);
  }

  const page0 = (await sendRequest(app, '/api/v1/payments?page=0&size=10&sort=paymentDate,desc', 'GET', token)).body as Record<string, unknown>;
  assert.equal((page0.content as unknown[]).length, 10);
  assert.equal(page0.totalElements, 28);
  assert.equal(page0.totalPages, 3);
  assert.equal(page0.last, false);
  assert.equal(((page0.content as Array<Record<string, unknown>>)[0])?.paymentDate, '2026-11-25');

  const page2Asc = (await sendRequest(app, '/api/v1/payments?page=2&size=10&sort=paymentDate,asc', 'GET', token)).body as Record<string, unknown>;
  assert.equal((page2Asc.content as unknown[]).length, 8);
  assert.equal(page2Asc.last, true);

  const filtered = (await sendRequest(
    app,
    `/api/v1/payments?status=CONFIRMED&currency=RON&method=BANK_TRANSFER&customerId=${customerId}&startDate=2026-10-01&endDate=2026-10-05`,
    'GET',
    token,
  )).body as Record<string, unknown>;
  assert.equal(filtered.totalElements, 1);
  assert.equal(((filtered.content as Array<Record<string, unknown>>)[0])?.id, payBId);

  assert.equal((await sendRequest(app, '/api/v1/payments?sort=amount,DESC', 'GET', token)).status, 400);
  assert.equal((await sendRequest(app, '/api/v1/payments?sort=paymentDate,sideways', 'GET', token)).status, 400);
});

test('Stage C4 transaction safeguards (422) and concurrent payment contention', async (context) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !await reachable(process.env.FIRESTORE_EMULATOR_HOST)) {
    context.skip('Run with the Firestore emulator');
    return;
  }

  const { firestore } = initializeFirebase(config);
  await clearCollections(firestore);
  const app = createApp(config, firestore);

  const ownerId = randomUUID();
  await seedBaseUser(firestore, { id: ownerId, email: 'owner@test.ro', fullName: 'Guard Owner', role: 'ROLE_OWNER' });
  const token = `Bearer ${makeToken(ownerId, 'owner@test.ro', 'ROLE_OWNER')}`;

  // 1. Seed 201 unpaid charges for safeguard boundary tests
  const bigCustomerId = randomUUID();
  const bigRentalId = randomUUID();
  const charges = Array.from({ length: 201 }, (_, idx) => ({
    sequence: idx + 1,
    dueDate: `2026-${String(Math.floor(idx / 28) + 1).padStart(2, '0')}-${String((idx % 28) + 1).padStart(2, '0')}`,
    amount: '10.00',
  }));
  await seedCustomerAndRentalWithCharges(firestore, {
    customerId: bigCustomerId,
    customerName: 'Big Customer',
    rentalId: bigRentalId,
    currency: 'RON',
    charges,
  });

  // 201 affected charges in AUTO_FIFO -> 422 with zero writes
  const beforeFifo422 = await snapshotCounts(firestore);
  const fifo422Res = await sendRequest(app, '/api/v1/payments', 'POST', token, {
    customerId: bigCustomerId,
    rentalId: bigRentalId,
    paymentDate: '2026-10-15',
    amount: 2010,
    currency: 'RON',
    paymentMethod: 'CASH',
  });
  assert.equal(fifo422Res.status, 422);
  assert.deepEqual(await snapshotCounts(firestore), beforeFifo422);

  // 201 distinct charges in MANUAL -> 422 with zero writes
  const manual201 = Array.from({ length: 201 }, (_, idx) => ({
    rentalChargeId: `${bigRentalId}_${idx + 1}`,
    amount: 10,
  }));
  const manual422Res = await sendRequest(app, '/api/v1/payments', 'POST', token, {
    customerId: bigCustomerId,
    rentalId: bigRentalId,
    paymentDate: '2026-10-15',
    amount: 2010,
    currency: 'RON',
    paymentMethod: 'CASH',
    allocationMode: 'MANUAL',
    manualAllocations: manual201,
  });
  assert.equal(manual422Res.status, 422);
  assert.deepEqual(await snapshotCounts(firestore), beforeFifo422);

  // Small payment covering only 2 of the 201 charges -> 201 Created cleanly!
  const smallOkRes = await sendRequest(app, '/api/v1/payments', 'POST', token, {
    customerId: bigCustomerId,
    rentalId: bigRentalId,
    paymentDate: '2026-10-15',
    amount: 20,
    currency: 'RON',
    paymentMethod: 'CASH',
  });
  assert.equal(smallOkRes.status, 201);

  // 2. MAX_ALLOCATIONS_PER_CHARGE = 200 overrun test (201 allocations on 1 charge -> 422)
  const heavyCustomerId = randomUUID();
  const heavyRentalId = randomUUID();
  await seedCustomerAndRentalWithCharges(firestore, {
    customerId: heavyCustomerId,
    customerName: 'Heavy Alloc Customer',
    rentalId: heavyRentalId,
    currency: 'RON',
    charges: [{ sequence: 1, dueDate: '2026-10-01', amount: '500.00' }],
  });
  const seedPayId = randomUUID();
  await firestore.collection('payments').doc(seedPayId).set({
    id: seedPayId,
    customerId: heavyCustomerId,
    customerName: 'Heavy Alloc Customer',
    rentalId: heavyRentalId,
    paymentDate: '2026-10-01',
    amount: '201.00',
    currency: 'RON',
    paymentMethod: 'CASH',
    referenceNumber: null,
    notes: null,
    status: 'CONFIRMED',
    recordedByUserId: ownerId,
    recordedByUserName: 'Guard Owner',
    allocationMode: 'MANUAL',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  const batch = firestore.batch();
  for (let i = 1; i <= 201; i += 1) {
    const id = randomUUID();
    batch.set(firestore.collection('payment_allocations').doc(id), {
      id,
      paymentId: seedPayId,
      rentalChargeId: `${heavyRentalId}_1`,
      chargeSequence: 1,
      chargeDueDate: '2026-10-01',
      allocatedAmount: '1.00',
      currency: 'RON',
      allocatedAt: Timestamp.now(),
    });
  }
  await batch.commit();

  const beforeHeavy422 = await snapshotCounts(firestore);
  const createOverAllocLimitRes = await sendRequest(app, '/api/v1/payments', 'POST', token, {
    customerId: heavyCustomerId,
    paymentDate: '2026-10-02',
    amount: 10,
    currency: 'RON',
    paymentMethod: 'CASH',
    allocationMode: 'MANUAL',
    manualAllocations: [{ rentalChargeId: `${heavyRentalId}_1`, amount: 10 }],
  });
  assert.equal(createOverAllocLimitRes.status, 422);

  const reverseOverAllocLimitRes = await sendRequest(
    app,
    `/api/v1/payments/${seedPayId}/reverse`,
    'POST',
    token,
    { reason: 'Exceeds read limit' },
  );
  assert.equal(reverseOverAllocLimitRes.status, 422);
  assert.deepEqual(await snapshotCounts(firestore), beforeHeavy422);

  // 3. Concurrency: two parallel MANUAL 80 RON payments against one 100 RON charge -> one 201, one 400
  const raceCustomerId = randomUUID();
  const raceRentalId = randomUUID();
  await seedCustomerAndRentalWithCharges(firestore, {
    customerId: raceCustomerId,
    customerName: 'Race Customer',
    rentalId: raceRentalId,
    currency: 'RON',
    charges: [{ sequence: 1, dueDate: '2026-10-01', amount: '100.00' }],
  });

  const payload = {
    customerId: raceCustomerId,
    paymentDate: '2026-10-05',
    amount: 80,
    currency: 'RON',
    paymentMethod: 'CASH',
    allocationMode: 'MANUAL',
    manualAllocations: [{ rentalChargeId: `${raceRentalId}_1`, amount: 80 }],
  };
  const [race1, race2] = await Promise.all([
    sendRequest(app, '/api/v1/payments', 'POST', token, payload),
    sendRequest(app, '/api/v1/payments', 'POST', token, payload),
  ]);
  const raceStatuses = [race1.status, race2.status].sort((a, b) => a - b);
  assert.deepEqual(raceStatuses, [201, 400]);

  const raceChargeSnap = await firestore.collection('rental_charges').doc(`${raceRentalId}_1`).get();
  assert.equal(raceChargeSnap.data()?.paidAmount, '80.00');
  assert.equal(raceChargeSnap.data()?.status, 'PARTIALLY_PAID');
});
