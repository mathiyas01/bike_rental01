import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { parseEnvironment } from '../src/config/env.js';
import { initializeFirebase } from '../src/config/firebase.js';

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

  const bootstrap = await request(app, '/api/v1/auth/bootstrap-owner', undefined, {
    method: 'POST',
    body: JSON.stringify({
      email: 'owner@example.com',
      password: 'password123',
      fullName: 'Owner',
    }),
  });
  assert.equal(bootstrap.status, 201);
  const token = String((bootstrap.body as Record<string, unknown>).accessToken);
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
  const invalidDates = await request(app, '/api/v1/rentals', token, {
    method: 'POST',
    body: JSON.stringify({ ...createBody, plannedEndDate: '2025-12-31' }),
  });
  assert.equal(invalidDates.status, 400);
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
    body: JSON.stringify({ ...createBody, motorbikeId: secondBikeId }),
  });
  assert.equal(secondRentalResponse.status, 201);
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
});
