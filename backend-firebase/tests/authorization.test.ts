import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
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

async function emulatorIsReachable(host: string): Promise<boolean> {
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

async function sendRequest(
  app: ReturnType<typeof createApp>,
  path: string,
  method: 'GET' | 'POST' | 'PUT',
  authHeader?: string,
  body?: Record<string, unknown>,
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
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : {} };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function snapshotCollections(firestore: Firestore, collections: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const collection of collections) {
    const snapshot = await firestore.collection(collection).count().get();
    counts.set(collection, snapshot.data().count);
  }
  return counts;
}

test('parameterized authorization tests across all ten Stage C3 routes (21-30)', async (context) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST ||
      !await emulatorIsReachable(process.env.FIRESTORE_EMULATOR_HOST)) {
    context.skip('Run with the Firestore emulator');
    return;
  }

  const { firestore } = initializeFirebase(config);
  const trackedCollections = [
    'app_users', 'unique_keys', 'customers', 'bikes', 'rentals',
    'rental_charges', 'active_rental_locks', 'rental_charge_cursors',
    'payment_allocations',
  ];
  for (const collection of trackedCollections) {
    await firestore.recursiveDelete(firestore.collection(collection));
  }

  const app = createApp(config, firestore);

  // 1. Seed users: 1 Owner, 1 Non-Owner (ROLE_CUSTOMER)
  const ownerId = randomUUID();
  const customerUserId = randomUUID();
  const now = new Date();

  await firestore.collection('app_users').doc(ownerId).set({
    email: 'owner@example.com',
    emailNormalized: 'owner@example.com',
    passwordHash: '$2b$04$fakehashforauthintegrationtesting1234567890123456',
    fullName: 'Test Owner',
    role: 'ROLE_OWNER',
    preferredLanguage: 'en',
    preferredCurrency: 'RON',
    isActive: true,
    authVersion: 0,
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
  });

  await firestore.collection('app_users').doc(customerUserId).set({
    email: 'customer-user@example.com',
    emailNormalized: 'customer-user@example.com',
    passwordHash: '$2b$04$fakehashforauthintegrationtesting1234567890123456',
    fullName: 'Test Customer User',
    role: 'ROLE_CUSTOMER',
    preferredLanguage: 'en',
    preferredCurrency: 'RON',
    isActive: true,
    authVersion: 0,
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
  });

  // 2. Seed business domain fixtures
  const customerId = randomUUID();
  const bike1Id = randomUUID();
  const bikeForCreationId = randomUUID();
  const activeRentalId = randomUUID();
  const rentalToCloseId = randomUUID();
  const bike2Id = randomUUID();

  await firestore.collection('customers').doc(customerId).set({
    fullName: 'John Customer',
    phone: '+40712345678',
    isArchived: false,
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
  });

  await firestore.collection('bikes').doc(bike1Id).set({
    registrationNumber: 'B-10-AAA',
    vin: 'VIN12345678901',
    make: 'Honda',
    model: 'PCX 125',
    status: 'RENTED',
    isArchived: false,
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
  });

  await firestore.collection('bikes').doc(bikeForCreationId).set({
    registrationNumber: 'B-20-BBB',
    vin: 'VIN12345678902',
    make: 'Yamaha',
    model: 'NMAX 125',
    status: 'AVAILABLE',
    isArchived: false,
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
  });

  await firestore.collection('bikes').doc(bike2Id).set({
    registrationNumber: 'B-30-CCC',
    vin: 'VIN12345678903',
    make: 'Honda',
    model: 'SH 150',
    status: 'RENTED',
    isArchived: false,
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
  });

  // Seed active rental 1
  await firestore.collection('rentals').doc(activeRentalId).set({
    customerId,
    customerName: 'John Customer',
    customerPhone: '+40712345678',
    bikeId: bike1Id,
    bikeRegistrationNumber: 'B-10-AAA',
    bikeMakeModel: 'Honda PCX 125',
    startDate: '2026-11-01',
    plannedEndDate: null,
    actualClosedDate: null,
    weeklyRate: '150.00',
    currency: 'RON',
    depositAmount: '300.00',
    depositCurrency: 'RON',
    paymentFrequency: 'WEEKLY',
    scheduleAnchorDay: 'START_DAY',
    status: 'ACTIVE',
    termsAndNotes: 'Active agreement',
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
  });

  await firestore.collection('active_rental_locks').doc(bike1Id).set({
    rentalId: activeRentalId,
    customerId,
    createdAt: Timestamp.fromDate(now),
  });

  await firestore.collection('rental_charge_cursors').doc(activeRentalId).set({
    nextSequence: 2,
    nextPeriodStart: '2026-11-08',
  });

  await firestore.collection('rental_charges').doc(`${activeRentalId}_1`).set({
    rentalId: activeRentalId,
    customerId,
    bikeId: bike1Id,
    chargeSequence: 1,
    periodStartDate: '2026-11-01',
    periodEndDate: '2026-11-07',
    dueDate: '2026-11-01',
    amount: '150.00',
    currency: 'RON',
    status: 'UNPAID',
    paidAmount: '0.00',
    remainingAmount: '150.00',
    notes: 'Period 1',
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
  });

  // Seed active rental to be closed
  await firestore.collection('rentals').doc(rentalToCloseId).set({
    customerId,
    customerName: 'John Customer',
    customerPhone: '+40712345678',
    bikeId: bike2Id,
    bikeRegistrationNumber: 'B-30-CCC',
    bikeMakeModel: 'Honda SH 150',
    startDate: '2026-11-01',
    plannedEndDate: null,
    actualClosedDate: null,
    weeklyRate: '160.00',
    currency: 'RON',
    depositAmount: '300.00',
    depositCurrency: 'RON',
    paymentFrequency: 'WEEKLY',
    scheduleAnchorDay: 'START_DAY',
    status: 'ACTIVE',
    termsAndNotes: 'Rental to be closed',
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
  });

  await firestore.collection('active_rental_locks').doc(bike2Id).set({
    rentalId: rentalToCloseId,
    customerId,
    createdAt: Timestamp.fromDate(now),
  });

  // 3. Define token generation helpers
  const validOwnerToken = jwt.sign(
    { userId: ownerId, role: 'ROLE_OWNER', lang: 'en', authVersion: 0 },
    config.jwtSecret,
    { algorithm: 'HS256', subject: 'owner@example.com', expiresIn: '1h' },
  );

  const validNonOwnerToken = jwt.sign(
    { userId: customerUserId, role: 'ROLE_CUSTOMER', lang: 'en', authVersion: 0 },
    config.jwtSecret,
    { algorithm: 'HS256', subject: 'customer-user@example.com', expiresIn: '1h' },
  );

  const expiredToken = jwt.sign(
    { userId: ownerId, role: 'ROLE_OWNER', lang: 'en', authVersion: 0 },
    config.jwtSecret,
    { algorithm: 'HS256', subject: 'owner@example.com', expiresIn: -10 },
  );

  const invalidSignatureToken = jwt.sign(
    { userId: ownerId, role: 'ROLE_OWNER', lang: 'en', authVersion: 0 },
    'untrusted-secret-that-does-not-match-configuration',
    { algorithm: 'HS256', subject: 'owner@example.com', expiresIn: '1h' },
  );

  const revokedToken = jwt.sign(
    { userId: ownerId, role: 'ROLE_OWNER', lang: 'en', authVersion: 99 },
    config.jwtSecret,
    { algorithm: 'HS256', subject: 'owner@example.com', expiresIn: '1h' },
  );

  const malformedToken = 'this.is.not.a.valid.jwt';

  // 4. Define all ten Stage C3 routes (21-30)
  interface RouteDefinition {
    number: number;
    method: 'GET' | 'POST' | 'PUT';
    name: string;
    getPath: () => string;
    body?: Record<string, unknown>;
    expectedSuccessStatus: number;
  }

  const routes: RouteDefinition[] = [
    {
      number: 21,
      method: 'POST',
      name: 'Create rental',
      getPath: () => '/api/v1/rentals',
      body: {
        customerId,
        motorbikeId: bikeForCreationId,
        startDate: '2026-12-01',
        weeklyRate: '150.00',
        currency: 'RON',
      },
      expectedSuccessStatus: 201,
    },
    {
      number: 22,
      method: 'POST',
      name: 'Close rental',
      getPath: () => `/api/v1/rentals/${rentalToCloseId}/close`,
      body: {
        closureDate: '2026-12-10',
        notes: 'Owner close',
      },
      expectedSuccessStatus: 200,
    },
    {
      number: 23,
      method: 'PUT',
      name: 'Update rental',
      getPath: () => `/api/v1/rentals/${activeRentalId}`,
      body: {
        motorbikeId: bike1Id,
        startDate: '2026-11-01',
        weeklyRate: '180.00',
        currency: 'RON',
      },
      expectedSuccessStatus: 200,
    },
    {
      number: 24,
      method: 'GET',
      name: 'Get rental by ID',
      getPath: () => `/api/v1/rentals/${activeRentalId}`,
      expectedSuccessStatus: 200,
    },
    {
      number: 25,
      method: 'GET',
      name: 'List rentals',
      getPath: () => '/api/v1/rentals',
      expectedSuccessStatus: 200,
    },
    {
      number: 26,
      method: 'POST',
      name: 'Generate next charge',
      getPath: () => `/api/v1/rental-charges/rental/${activeRentalId}/generate-next`,
      expectedSuccessStatus: 201,
    },
    {
      number: 27,
      method: 'POST',
      name: 'Generate charges up to date',
      getPath: () => `/api/v1/rental-charges/rental/${activeRentalId}/generate-up-to-date?targetDate=2026-11-20`,
      expectedSuccessStatus: 201,
    },
    {
      number: 28,
      method: 'GET',
      name: 'Get charges for rental',
      getPath: () => `/api/v1/rental-charges/rental/${activeRentalId}`,
      expectedSuccessStatus: 200,
    },
    {
      number: 29,
      method: 'GET',
      name: 'Get due charges',
      getPath: () => '/api/v1/rental-charges/due',
      expectedSuccessStatus: 200,
    },
    {
      number: 30,
      method: 'GET',
      name: 'List charges',
      getPath: () => '/api/v1/rental-charges',
      expectedSuccessStatus: 200,
    },
  ];

  assert.equal(routes.length, 10, 'Must cover exactly ten Stage C3 routes');

  // 5. Parameterized test loop across all 10 routes and all 7 token cases
  for (const route of routes) {
    const routePath = route.getPath();

    // Failure case 1: Missing token
    {
      const beforeSnapshot = await snapshotCollections(firestore, trackedCollections);
      const res = await sendRequest(app, routePath, route.method, undefined, route.body);
      assert.equal(
        res.status,
        401,
        `Route ${route.number} (${route.name}) must return 401 on missing token (got ${res.status})`,
      );
      assert.equal((res.body as Record<string, unknown>).error, 'UNAUTHORIZED');
      const afterSnapshot = await snapshotCollections(firestore, trackedCollections);
      assert.deepEqual(
        afterSnapshot,
        beforeSnapshot,
        `Route ${route.number} failed request (missing token) must not modify Firestore documents`,
      );
    }

    // Failure case 2: Malformed token
    {
      const beforeSnapshot = await snapshotCollections(firestore, trackedCollections);
      const res = await sendRequest(app, routePath, route.method, `Bearer ${malformedToken}`, route.body);
      assert.equal(
        res.status,
        401,
        `Route ${route.number} (${route.name}) must return 401 on malformed token (got ${res.status})`,
      );
      assert.equal((res.body as Record<string, unknown>).error, 'UNAUTHORIZED');
      const afterSnapshot = await snapshotCollections(firestore, trackedCollections);
      assert.deepEqual(
        afterSnapshot,
        beforeSnapshot,
        `Route ${route.number} failed request (malformed token) must not modify Firestore documents`,
      );
    }

    // Failure case 3: Invalid signature
    {
      const beforeSnapshot = await snapshotCollections(firestore, trackedCollections);
      const res = await sendRequest(app, routePath, route.method, `Bearer ${invalidSignatureToken}`, route.body);
      assert.equal(
        res.status,
        401,
        `Route ${route.number} (${route.name}) must return 401 on invalid signature (got ${res.status})`,
      );
      assert.equal((res.body as Record<string, unknown>).error, 'UNAUTHORIZED');
      const afterSnapshot = await snapshotCollections(firestore, trackedCollections);
      assert.deepEqual(
        afterSnapshot,
        beforeSnapshot,
        `Route ${route.number} failed request (invalid signature) must not modify Firestore documents`,
      );
    }

    // Failure case 4: Expired token
    {
      const beforeSnapshot = await snapshotCollections(firestore, trackedCollections);
      const res = await sendRequest(app, routePath, route.method, `Bearer ${expiredToken}`, route.body);
      assert.equal(
        res.status,
        401,
        `Route ${route.number} (${route.name}) must return 401 on expired token (got ${res.status})`,
      );
      assert.equal((res.body as Record<string, unknown>).error, 'UNAUTHORIZED');
      const afterSnapshot = await snapshotCollections(firestore, trackedCollections);
      assert.deepEqual(
        afterSnapshot,
        beforeSnapshot,
        `Route ${route.number} failed request (expired token) must not modify Firestore documents`,
      );
    }

    // Failure case 5: Revoked token
    {
      const beforeSnapshot = await snapshotCollections(firestore, trackedCollections);
      const res = await sendRequest(app, routePath, route.method, `Bearer ${revokedToken}`, route.body);
      assert.equal(
        res.status,
        401,
        `Route ${route.number} (${route.name}) must return 401 on revoked token (got ${res.status})`,
      );
      assert.equal((res.body as Record<string, unknown>).error, 'UNAUTHORIZED');
      const afterSnapshot = await snapshotCollections(firestore, trackedCollections);
      assert.deepEqual(
        afterSnapshot,
        beforeSnapshot,
        `Route ${route.number} failed request (revoked token) must not modify Firestore documents`,
      );
    }

    // Failure case 6: Valid authenticated non-owner (ROLE_CUSTOMER) -> 403 Forbidden
    {
      const beforeSnapshot = await snapshotCollections(firestore, trackedCollections);
      const res = await sendRequest(app, routePath, route.method, `Bearer ${validNonOwnerToken}`, route.body);
      assert.equal(
        res.status,
        403,
        `Route ${route.number} (${route.name}) must return 403 on authenticated non-owner (got ${res.status})`,
      );
      assert.equal((res.body as Record<string, unknown>).error, 'FORBIDDEN');
      assert.equal((res.body as Record<string, unknown>).message, 'Access denied');
      const afterSnapshot = await snapshotCollections(firestore, trackedCollections);
      assert.deepEqual(
        afterSnapshot,
        beforeSnapshot,
        `Route ${route.number} failed request (non-owner) must not modify Firestore documents`,
      );
    }

    // Success case 7: Valid authenticated owner -> Reaches intended route handler
    {
      const res = await sendRequest(app, routePath, route.method, `Bearer ${validOwnerToken}`, route.body);
      if (res.status !== route.expectedSuccessStatus) {
        console.error(`Route ${route.number} failed body:`, JSON.stringify(res.body));
      }
      assert.equal(
        res.status,
        route.expectedSuccessStatus,
        `Route ${route.number} (${route.name}) valid owner must reach handler with status ${route.expectedSuccessStatus} (got ${res.status})`,
      );
    }
  }
});
