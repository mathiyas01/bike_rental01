import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { createApp } from '../src/app.js';
import { JwtService } from '../src/auth/jwt.service.js';
import { parseEnvironment } from '../src/config/env.js';
import { initializeFirebase } from '../src/config/firebase.js';
import { RentalService } from '../src/rental/rental.service.js';
import { addDays } from '../src/shared/dates.js';

const config = parseEnvironment({
  NODE_ENV: 'test',
  FIREBASE_PROJECT_ID: 'bike-rental-test',
  JWT_SECRET: 'local-test-secret-with-at-least-32-bytes',
  BCRYPT_ROUNDS: '4',
  ...(process.env.FIRESTORE_EMULATOR_HOST
    ? { FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST }
    : {}),
});

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

async function request(
  app: ReturnType<typeof createApp>,
  path: string,
  token?: string,
  init?: RequestInit,
): Promise<{ status: number; body: Record<string, unknown> | unknown[] }> {
  const server = app.listen(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : {} };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function ownerToken(firestore: FirebaseFirestore.Firestore): Promise<string> {
  const now = new Date();
  const user = {
    id: randomUUID(),
    email: 'rental-test-owner@example.com',
    emailNormalized: 'rental-test-owner@example.com',
    fullName: 'Rental Test Owner',
    role: 'ROLE_OWNER',
    preferredLanguage: 'en',
    preferredCurrency: 'RON',
    isActive: true,
    authVersion: 0,
    createdAt: now,
    updatedAt: now,
  };
  await firestore.collection('app_users').doc(user.id).set(user);
  return new JwtService(config).issue(user);
}

test('rental and charge workflows preserve Java behavior', async (context) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST ||
      !await reachable(process.env.FIRESTORE_EMULATOR_HOST)) {
    context.skip('Run with the Firestore emulator');
    return;
  }
  const { firestore } = initializeFirebase(config);
  for (const collection of [
    'app_users', 'unique_keys', 'customers', 'bikes', 'rentals',
    'rental_charges', 'active_rental_locks', 'rental_charge_cursors',
    'payment_allocations',
  ]) {
    await firestore.recursiveDelete(firestore.collection(collection));
  }
  const app = createApp(config, firestore);

  const token = await ownerToken(firestore);
  const protectedRoutes = [
    '/api/v1/rentals',
    '/api/v1/rentals/not-a-uuid',
    '/api/v1/rental-charges/rental/not-a-uuid',
    '/api/v1/rental-charges/due',
    '/api/v1/rental-charges',
  ];
  for (const path of protectedRoutes) {
    const unauthenticated = await request(app, path);
    assert.equal(unauthenticated.status, 401);
  }
  const malformedRentalId = await request(app, '/api/v1/rentals/not-a-uuid', token);
  assert.equal(malformedRentalId.status, 400);
  const unsupportedSort = await request(app, '/api/v1/rentals?sort=weeklyRate,DESC', token);
  assert.equal(unsupportedSort.status, 400);

  const customerId = randomUUID();
  const bikeId = randomUUID();
  const replacementBikeId = randomUUID();
  const secondBikeId = randomUUID();
  const archivedCustomerId = randomUUID();
  const archivedBikeId = randomUUID();
  const unavailableBikeId = randomUUID();
  const now = new Date();
  await firestore.collection('customers').doc(customerId).set({
    fullName: 'Customer One',
    phone: '0700000000',
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  });
  await firestore.collection('bikes').doc(bikeId).set({
    registrationNumber: 'B-001',
    vin: 'VIN-001',
    make: 'Honda',
    model: 'CB',
    status: 'AVAILABLE',
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  });
  await firestore.collection('bikes').doc(replacementBikeId).set({
    registrationNumber: 'B-002',
    vin: 'VIN-002',
    make: 'Yamaha',
    model: 'MT',
    status: 'AVAILABLE',
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  });
  await firestore.collection('bikes').doc(secondBikeId).set({
    registrationNumber: 'B-003',
    vin: 'VIN-003',
    make: 'Suzuki',
    model: 'GS',
    status: 'AVAILABLE',
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  });
  await firestore.collection('customers').doc(archivedCustomerId).set({
    fullName: 'Archived Customer',
    phone: '0700000001',
    isArchived: true,
    createdAt: now,
    updatedAt: now,
  });
  await firestore.collection('bikes').doc(archivedBikeId).set({
    registrationNumber: 'B-004',
    vin: 'VIN-004',
    make: 'Honda',
    model: 'CB',
    status: 'AVAILABLE',
    isArchived: true,
    createdAt: now,
    updatedAt: now,
  });
  await firestore.collection('bikes').doc(unavailableBikeId).set({
    registrationNumber: 'B-005',
    vin: 'VIN-005',
    make: 'Honda',
    model: 'CB',
    status: 'RENTED',
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  });

  const createBody = {
    customerId,
    motorbikeId: bikeId,
    startDate: '2026-01-01',
    plannedEndDate: '2026-03-01',
    weeklyRate: 125.5,
    currency: 'RON',
    depositAmount: 50,
    termsAndNotes: 'Contract',
  };
  // Java createRental allows plannedEndDate < startDate (validation applies only on updateRental)
  const createWithEarlierPlannedEnd = await request(app, '/api/v1/rentals', token, {
    method: 'POST',
    body: JSON.stringify({ ...createBody, plannedEndDate: '2025-12-31' }),
  });
  assert.equal(createWithEarlierPlannedEnd.status, 201);
  const tempRentalId = String((createWithEarlierPlannedEnd.body as Record<string, unknown>).id);
  assert.equal(
    (await request(app, `/api/v1/rentals/${tempRentalId}/close`, token, {
      method: 'POST',
      body: JSON.stringify({ closureDate: '2026-01-01' }),
    })).status,
    200,
  );
  // Restore bike status/clean up temp charges so subsequent rental tests run from clean state
  await firestore.collection('rental_charges').doc(`${tempRentalId}_1`).delete();
  await firestore.collection('rental_charge_cursors').doc(tempRentalId).delete();
  await firestore.collection('rentals').doc(tempRentalId).delete();
  const archivedCustomer = await request(app, '/api/v1/rentals', token, {
    method: 'POST',
    body: JSON.stringify({ ...createBody, customerId: archivedCustomerId }),
  });
  assert.equal(archivedCustomer.status, 400);
  const archivedBike = await request(app, '/api/v1/rentals', token, {
    method: 'POST',
    body: JSON.stringify({ ...createBody, motorbikeId: archivedBikeId }),
  });
  assert.equal(archivedBike.status, 400);
  const unavailableBike = await request(app, '/api/v1/rentals', token, {
    method: 'POST',
    body: JSON.stringify({ ...createBody, motorbikeId: unavailableBikeId }),
  });
  assert.equal(unavailableBike.status, 409);
  const creates = await Promise.all([
    request(app, '/api/v1/rentals', token, { method: 'POST', body: JSON.stringify(createBody) }),
    request(app, '/api/v1/rentals', token, { method: 'POST', body: JSON.stringify(createBody) }),
  ]);
  assert.deepEqual(creates.map((result) => result.status).sort(), [201, 409]);
  const created = creates.find((result) => result.status === 201)!;
  const rental = created.body as Record<string, unknown>;
  const rentalId = String(rental.id);
  assert.equal(rental.weeklyRate, 125.5);
  assert.equal(rental.depositAmount, 50);

  const storedBike = await firestore.collection('bikes').doc(bikeId).get();
  assert.equal(storedBike.data()?.status, 'RENTED');
  assert.equal((await firestore.collection('rentals').get()).size, 1);
  assert.equal((await firestore.collection('rental_charges').get()).size, 1);
  const rentalDetails = await request(app, `/api/v1/rentals/${rentalId}`, token);
  assert.equal(rentalDetails.status, 200);
  assert.deepEqual(Object.keys(rentalDetails.body as Record<string, unknown>).sort(), [
    'actualClosedDate', 'bikeId', 'bikeMakeModel', 'bikeRegistrationNumber',
    'createdAt', 'currency', 'customerId', 'customerName', 'customerPhone',
    'depositAmount', 'depositCurrency', 'id', 'paymentFrequency',
    'plannedEndDate', 'scheduleAnchorDay', 'startDate', 'status',
    'termsAndNotes', 'weeklyRate',
  ]);

  const charges = await request(app, `/api/v1/rental-charges/rental/${rentalId}`, token);
  assert.equal(charges.status, 200);
  assert.equal((charges.body as unknown[]).length, 1);
  assert.deepEqual((charges.body as Record<string, unknown>[])[0], {
    id: `${rentalId}_1`,
    rentalId,
    chargeSequence: 1,
    periodStartDate: '2026-01-01',
    periodEndDate: '2026-01-07',
    dueDate: '2026-01-01',
    amount: 125.5,
    currency: 'RON',
    status: 'UNPAID',
    paidAmount: 0,
    remainingAmount: 125.5,
    notes: 'Initial weekly charge on contract start',
    createdAt: (charges.body as Record<string, unknown>[])[0]!.createdAt,
  });

  const duplicateGeneration = await Promise.all([
    request(app, `/api/v1/rental-charges/rental/${rentalId}/generate-next`, token, { method: 'POST' }),
    request(app, `/api/v1/rental-charges/rental/${rentalId}/generate-next`, token, { method: 'POST' }),
  ]);
  assert.deepEqual(duplicateGeneration.map((result) => result.status).sort(), [201, 201]);
  assert.deepEqual(
    duplicateGeneration.map((result) => Number((result.body as Record<string, unknown>).chargeSequence)).sort((a, b) => a - b),
    [2, 3],
  );
  const nextCharges = duplicateGeneration.map((result) => result.body as Record<string, unknown>)
    .sort((a, b) => Number(a.chargeSequence) - Number(b.chargeSequence));
  assert.deepEqual(nextCharges.map((charge) => [charge.periodStartDate, charge.periodEndDate]), [
    ['2026-01-08', '2026-01-14'],
    ['2026-01-15', '2026-01-21'],
  ]);

  const generated = await request(
    app,
    `/api/v1/rental-charges/rental/${rentalId}/generate-up-to-date?targetDate=2026-01-20`,
    token,
    { method: 'POST' },
  );
  assert.equal(generated.status, 201);
  assert.equal((generated.body as unknown[]).length, 0);

  const list = await request(app, '/api/v1/rentals?page=0&size=20&sort=startDate,DESC', token);
  assert.equal(list.status, 200);
  assert.equal((list.body as Record<string, unknown>).totalElements, 1);
  const due = await request(app, '/api/v1/rental-charges/due?asOfDate=2026-01-20', token);
  assert.equal(due.status, 200);
  const chargeList = await request(app, '/api/v1/rental-charges?sort=dueDate,ASC', token);
  assert.equal(chargeList.status, 200);
  const chargeContent = (chargeList.body as Record<string, unknown>).content as Record<string, unknown>[];
  assert.deepEqual(Object.keys(chargeContent[0]!).sort(), [
    'amount', 'chargeSequence', 'createdAt', 'currency', 'dueDate', 'id',
    'notes', 'paidAmount', 'periodEndDate', 'periodStartDate', 'remainingAmount',
    'rentalId', 'status',
  ]);

  const updateBody = {
    ...createBody,
    motorbikeId: replacementBikeId,
    startDate: '2026-01-02',
    weeklyRate: 130,
    currency: 'EUR',
    depositCurrency: 'EUR',
    termsAndNotes: 'Updated',
  };
  await firestore.collection('active_rental_locks').doc(bikeId).delete();
  const missingLock = await request(app, `/api/v1/rentals/${rentalId}`, token, {
    method: 'PUT',
    body: JSON.stringify(updateBody),
  });
  assert.equal(missingLock.status, 409);

  // Update validation must still reject plannedEndDate < startDate
  const invalidUpdateDates = await request(app, `/api/v1/rentals/${rentalId}`, token, {
    method: 'PUT',
    body: JSON.stringify({ ...updateBody, plannedEndDate: '2026-01-01' }),
  });
  assert.equal(invalidUpdateDates.status, 400);
  assert.equal((await firestore.collection('rentals').doc(rentalId).get()).data()?.bikeId, bikeId);
  await firestore.collection('active_rental_locks').doc(bikeId).set({
    rentalId,
    status: 'ACTIVE',
    version: 1,
  });
  await firestore.collection('active_rental_locks').doc(bikeId).update({ rentalId: randomUUID() });
  const wrongOwner = await request(app, `/api/v1/rentals/${rentalId}`, token, {
    method: 'PUT',
    body: JSON.stringify(updateBody),
  });
  assert.equal(wrongOwner.status, 409);
  assert.equal((await firestore.collection('bikes').doc(bikeId).get()).data()?.status, 'RENTED');
  await firestore.collection('active_rental_locks').doc(bikeId).update({ rentalId });

  const secondRentalResponse = await request(app, '/api/v1/rentals', token, {
    method: 'POST',
    body: JSON.stringify({
      ...createBody,
      motorbikeId: secondBikeId,
      depositAmount: '',
      depositCurrency: '',
    }),
  });
  assert.equal(secondRentalResponse.status, 201);
  assert.equal((secondRentalResponse.body as Record<string, unknown>).depositAmount, 0);
  assert.equal((secondRentalResponse.body as Record<string, unknown>).depositCurrency, 'RON');
  const secondRentalId = String((secondRentalResponse.body as Record<string, unknown>).id);
  const updates = await Promise.all([
    request(app, `/api/v1/rentals/${rentalId}`, token, { method: 'PUT', body: JSON.stringify(updateBody) }),
    request(app, `/api/v1/rentals/${secondRentalId}`, token, {
      method: 'PUT',
      body: JSON.stringify({ ...updateBody, motorbikeId: replacementBikeId }),
    }),
  ]);
  assert.deepEqual(updates.map((result) => result.status).sort(), [200, 409]);
  const updated = updates.find((result) => result.status === 200)!;
  const winnerRentalId = updates[0]!.status === 200 ? rentalId : secondRentalId;
  assert.equal((updated.body as Record<string, unknown>).bikeId, replacementBikeId);
  assert.equal((await firestore.collection('bikes').doc(bikeId).get()).data()?.status,
    winnerRentalId === rentalId ? 'AVAILABLE' : 'RENTED');
  assert.equal((await firestore.collection('bikes').doc(replacementBikeId).get()).data()?.status, 'RENTED');
  const winnerCharges = await request(
    app,
    `/api/v1/rental-charges/rental/${winnerRentalId}/generate-up-to-date?targetDate=2026-01-20`,
    token,
    { method: 'POST' },
  );
  assert.equal(winnerCharges.status, 201);

  const closed = await request(app, `/api/v1/rentals/${winnerRentalId}/close`, token, {
    method: 'POST',
    body: JSON.stringify({ closureDate: '2026-01-20', notes: 'Returned' }),
  });
  assert.equal(closed.status, 200);
  assert.match(String((closed.body as Record<string, unknown>).termsAndNotes), /\[Closed on 2026-01-20\]: Returned/);
  assert.equal((await firestore.collection('bikes').doc(replacementBikeId).get()).data()?.status, 'AVAILABLE');

  const afterClose = await request(
    app,
    `/api/v1/rental-charges/rental/${winnerRentalId}/generate-next`,
    token,
    { method: 'POST' },
  );
  assert.equal(afterClose.status, 400);

  // Strategy 2A: rentalId-scoped pageCharges supports all filter/sort combos up to 1,000 docs and rejects >1,000 with 422
  const bulkRentalId = randomUUID();
  const bulkCustomerId = customerId;
  const nowTs = Timestamp.now();
  for (let batchStart = 1; batchStart <= 1000; batchStart += 500) {
    const batch = firestore.batch();
    for (let seq = batchStart; seq < batchStart + 500; seq += 1) {
      batch.set(firestore.collection('rental_charges').doc(`${bulkRentalId}_${seq}`), {
        rentalId: bulkRentalId,
        customerId: bulkCustomerId,
        bikeId,
        chargeSequence: seq,
        periodStartDate: '2026-01-01',
        periodEndDate: '2026-01-07',
        dueDate: seq === 1000 ? '2026-02-01' : '2026-01-01',
        amount: '100.00',
        currency: 'RON',
        status: seq % 2 === 0 ? 'PAID' : 'UNPAID',
        paidAmount: seq % 2 === 0 ? '100.00' : '0.00',
        remainingAmount: seq % 2 === 0 ? '0.00' : '100.00',
        notes: `Bulk ${seq}`,
        createdAt: new Timestamp(1700000000, seq),
        updatedAt: nowTs,
      });
    }
    await batch.commit();
  }

  const exact1000Res = await request(
    app,
    `/api/v1/rental-charges?rentalId=${bulkRentalId}&status=PAID&currency=RON&customerId=${bulkCustomerId}&sort=chargeSequence,DESC&page=0&size=5`,
    token,
  );
  assert.equal(exact1000Res.status, 200);
  const exact1000Body = exact1000Res.body as Record<string, unknown>;
  assert.equal(exact1000Body.totalElements, 500);
  assert.deepEqual(
    (exact1000Body.content as Array<Record<string, unknown>>).map((c) => c.chargeSequence),
    [1000, 998, 996, 994, 992],
  );

  // Adding 1001st charge triggers explicit 422 overflow on rentalId-scoped pageCharges
  await firestore.collection('rental_charges').doc(`${bulkRentalId}_1001`).set({
    rentalId: bulkRentalId,
    customerId: bulkCustomerId,
    bikeId,
    chargeSequence: 1001,
    periodStartDate: '2026-01-01',
    periodEndDate: '2026-01-07',
    dueDate: '2026-01-01',
    amount: '100.00',
    currency: 'RON',
    status: 'UNPAID',
    paidAmount: '0.00',
    remainingAmount: '100.00',
    notes: 'Bulk 1001',
    createdAt: new Timestamp(1700000000, 1001),
    updatedAt: nowTs,
  });

  const overflowRes = await request(
    app,
    `/api/v1/rental-charges?rentalId=${bulkRentalId}&sort=createdAt,ASC`,
    token,
  );
  assert.equal(overflowRes.status, 422);

  // Without rentalId, existing unbounded pagination still succeeds cleanly across >1,000 charges
  const nonRentalRes = await request(
    app,
    `/api/v1/rental-charges?status=UNPAID&currency=RON&customerId=${bulkCustomerId}&sort=dueDate,ASC&page=0&size=5`,
    token,
  );
  assert.equal(nonRentalRes.status, 200);
  assert.ok(Number((nonRentalRes.body as Record<string, unknown>).totalElements) > 500);
});

test('Stage C8.4.4.1 atomic generateUpToDate handles batching, limits, concurrency, boundaries, and rollback', async (context) => {
  if (!config.firestoreEmulatorHost || !(await reachable(config.firestoreEmulatorHost))) {
    context.skip('FIRESTORE_EMULATOR_HOST not running');
    return;
  }

  const firebase = initializeFirebase(config);
  const firestore = firebase.firestore;
  const app = createApp(config, firestore);

  const token = await ownerToken(firestore);

  const custRes = await request(app, '/api/v1/customers', token, {
    method: 'POST',
    body: JSON.stringify({ fullName: 'Atomic Customer', phone: '+40711000999' }),
  });
  assert.equal(custRes.status, 201);
  const customerId = String((custRes.body as Record<string, unknown>).id);

  async function createBikeAndRental(reg: string, startDate: string): Promise<string> {
    const bikeRes = await request(app, '/api/v1/bikes', token, {
      method: 'POST',
      body: JSON.stringify({
        registrationNumber: reg,
        vin: `VIN-${reg}`,
        make: 'Honda',
        model: 'CBR',
        manufactureYear: 2024,
        weeklyRate: 150,
        currency: 'RON',
      }),
    });
    assert.equal(bikeRes.status, 201);
    const bikeId = String((bikeRes.body as Record<string, unknown>).id);
    const rentalRes = await request(app, '/api/v1/rentals', token, {
      method: 'POST',
      body: JSON.stringify({
        customerId,
        motorbikeId: bikeId,
        startDate,
        weeklyRate: 150,
        currency: 'RON',
        depositAmount: 300,
        depositCurrency: 'RON',
      }),
    });
    assert.equal(rentalRes.status, 201);
    return String((rentalRes.body as Record<string, unknown>).id);
  }

  // 1. Multi-charge atomic generation + cursor verification + no-op retry
  const multiRentalId = await createBikeAndRental('B-8441-MULTI', '2026-01-01');
  // Initial charge #1 covers 2026-01-01..2026-01-07 (cursor at #2 / 2026-01-08).
  // Target 2026-01-29 should generate charges #2 (01-08), #3 (01-15), #4 (01-22), #5 (01-29).
  const multiRes = await request(
    app,
    `/api/v1/rental-charges/rental/${multiRentalId}/generate-up-to-date?targetDate=2026-01-29`,
    token,
    { method: 'POST' },
  );
  assert.equal(multiRes.status, 201);
  const multiBody = multiRes.body as Array<Record<string, unknown>>;
  assert.equal(multiBody.length, 4);
  assert.deepEqual(multiBody.map((c) => c.chargeSequence), [2, 3, 4, 5]);
  assert.deepEqual(multiBody.map((c) => c.periodStartDate), ['2026-01-08', '2026-01-15', '2026-01-22', '2026-01-29']);
  assert.deepEqual(multiBody.map((c) => c.periodEndDate), ['2026-01-14', '2026-01-21', '2026-01-28', '2026-01-29']);
  assert.deepEqual(multiBody.map((c) => c.amount), [150, 150, 150, 21.43]);
  assert.deepEqual(multiBody.map((c) => c.status), ['UNPAID', 'UNPAID', 'UNPAID', 'UNPAID']);

  const multiCursor = await firestore.collection('rental_charge_cursors').doc(multiRentalId).get();
  assert.equal(multiCursor.data()?.nextSequence, 6);
  assert.equal(multiCursor.data()?.nextPeriodStart, '2026-01-30');

  const noopRetry = await request(
    app,
    `/api/v1/rental-charges/rental/${multiRentalId}/generate-up-to-date?targetDate=2026-01-29`,
    token,
    { method: 'POST' },
  );
  assert.equal(noopRetry.status, 201);
  assert.deepEqual(noopRetry.body, []);

  // 2. An outdated cursor must not return an existing charge instead of advancing the schedule.
  await firestore.collection('rental_charge_cursors').doc(multiRentalId).update({
    nextSequence: 2,
    nextPeriodStart: '2026-01-08',
  });
  // Older records can have a due date after the period end.
  await firestore.collection('rental_charges').doc(`${multiRentalId}_5`).update({ dueDate: '2026-02-01' });
  const fallbackRes = await request(
    app,
    `/api/v1/rental-charges/rental/${multiRentalId}/generate-next`,
    token,
    { method: 'POST' },
  );
  assert.equal(fallbackRes.status, 201);
  const fallbackBody = fallbackRes.body as Record<string, unknown>;
  assert.equal(fallbackBody.chargeSequence, 6);
  assert.equal(fallbackBody.periodStartDate, '2026-02-02');
  assert.equal(fallbackBody.periodEndDate, '2026-02-08');
  const restoredCursor = await firestore.collection('rental_charge_cursors').doc(multiRentalId).get();
  assert.equal(restoredCursor.data()?.nextSequence, 7);
  assert.equal(restoredCursor.data()?.nextPeriodStart, '2026-02-09');

  // 3. 500-charge rejection returns 409 with zero new writes and unchanged cursor;
  //    exact 499-charge boundary succeeds in one transaction.
  const boundaryRentalId = await createBikeAndRental('B-8441-BOUND', '2026-01-01');
  // Charge #1 exists (2026-01-01), cursor is at #2 (2026-01-08).
  // 500 new charges = 2026-01-08 + 499 * 7 days.
  const targetFor500 = addDays('2026-01-08', 499 * 7);
  const overLimitRes = await request(
    app,
    `/api/v1/rental-charges/rental/${boundaryRentalId}/generate-up-to-date?targetDate=${targetFor500}`,
    token,
    { method: 'POST' },
  );
  assert.equal(overLimitRes.status, 409);

  const chargesAfter409 = await firestore.collection('rental_charges').where('rentalId', '==', boundaryRentalId).get();
  assert.equal(chargesAfter409.size, 1);
  const cursorAfter409 = await firestore.collection('rental_charge_cursors').doc(boundaryRentalId).get();
  assert.equal(cursorAfter409.data()?.nextSequence, 2);
  assert.equal(cursorAfter409.data()?.nextPeriodStart, '2026-01-08');

  // 499 new charges = 2026-01-08 + 498 * 7 days -> sequences 2..500
  const targetFor499 = addDays('2026-01-08', 498 * 7);
  const exact499Res = await request(
    app,
    `/api/v1/rental-charges/rental/${boundaryRentalId}/generate-up-to-date?targetDate=${targetFor499}`,
    token,
    { method: 'POST' },
  );
  assert.equal(exact499Res.status, 201);
  const exact499Body = exact499Res.body as Array<Record<string, unknown>>;
  assert.equal(exact499Body.length, 499);
  assert.equal(exact499Body[0]!.chargeSequence, 2);
  assert.equal(exact499Body[498]!.chargeSequence, 500);
  const cursorAfter499 = await firestore.collection('rental_charge_cursors').doc(boundaryRentalId).get();
  assert.equal(cursorAfter499.data()?.nextSequence, 501);
  assert.equal(cursorAfter499.data()?.nextPeriodStart, addDays(targetFor499, 1));

  // 4. Concurrent generateUpToDate calls cannot duplicate sequences
  const concurrentRentalId = await createBikeAndRental('B-8441-CONC', '2026-01-01');
  const [concA, concB] = await Promise.all([
    request(app, `/api/v1/rental-charges/rental/${concurrentRentalId}/generate-up-to-date?targetDate=2026-01-22`, token, { method: 'POST' }),
    request(app, `/api/v1/rental-charges/rental/${concurrentRentalId}/generate-up-to-date?targetDate=2026-01-22`, token, { method: 'POST' }),
  ]);
  assert.equal(concA.status, 201);
  assert.equal(concB.status, 201);
  const concTotalCreated = (concA.body as unknown[]).length + (concB.body as unknown[]).length;
  assert.equal(concTotalCreated, 3); // sequences 2, 3, 4 created exactly once across both calls
  const concCharges = await firestore.collection('rental_charges').where('rentalId', '==', concurrentRentalId).get();
  assert.equal(concCharges.size, 4);

  // 5. Closure boundary stops at actualClosedDate and cancellation returns 400 with 0 new writes
  const closedRentalId = await createBikeAndRental('B-8441-CLOSE', '2026-01-01');
  const closeRes = await request(app, `/api/v1/rentals/${closedRentalId}/close`, token, {
    method: 'POST',
    body: JSON.stringify({ closureDate: '2026-01-15' }),
  });
  assert.equal(closeRes.status, 200);
  const closedGenRes = await request(
    app,
    `/api/v1/rental-charges/rental/${closedRentalId}/generate-up-to-date?targetDate=2026-02-01`,
    token,
    { method: 'POST' },
  );
  assert.equal(closedGenRes.status, 201);
  const closedGenBody = closedGenRes.body as Array<Record<string, unknown>>;
  assert.deepEqual(closedGenBody.map((c) => c.chargeSequence), [2, 3]); // 2026-01-08 and 2026-01-15 only

  const cancelRentalId = await createBikeAndRental('B-8441-CANC', '2026-01-01');
  await firestore.collection('rentals').doc(cancelRentalId).update({ status: 'CANCELLED' });
  const cancelGenRes = await request(
    app,
    `/api/v1/rental-charges/rental/${cancelRentalId}/generate-up-to-date?targetDate=2026-01-22`,
    token,
    { method: 'POST' },
  );
  assert.equal(cancelGenRes.status, 400);
  const cancelCharges = await firestore.collection('rental_charges').where('rentalId', '==', cancelRentalId).get();
  assert.equal(cancelCharges.size, 1);

  // 6. Transaction failure mid-flight rolls back all writes and leaves cursor unchanged
  const rollbackRentalId = await createBikeAndRental('B-8441-ROLL', '2026-01-01');
  const failingFirestore = new Proxy(firestore, {
    get(target, prop, receiver) {
      if (prop === 'runTransaction') {
        return async <T>(updateFn: (tx: FirebaseFirestore.Transaction) => Promise<T>): Promise<T> => {
          return target.runTransaction(async (tx) => {
            await updateFn(tx);
            throw new Error('Simulated mid-transaction failure');
          });
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const failingService = new RentalService(failingFirestore, config);
  await assert.rejects(
    () => failingService.generateUpToDate(rollbackRentalId, '2026-01-29'),
    /Simulated mid-transaction failure/,
  );
  const rollbackCharges = await firestore.collection('rental_charges').where('rentalId', '==', rollbackRentalId).get();
  assert.equal(rollbackCharges.size, 1);
  const rollbackCursor = await firestore.collection('rental_charge_cursors').doc(rollbackRentalId).get();
  assert.equal(rollbackCursor.data()?.nextSequence, 2);
  assert.equal(rollbackCursor.data()?.nextPeriodStart, '2026-01-08');
});
