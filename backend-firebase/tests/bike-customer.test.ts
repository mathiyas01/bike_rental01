import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { createApp } from '../src/app.js';
import { parseEnvironment } from '../src/config/env.js';
import { initializeFirebase } from '../src/config/firebase.js';
import {
  bikeRegLockId,
  bikeVinLockId,
  customerPhoneLockId,
} from '../src/reference/reference.repository.js';
import { todayUtc } from '../src/shared/dates.js';

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
  'service_records',
  'service_part_usage',
  'parts',
  'stock_movements',
  'suppliers',
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

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH';

type RequestFn = (
  path: string,
  method: HttpMethod,
  authHeader?: string,
  body?: unknown,
) => Promise<{ status: number; body: Record<string, unknown> }>;

async function withServer<T>(
  app: ReturnType<typeof createApp>,
  fn: (request: RequestFn) => Promise<T>,
): Promise<T> {
  const server = app.listen(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const request: RequestFn = async (path, method, authHeader, body) => {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(authHeader !== undefined ? { Authorization: authHeader } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const text = await response.text();
      return {
        status: response.status,
        body: (text ? JSON.parse(text) : {}) as Record<string, unknown>,
      };
    };
    return await fn(request);
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

async function seedUser(
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
): Promise<void> {
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

test('Stage C8 authentication matrix across all 14 bike & customer routes (no ownerMiddleware)', async (context) => {
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
  const inactiveUserId = randomUUID();
  const deletedUserId = randomUUID();

  await seedUser(firestore, { id: ownerId, email: 'owner@c8.ro', fullName: 'Owner C8', role: 'ROLE_OWNER' });
  await seedUser(firestore, { id: customerUserId, email: 'cust@c8.ro', fullName: 'Customer C8', role: 'ROLE_CUSTOMER' });
  await seedUser(firestore, {
    id: revokedUserId,
    email: 'revoked@c8.ro',
    fullName: 'Revoked C8',
    role: 'ROLE_OWNER',
    authVersion: 3,
    tokenIssuedBefore: new Date(Date.now() + 60_000),
  });
  await seedUser(firestore, {
    id: inactiveUserId,
    email: 'inactive@c8.ro',
    fullName: 'Inactive C8',
    role: 'ROLE_OWNER',
    isActive: false,
  });

  const ownerToken = makeToken(ownerId, 'owner@c8.ro', 'ROLE_OWNER');
  const customerToken = makeToken(customerUserId, 'cust@c8.ro', 'ROLE_CUSTOMER');
  const expiredToken = makeToken(ownerId, 'owner@c8.ro', 'ROLE_OWNER', 0, {
    iatOffsetSeconds: -7200,
    expiresInSeconds: 3600,
  });
  const badSecretToken = makeToken(ownerId, 'owner@c8.ro', 'ROLE_OWNER', 0, {
    secret: 'wrong-secret-with-at-least-thirty-two-bytes',
  });
  const staleVersionToken = makeToken(revokedUserId, 'revoked@c8.ro', 'ROLE_OWNER', 2);
  const staleIatToken = makeToken(revokedUserId, 'revoked@c8.ro', 'ROLE_OWNER', 3, {
    iatOffsetSeconds: -10,
  });
  const inactiveToken = makeToken(inactiveUserId, 'inactive@c8.ro', 'ROLE_OWNER');
  const deletedToken = makeToken(deletedUserId, 'deleted@c8.ro', 'ROLE_OWNER');

  await withServer(app, async (request) => {
    const seedBikeRes = await request('/api/v1/bikes', 'POST', `Bearer ${ownerToken}`, {
      registrationNumber: 'B-01-AUTH',
      vin: 'VIN-AUTH-0001',
      make: 'Honda',
      model: 'CB500X',
      manufactureYear: 2023,
    });
    assert.equal(seedBikeRes.status, 201);
    const bikeId = String(seedBikeRes.body.id);

    const seedCustRes = await request('/api/v1/customers', 'POST', `Bearer ${ownerToken}`, {
      fullName: 'Auth Seed Customer',
      phone: '+40711111111',
    });
    assert.equal(seedCustRes.status, 201);
    const customerId = String(seedCustRes.body.id);

    const invalidAuthHeaders: Array<string | undefined> = [
      undefined,
      'Basic dXNlcjpwYXNz',
      `Bearer ${expiredToken}`,
      `Bearer ${badSecretToken}`,
      `Bearer ${staleVersionToken}`,
      `Bearer ${staleIatToken}`,
      `Bearer ${inactiveToken}`,
      `Bearer ${deletedToken}`,
    ];

    const unauthTargets: Array<{ method: HttpMethod; path: string; body?: unknown }> = [
      { method: 'POST', path: '/api/v1/bikes', body: {} },
      { method: 'GET', path: '/api/v1/bikes' },
      { method: 'GET', path: `/api/v1/bikes/${bikeId}` },
      { method: 'PUT', path: `/api/v1/bikes/${bikeId}`, body: {} },
      { method: 'PATCH', path: `/api/v1/bikes/${bikeId}/status`, body: { status: 'AVAILABLE' } },
      { method: 'POST', path: `/api/v1/bikes/${bikeId}/archive` },
      { method: 'POST', path: `/api/v1/bikes/${bikeId}/unarchive` },
      { method: 'POST', path: '/api/v1/customers', body: {} },
      { method: 'GET', path: '/api/v1/customers' },
      { method: 'GET', path: `/api/v1/customers/${customerId}` },
      { method: 'PUT', path: `/api/v1/customers/${customerId}`, body: {} },
      { method: 'POST', path: `/api/v1/customers/${customerId}/archive` },
      { method: 'POST', path: `/api/v1/customers/${customerId}/unarchive` },
      { method: 'GET', path: `/api/v1/customers/${customerId}/balance-summary` },
    ];

    for (const target of unauthTargets) {
      for (const header of invalidAuthHeaders) {
        const res = await request(target.path, target.method, header, target.body);
        assert.equal(res.status, 401, `Expected 401 for ${target.method} ${target.path}`);
      }
    }

    // Stage C8.4.3.1: ROLE_CUSTOMER receives 403 FORBIDDEN on all 14 operational bike & customer routes,
    // while ROLE_OWNER succeeds across all 14 routes.
    for (const target of unauthTargets) {
      const denied = await request(target.path, target.method, `Bearer ${customerToken}`, target.body);
      assert.equal(denied.status, 403, `Expected 403 FORBIDDEN for ROLE_CUSTOMER on ${target.method} ${target.path}`);
      assert.equal(denied.body.error, 'FORBIDDEN');
    }

    const ownerBikeCreate = await request('/api/v1/bikes', 'POST', `Bearer ${ownerToken}`, {
      registrationNumber: 'B-02-ROLE',
      vin: 'VIN-ROLE-0002',
      make: 'Yamaha',
      model: 'MT-07',
      manufactureYear: 2024,
    });
    assert.equal(ownerBikeCreate.status, 201);
    const ownerBikeId = String(ownerBikeCreate.body.id);

    assert.equal((await request('/api/v1/bikes', 'GET', `Bearer ${ownerToken}`)).status, 200);
    assert.equal((await request(`/api/v1/bikes/${ownerBikeId}`, 'GET', `Bearer ${ownerToken}`)).status, 200);
    assert.equal(
      (await request(`/api/v1/bikes/${ownerBikeId}`, 'PUT', `Bearer ${ownerToken}`, {
        registrationNumber: 'B-02-ROLE',
        vin: 'VIN-ROLE-0002',
        make: 'Yamaha',
        model: 'MT-07',
        manufactureYear: 2024,
        currentOdometer: 100,
      })).status,
      200,
    );
    assert.equal(
      (await request(`/api/v1/bikes/${ownerBikeId}/status`, 'PATCH', `Bearer ${ownerToken}`, {
        status: 'IN_SERVICE',
      })).status,
      200,
    );
    assert.equal((await request(`/api/v1/bikes/${ownerBikeId}/archive`, 'POST', `Bearer ${ownerToken}`)).status, 200);
    assert.equal((await request(`/api/v1/bikes/${ownerBikeId}/unarchive`, 'POST', `Bearer ${ownerToken}`)).status, 200);

    const ownerCustCreate = await request('/api/v1/customers', 'POST', `Bearer ${ownerToken}`, {
      fullName: 'Owner Allowed Customer',
      phone: '+40722222222',
    });
    assert.equal(ownerCustCreate.status, 201);
    const ownerCustId = String(ownerCustCreate.body.id);

    assert.equal((await request('/api/v1/customers', 'GET', `Bearer ${ownerToken}`)).status, 200);
    assert.equal((await request(`/api/v1/customers/${ownerCustId}`, 'GET', `Bearer ${ownerToken}`)).status, 200);
    assert.equal(
      (await request(`/api/v1/customers/${ownerCustId}`, 'PUT', `Bearer ${ownerToken}`, {
        fullName: 'Owner Allowed Updated',
        phone: '+40722222222',
      })).status,
      200,
    );
    assert.equal((await request(`/api/v1/customers/${ownerCustId}/archive`, 'POST', `Bearer ${ownerToken}`)).status, 200);
    assert.equal((await request(`/api/v1/customers/${ownerCustId}/unarchive`, 'POST', `Bearer ${ownerToken}`)).status, 200);
    assert.equal(
      (await request(`/api/v1/customers/${ownerCustId}/balance-summary`, 'GET', `Bearer ${ownerToken}`)).status,
      200,
    );
  });
});

test('Bike CRUD, SHA-256 uniqueness locks, concurrent create races, PUT lock swaps, and archive retention', async (context) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !await reachable(process.env.FIRESTORE_EMULATOR_HOST)) {
    context.skip('Run with the Firestore emulator');
    return;
  }

  const { firestore } = initializeFirebase(config);
  await clearCollections(firestore);
  const app = createApp(config, firestore);

  const ownerId = randomUUID();
  await seedUser(firestore, { id: ownerId, email: 'owner@bikes.ro', fullName: 'Owner', role: 'ROLE_OWNER' });
  const token = makeToken(ownerId, 'owner@bikes.ro', 'ROLE_OWNER');

  await withServer(app, async (request) => {
    const createRes = await request('/api/v1/bikes', 'POST', `Bearer ${token}`, {
      registrationNumber: '  b-101-mot  ',
      vin: '  jh2pc460000123456 ',
      make: '  Honda  ',
      model: '  CB500X  ',
      manufactureYear: 2023,
      itpExpiryDate: '',
      rcaExpiryDate: '',
      cascoExpiryDate: '',
      notes: '',
    });
    assert.equal(createRes.status, 201);
    const bikeId = String(createRes.body.id);
    assert.equal(createRes.body.registrationNumber, 'B-101-MOT');
    assert.equal(createRes.body.vin, 'JH2PC460000123456');
    assert.equal(createRes.body.manufactureYear, 2023);
    assert.equal(createRes.body.yearOfManufacture, 2023);
    assert.equal(createRes.body.currentOdometer, 0);
    assert.equal(createRes.body.serviceIntervalDays, 30);
    assert.equal(createRes.body.status, 'AVAILABLE');
    assert.equal(createRes.body.archived, false);
    assert.equal(createRes.body.itpExpiryDate, null);

    // Locks exist in unique_keys
    assert.equal((await firestore.collection('unique_keys').doc(bikeRegLockId('B-101-MOT')).get()).exists, true);
    assert.equal((await firestore.collection('unique_keys').doc(bikeVinLockId('JH2PC460000123456')).get()).exists, true);

    // Duplicate reg & VIN -> 409 with zero extra bike docs
    const dupReg = await request('/api/v1/bikes', 'POST', `Bearer ${token}`, {
      registrationNumber: 'B-101-MOT',
      vin: 'JH2PC460000999999',
      make: 'Honda',
      model: 'CB500X',
      manufactureYear: 2023,
    });
    assert.equal(dupReg.status, 409);

    const dupVin = await request('/api/v1/bikes', 'POST', `Bearer ${token}`, {
      registrationNumber: 'B-999-MOT',
      vin: 'jh2pc460000123456',
      make: 'Honda',
      model: 'CB500X',
      manufactureYear: 2023,
    });
    assert.equal(dupVin.status, 409);
    assert.equal((await firestore.collection('bikes').count().get()).data().count, 1);

    // Concurrent registrationNumber race -> exactly 1 201 and 1 409
    const [raceRegA, raceRegB] = await Promise.all([
      request('/api/v1/bikes', 'POST', `Bearer ${token}`, {
        registrationNumber: 'B-202-RAC',
        vin: 'VIN-RACE-REG-1',
        make: 'Yamaha',
        model: 'MT-07',
        manufactureYear: 2024,
      }),
      request('/api/v1/bikes', 'POST', `Bearer ${token}`, {
        registrationNumber: ' b-202-rac ',
        vin: 'VIN-RACE-REG-2',
        make: 'Yamaha',
        model: 'MT-07',
        manufactureYear: 2024,
      }),
    ]);
    assert.deepEqual([raceRegA.status, raceRegB.status].sort((a, b) => a - b), [201, 409]);

    // Concurrent VIN race -> exactly 1 201 and 1 409
    const [raceVinA, raceVinB] = await Promise.all([
      request('/api/v1/bikes', 'POST', `Bearer ${token}`, {
        registrationNumber: 'B-301-VIN',
        vin: 'VIN-RACE-SHARED',
        make: 'Suzuki',
        model: 'SV650',
        manufactureYear: 2022,
      }),
      request('/api/v1/bikes', 'POST', `Bearer ${token}`, {
        registrationNumber: 'B-302-VIN',
        vin: ' vin-race-shared ',
        make: 'Suzuki',
        model: 'SV650',
        manufactureYear: 2022,
      }),
    ]);
    assert.deepEqual([raceVinA.status, raceVinB.status].sort((a, b) => a - b), [201, 409]);

    const secondBikeId = String((raceRegA.status === 201 ? raceRegA : raceRegB).body.id);

    // PUT swapping registrationNumber releases old lock and preserves omitted serviceIntervalDays/status
    const updateSwap = await request(`/api/v1/bikes/${bikeId}`, 'PUT', `Bearer ${token}`, {
      registrationNumber: 'B-101-NEW',
      vin: 'JH2PC460000123456',
      make: 'Honda',
      model: 'CB500X',
      manufactureYear: 2023,
      currentOdometer: 1500.5,
    });
    assert.equal(updateSwap.status, 200);
    assert.equal(updateSwap.body.registrationNumber, 'B-101-NEW');
    assert.equal(updateSwap.body.serviceIntervalDays, 30);
    assert.equal(updateSwap.body.status, 'AVAILABLE');
    assert.equal((await firestore.collection('unique_keys').doc(bikeRegLockId('B-101-MOT')).get()).exists, false);
    assert.equal((await firestore.collection('unique_keys').doc(bikeRegLockId('B-101-NEW')).get()).exists, true);

    // Old registrationNumber can now be reused cleanly
    const reuseOldReg = await request('/api/v1/bikes', 'POST', `Bearer ${token}`, {
      registrationNumber: 'B-101-MOT',
      vin: 'VIN-REUSED-OLD-REG',
      make: 'BMW',
      model: 'F750GS',
      manufactureYear: 2023,
    });
    assert.equal(reuseOldReg.status, 201);

    // PUT conflicting with secondBike's reg -> 409 without mutating either bike or locks
    const conflictPut = await request(`/api/v1/bikes/${bikeId}`, 'PUT', `Bearer ${token}`, {
      registrationNumber: 'B-202-RAC',
      vin: 'JH2PC460000123456',
      make: 'Honda',
      model: 'CB500X',
      manufactureYear: 2023,
      currentOdometer: 1600,
    });
    assert.equal(conflictPut.status, 409);
    assert.equal(
      ((await request(`/api/v1/bikes/${bikeId}`, 'GET', `Bearer ${token}`)).body).registrationNumber,
      'B-101-NEW',
    );
    assert.notEqual(secondBikeId, '');

    // PATCH status + Archive + lock retention across archive + Unarchive
    const patchStatus = await request(`/api/v1/bikes/${bikeId}/status`, 'PATCH', `Bearer ${token}`, {
      status: 'IN_SERVICE',
    });
    assert.equal(patchStatus.status, 200);
    assert.equal(patchStatus.body.status, 'IN_SERVICE');

    const archived = await request(`/api/v1/bikes/${bikeId}/archive`, 'POST', `Bearer ${token}`);
    assert.equal(archived.status, 200);
    assert.equal(archived.body.archived, true);
    assert.equal(archived.body.status, 'INACTIVE');

    // Archived bike retains registration/VIN locks
    const reuseWhileArchived = await request('/api/v1/bikes', 'POST', `Bearer ${token}`, {
      registrationNumber: 'B-101-NEW',
      vin: 'VIN-BLOCKED-WHILE-ARCHIVED',
      make: 'Honda',
      model: 'Hornet',
      manufactureYear: 2024,
    });
    assert.equal(reuseWhileArchived.status, 409);

    const unarchived = await request(`/api/v1/bikes/${bikeId}/unarchive`, 'POST', `Bearer ${token}`);
    assert.equal(unarchived.status, 200);
    assert.equal(unarchived.body.archived, false);
    assert.equal(unarchived.body.status, 'AVAILABLE');

    // 404 & 400 GET error handling
    assert.equal((await request(`/api/v1/bikes/${randomUUID()}`, 'GET', `Bearer ${token}`)).status, 404);
    assert.equal((await request('/api/v1/bikes/not-a-uuid', 'GET', `Bearer ${token}`)).status, 400);
  });
});

test('Issue 1 & 2: Active rental lock guards PUT/PATCH/archive, syncs active rental display snapshots, keeps historical snapshots immutable', async (context) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !await reachable(process.env.FIRESTORE_EMULATOR_HOST)) {
    context.skip('Run with the Firestore emulator');
    return;
  }

  const { firestore } = initializeFirebase(config);
  await clearCollections(firestore);
  const app = createApp(config, firestore);

  const ownerId = randomUUID();
  await seedUser(firestore, { id: ownerId, email: 'owner@rented.ro', fullName: 'Owner', role: 'ROLE_OWNER' });
  const token = makeToken(ownerId, 'owner@rented.ro', 'ROLE_OWNER');

  await withServer(app, async (request) => {
    const custRes = await request('/api/v1/customers', 'POST', `Bearer ${token}`, {
      fullName: 'Rented Bike Customer',
      phone: '+40744111222',
    });
    assert.equal(custRes.status, 201);
    const customerId = String(custRes.body.id);

    const bikeRes = await request('/api/v1/bikes', 'POST', `Bearer ${token}`, {
      registrationNumber: 'B-500-OLD',
      vin: 'VIN-RENTED-500',
      make: 'Honda',
      model: 'CB500X',
      manufactureYear: 2023,
    });
    assert.equal(bikeRes.status, 201);
    const bikeId = String(bikeRes.body.id);

    // Create historical closed rental + service record BEFORE editing the bike
    const historicalRentalRes = await request('/api/v1/rentals', 'POST', `Bearer ${token}`, {
      customerId,
      motorbikeId: bikeId,
      startDate: '2026-09-01',
      plannedEndDate: '2026-09-15',
      weeklyRate: 150,
      currency: 'RON',
    });
    assert.equal(historicalRentalRes.status, 201);
    const historicalRentalId = String(historicalRentalRes.body.id);
    assert.equal(
      (await request(`/api/v1/rentals/${historicalRentalId}/close`, 'POST', `Bearer ${token}`, {
        closureDate: '2026-09-15',
      })).status,
      200,
    );

    const serviceRes = await request('/api/v1/services', 'POST', `Bearer ${token}`, {
      motorbikeId: bikeId,
      serviceDate: '2026-09-20',
      odometerReading: 1200,
      serviceProvider: 'Moto Shop',
      workPerformed: 'Oil change',
      labourCost: 100,
    });
    assert.equal(serviceRes.status, 201);
    const serviceId = String(serviceRes.body.id);

    // Now create an ACTIVE rental on the bike
    const activeRentalRes = await request('/api/v1/rentals', 'POST', `Bearer ${token}`, {
      customerId,
      motorbikeId: bikeId,
      startDate: '2026-10-01',
      plannedEndDate: '2026-12-01',
      weeklyRate: 200,
      currency: 'RON',
    });
    assert.equal(activeRentalRes.status, 201);
    const activeRentalId = String(activeRentalRes.body.id);

    assert.equal(((await request(`/api/v1/bikes/${bikeId}`, 'GET', `Bearer ${token}`)).body).status, 'RENTED');
    assert.equal((await firestore.collection('active_rental_locks').doc(bikeId).get()).exists, true);

    // PUT trying to leave RENTED while rented -> 400 BusinessError
    const putLeaveRented = await request(`/api/v1/bikes/${bikeId}`, 'PUT', `Bearer ${token}`, {
      registrationNumber: 'B-500-OLD',
      vin: 'VIN-RENTED-500',
      make: 'Honda',
      model: 'CB500X',
      manufactureYear: 2023,
      currentOdometer: 1200,
      status: 'AVAILABLE',
    });
    assert.equal(putLeaveRented.status, 400);
    assert.equal(putLeaveRented.body.status, 400);
    assert.equal(putLeaveRented.body.error, 'BAD_REQUEST');
    assert.equal(
      putLeaveRented.body.message,
      'Cannot directly change status of a currently rented bike. Please close the active rental agreement first.',
    );
    assert.equal(((await request(`/api/v1/bikes/${bikeId}`, 'GET', `Bearer ${token}`)).body).status, 'RENTED');
    assert.equal((await firestore.collection('active_rental_locks').doc(bikeId).get()).exists, true);

    // PATCH leaving RENTED & POST archive while rented -> 400 BusinessError
    const patchLeaveRented = await request(`/api/v1/bikes/${bikeId}/status`, 'PATCH', `Bearer ${token}`, {
      status: 'IN_SERVICE',
    });
    assert.equal(patchLeaveRented.status, 400);
    assert.equal(patchLeaveRented.body.error, 'BAD_REQUEST');
    assert.equal(
      patchLeaveRented.body.message,
      'Cannot directly change status of a currently rented bike. Please close the active rental agreement first.',
    );

    const archiveRented = await request(`/api/v1/bikes/${bikeId}/archive`, 'POST', `Bearer ${token}`);
    assert.equal(archiveRented.status, 400);
    assert.equal(archiveRented.body.error, 'BAD_REQUEST');
    assert.equal(archiveRented.body.message, 'Cannot archive a motorbike with an active rental');

    // PUT with omitted status (or RENTED) succeeds, keeps RENTED, syncs ACTIVE rental snapshot only
    const putMetadataEdit = await request(`/api/v1/bikes/${bikeId}`, 'PUT', `Bearer ${token}`, {
      registrationNumber: 'B-500-NEW',
      vin: 'VIN-RENTED-500',
      make: 'Honda',
      model: 'Transalp 750',
      manufactureYear: 2024,
      currentOdometer: 1250,
      itpExpiryDate: '2027-08-01',
      notes: 'Renewed ITP while rented',
    });
    assert.equal(putMetadataEdit.status, 200);
    assert.equal(putMetadataEdit.body.status, 'RENTED');
    assert.equal(putMetadataEdit.body.registrationNumber, 'B-500-NEW');

    // Active rental gets synced snapshot
    const activeRentalAfter = (await firestore.collection('rentals').doc(activeRentalId).get()).data()!;
    assert.equal(activeRentalAfter.bikeRegistrationNumber, 'B-500-NEW');
    assert.equal(activeRentalAfter.bikeMakeModel, 'Honda Transalp 750');

    // Closed historical rental and service record retain creation-time snapshots
    const closedRentalAfter = (await firestore.collection('rentals').doc(historicalRentalId).get()).data()!;
    assert.equal(closedRentalAfter.bikeRegistrationNumber, 'B-500-OLD');
    assert.equal(closedRentalAfter.bikeMakeModel, 'Honda CB500X');

    const serviceAfter = (await firestore.collection('service_records').doc(serviceId).get()).data()!;
    assert.equal(serviceAfter.bikeRegistrationNumber, 'B-500-OLD');
    assert.equal(serviceAfter.bikeMakeModel, 'Honda CB500X');

    // Rental closure succeeds cleanly afterwards and frees bike for status/archive transitions
    assert.equal(
      (await request(`/api/v1/rentals/${activeRentalId}/close`, 'POST', `Bearer ${token}`, {
        closureDate: '2026-11-16',
      })).status,
      200,
    );
    assert.equal((await firestore.collection('active_rental_locks').doc(bikeId).get()).exists, false);
    assert.equal(
      (await request(`/api/v1/bikes/${bikeId}/status`, 'PATCH', `Bearer ${token}`, { status: 'IN_SERVICE' })).status,
      200,
    );

    // Manual RENTED status without active rental is permitted without fabricating a fake lock
    const manualRented = await request(`/api/v1/bikes/${bikeId}/status`, 'PATCH', `Bearer ${token}`, {
      status: 'RENTED',
    });
    assert.equal(manualRented.status, 200);
    assert.equal(manualRented.body.status, 'RENTED');
    assert.equal((await firestore.collection('active_rental_locks').doc(bikeId).get()).exists, false);

    // unarchive returns 409 if an active rental lock exists on an archived bike
    const archivedWithStaleLockId = randomUUID();
    await firestore.collection('bikes').doc(archivedWithStaleLockId).set({
      id: archivedWithStaleLockId,
      registrationNumber: 'B-LOCK-999',
      vin: 'VIN-LOCK-999',
      make: 'Honda',
      model: 'PCX',
      manufactureYear: 2022,
      status: 'INACTIVE',
      isArchived: true,
    });
    await firestore.collection('active_rental_locks').doc(archivedWithStaleLockId).set({
      rentalId: randomUUID(),
      status: 'ACTIVE',
      version: 1,
    });
    assert.equal(
      (await request(`/api/v1/bikes/${archivedWithStaleLockId}/unarchive`, 'POST', `Bearer ${token}`)).status,
      409,
    );
  });
});

test('Customer CRUD, phone uniqueness locks, concurrent create races, Route 20 balance-summary reuse & historical snapshots', async (context) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !await reachable(process.env.FIRESTORE_EMULATOR_HOST)) {
    context.skip('Run with the Firestore emulator');
    return;
  }

  const { firestore } = initializeFirebase(config);
  await clearCollections(firestore);
  const app = createApp(config, firestore);

  const ownerId = randomUUID();
  await seedUser(firestore, { id: ownerId, email: 'owner@cust.ro', fullName: 'Owner', role: 'ROLE_OWNER' });
  const token = makeToken(ownerId, 'owner@cust.ro', 'ROLE_OWNER');

  await withServer(app, async (request) => {
    const createRes = await request('/api/v1/customers', 'POST', `Bearer ${token}`, {
      fullName: '  Ion Popescu  ',
      phone: '  +40722123456  ',
      email: '  ION.POPESCU@EXAMPLE.RO  ',
      cnpOrTaxId: '',
      dateOfBirth: '1990-05-15',
      livingCity: '  Bucharest ',
      drivingLicenceNumber: 'B123456',
      licenceExpiryDate: '',
      address: 'Str. Aviatorilor 10',
      notes: '',
    });
    assert.equal(createRes.status, 201);
    const customerId = String(createRes.body.id);
    assert.equal(createRes.body.fullName, 'Ion Popescu');
    assert.equal(createRes.body.phone, '+40722123456');
    assert.equal(createRes.body.email, 'ion.popescu@example.ro');
    assert.equal(createRes.body.licenceCategories, 'A,A2');
    assert.equal(createRes.body.gdprConsentDate, todayUtc());
    assert.equal(createRes.body.dateOfBirth, '1990-05-15');
    assert.equal(createRes.body.livingCity, 'Bucharest');
    assert.equal(createRes.body.archived, false);

    // Duplicate phone -> 409; concurrent race -> 1 201 + 1 409
    assert.equal(
      (await request('/api/v1/customers', 'POST', `Bearer ${token}`, {
        fullName: 'Another Customer',
        phone: '+40722123456',
      })).status,
      409,
    );

    const [raceA, raceB] = await Promise.all([
      request('/api/v1/customers', 'POST', `Bearer ${token}`, {
        fullName: 'Race One',
        phone: '+40799000111',
      }),
      request('/api/v1/customers', 'POST', `Bearer ${token}`, {
        fullName: 'Race Two',
        phone: ' +40799000111 ',
      }),
    ]);
    assert.deepEqual([raceA.status, raceB.status].sort((a, b) => a - b), [201, 409]);

    // Seed bike + rental + payment to test Issue 2 & Route 20
    const bikeRes = await request('/api/v1/bikes', 'POST', `Bearer ${token}`, {
      registrationNumber: 'B-707-CUS',
      vin: 'VIN-CUST-707',
      make: 'Honda',
      model: 'Forza 350',
      manufactureYear: 2024,
    });
    assert.equal(bikeRes.status, 201);
    const rentalRes = await request('/api/v1/rentals', 'POST', `Bearer ${token}`, {
      customerId,
      motorbikeId: bikeRes.body.id,
      startDate: '2026-10-01',
      plannedEndDate: '2026-11-30',
      weeklyRate: 250,
      currency: 'RON',
    });
    assert.equal(rentalRes.status, 201);
    const rentalId = String(rentalRes.body.id);

    const payRes = await request('/api/v1/payments', 'POST', `Bearer ${token}`, {
      customerId,
      rentalId,
      paymentDate: '2026-10-02',
      amount: 100,
      currency: 'RON',
      paymentMethod: 'CASH',
    });
    assert.equal(payRes.status, 201);
    const paymentId = String(payRes.body.id);

    // PUT updates phone/name, releases old phone lock, preserves DOB/city/gdprConsentDate/licenceCategories
    const putRes = await request(`/api/v1/customers/${customerId}`, 'PUT', `Bearer ${token}`, {
      fullName: 'Ion Popescu Renamed',
      phone: '+40722888999',
      email: 'new.email@example.ro',
      cnpOrTaxId: 'RO555',
      notes: 'Updated details',
    });
    assert.equal(putRes.status, 200);
    assert.equal(putRes.body.fullName, 'Ion Popescu Renamed');
    assert.equal(putRes.body.phone, '+40722888999');
    assert.equal(putRes.body.dateOfBirth, '1990-05-15');
    assert.equal(putRes.body.livingCity, 'Bucharest');
    assert.equal(putRes.body.licenceCategories, 'A,A2');
    assert.equal(putRes.body.gdprConsentDate, todayUtc());

    assert.equal((await firestore.collection('unique_keys').doc(customerPhoneLockId('+40722123456')).get()).exists, false);
    assert.equal((await firestore.collection('unique_keys').doc(customerPhoneLockId('+40722888999')).get()).exists, true);

    // Old phone number can now be reused
    assert.equal(
      (await request('/api/v1/customers', 'POST', `Bearer ${token}`, {
        fullName: 'New Phone Owner',
        phone: '+40722123456',
      })).status,
      201,
    );

    // Conflict when changing phone to existing customer -> 409 without corruption
    assert.equal(
      (await request(`/api/v1/customers/${customerId}`, 'PUT', `Bearer ${token}`, {
        fullName: 'Should Roll Back',
        phone: '+40722123456',
      })).status,
      409,
    );

    // Historical rental & payment snapshots remain point-in-time immutable
    const rentalAfter = (await firestore.collection('rentals').doc(rentalId).get()).data()!;
    const paymentAfter = (await firestore.collection('payments').doc(paymentId).get()).data()!;
    assert.equal(rentalAfter.customerName, 'Ion Popescu');
    assert.equal(rentalAfter.customerPhone, '+40722123456');
    assert.equal(paymentAfter.customerName, 'Ion Popescu');

    // Route 20 reflects live customerName and matches Stage C4 /api/v1/payments/balance-summary/:customerId
    const custSummary = await request(`/api/v1/customers/${customerId}/balance-summary`, 'GET', `Bearer ${token}`);
    const paySummary = await request(`/api/v1/payments/balance-summary/${customerId}`, 'GET', `Bearer ${token}`);
    assert.equal(custSummary.status, 200);
    assert.equal(custSummary.body.customerName, 'Ion Popescu Renamed');
    assert.deepEqual(custSummary.body, paySummary.body);

    // Unknown customer -> 404
    assert.equal(
      (await request(`/api/v1/customers/${randomUUID()}/balance-summary`, 'GET', `Bearer ${token}`)).status,
      404,
    );

    // Archive / unarchive customer (allowed even with active rental, retains phone lock)
    const archCust = await request(`/api/v1/customers/${customerId}/archive`, 'POST', `Bearer ${token}`);
    assert.equal(archCust.status, 200);
    assert.equal(archCust.body.archived, true);
    assert.equal(
      (await request('/api/v1/customers', 'POST', `Bearer ${token}`, {
        fullName: 'Blocked Phone Reuse',
        phone: '+40722888999',
      })).status,
      409,
    );

    const unarchCust = await request(`/api/v1/customers/${customerId}/unarchive`, 'POST', `Bearer ${token}`);
    assert.equal(unarchCust.status, 200);
    assert.equal(unarchCust.body.archived, false);
  });
});

test('Search, pagination, sorting, and legacy minimal doc compatibility on GET /bikes & GET /customers', async (context) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !await reachable(process.env.FIRESTORE_EMULATOR_HOST)) {
    context.skip('Run with the Firestore emulator');
    return;
  }

  const { firestore } = initializeFirebase(config);
  await clearCollections(firestore);
  const app = createApp(config, firestore);

  const ownerId = randomUUID();
  await seedUser(firestore, { id: ownerId, email: 'owner@search.ro', fullName: 'Owner', role: 'ROLE_OWNER' });
  const token = makeToken(ownerId, 'owner@search.ro', 'ROLE_OWNER');

  // Seed legacy pre-C8 minimal docs lacking createdAt/manufactureYear
  const legacyBikeId = randomUUID();
  await firestore.collection('bikes').doc(legacyBikeId).set({
    id: legacyBikeId,
    registrationNumber: 'B-00-LEG',
    vin: 'VIN-LEGACY-00',
    make: 'Honda',
    model: 'Legacy 125',
    status: 'AVAILABLE',
    isArchived: false,
  });

  await withServer(app, async (request) => {
    const b1 = await request('/api/v1/bikes', 'POST', `Bearer ${token}`, {
      registrationNumber: 'B-10-ONE',
      vin: 'VIN-SRC-0001',
      make: 'Honda',
      model: 'CB500X',
      manufactureYear: 2022,
      currentOdometer: 90,
    });
    const b2 = await request('/api/v1/bikes', 'POST', `Bearer ${token}`, {
      registrationNumber: 'B-20-TWO',
      vin: 'VIN-SRC-0002',
      make: 'Yamaha',
      model: 'Tracer 7',
      manufactureYear: 2024,
      currentOdometer: 1000,
    });
    assert.equal(b1.status, 201);
    assert.equal(b2.status, 201);
    await request(`/api/v1/bikes/${b2.body.id}/archive`, 'POST', `Bearer ${token}`);

    // Default excludes archived & includes legacy minimal doc without createdAt
    const activeDefault = await request('/api/v1/bikes', 'GET', `Bearer ${token}`);
    assert.equal(activeDefault.status, 200);
    assert.equal(activeDefault.body.totalElements, 2);

    // Include archived + numeric currentOdometer ascending sort
    const sortedWithArchived = await request(
      '/api/v1/bikes?includeArchived=true&sort=currentOdometer,ASC&size=2&page=0',
      'GET',
      `Bearer ${token}`,
    );
    assert.equal(sortedWithArchived.status, 200);
    assert.equal(sortedWithArchived.body.totalElements, 3);
    assert.equal(sortedWithArchived.body.totalPages, 2);
    assert.equal(sortedWithArchived.body.last, false);
    const page0Items = sortedWithArchived.body.content as Array<Record<string, unknown>>;
    assert.deepEqual(page0Items.map((b) => b.currentOdometer), [0, 90]);

    const searchTracer = await request(
      '/api/v1/bikes?search=tracer&includeArchived=true&status=INACTIVE',
      'GET',
      `Bearer ${token}`,
    );
    assert.equal(searchTracer.status, 200);
    assert.equal(searchTracer.body.totalElements, 1);

    // Customers search & pagination
    await request('/api/v1/customers', 'POST', `Bearer ${token}`, {
      fullName: 'Alpha Rider',
      phone: '+40711000001',
      email: 'alpha@fleet.ro',
      cnpOrTaxId: 'RO111222',
    });
    const betaRes = await request('/api/v1/customers', 'POST', `Bearer ${token}`, {
      fullName: 'Beta Rider',
      phone: '+40711000002',
      email: 'beta@fleet.ro',
    });
    await request(`/api/v1/customers/${betaRes.body.id}/archive`, 'POST', `Bearer ${token}`);

    const activeCustomers = await request('/api/v1/customers', 'GET', `Bearer ${token}`);
    assert.equal(activeCustomers.status, 200);
    assert.equal(activeCustomers.body.totalElements, 1);

    const searchCnp = await request(
      '/api/v1/customers?search=111222&includeArchived=false',
      'GET',
      `Bearer ${token}`,
    );
    assert.equal(searchCnp.status, 200);
    assert.equal(searchCnp.body.totalElements, 1);

    const allCustomers = await request(
      '/api/v1/customers?includeArchived=true&sort=fullName,ASC',
      'GET',
      `Bearer ${token}`,
    );
    assert.equal(allCustomers.status, 200);
    assert.equal(allCustomers.body.totalElements, 2);
    assert.deepEqual(
      (allCustomers.body.content as Array<Record<string, unknown>>).map((c) => c.fullName),
      ['Alpha Rider', 'Beta Rider'],
    );
  });
});
