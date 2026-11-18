import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { createApp } from '../src/app.js';
import { parseEnvironment } from '../src/config/env.js';
import { initializeFirebase } from '../src/config/firebase.js';
import { addDays, todayUtc } from '../src/shared/dates.js';

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
  'bikes',
  'parts',
  'stock_movements',
  'suppliers',
  'service_records',
  'service_part_usage',
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

type HttpMethod = 'GET' | 'POST' | 'PATCH';

type RequestFn = (
  path: string,
  method: HttpMethod,
  authHeader?: string,
  body?: unknown,
) => Promise<{ status: number; body: Record<string, unknown> | unknown[] }>;

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
      return { status: response.status, body: text ? JSON.parse(text) : {} };
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

async function seedBike(
  firestore: Firestore,
  overrides: {
    id?: string;
    registrationNumber?: string;
    make?: string;
    model?: string;
    status?: string;
    isArchived?: boolean;
    currentOdometer?: string;
    serviceIntervalDays?: number;
    omitMaintenanceFields?: boolean;
  } = {},
) {
  const id = overrides.id ?? randomUUID();
  const baseDoc: Record<string, unknown> = {
    id,
    registrationNumber: overrides.registrationNumber ?? 'B-101-MOT',
    vin: `VIN-${id.slice(0, 8)}`,
    make: overrides.make ?? 'Honda',
    model: overrides.model ?? 'CB500X',
    status: overrides.status ?? 'AVAILABLE',
    isArchived: overrides.isArchived ?? false,
  };
  if (!overrides.omitMaintenanceFields) {
    baseDoc.currentOdometer = overrides.currentOdometer ?? '1000.00';
    baseDoc.serviceIntervalDays = overrides.serviceIntervalDays ?? 30;
    baseDoc.nextServiceDueDate = null;
  }
  await firestore.collection('bikes').doc(id).set(baseDoc);
  return id;
}

test('Servicing endpoints: 5-route authentication & ROLE_CUSTOMER matrix', async (context) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST ||
    !await reachable(process.env.FIRESTORE_EMULATOR_HOST)) {
    context.skip('Run with the Firestore emulator');
    return;
  }

  const { firestore } = initializeFirebase(config);
  await clearCollections(firestore);

  const ownerId = randomUUID();
  const customerId = randomUUID();
  const inactiveUserId = randomUUID();
  await seedUser(firestore, { id: ownerId, email: 'owner@test.local', fullName: 'Owner', role: 'ROLE_OWNER', authVersion: 2 });
  await seedUser(firestore, { id: customerId, email: 'cust@test.local', fullName: 'Customer', role: 'ROLE_CUSTOMER', authVersion: 1 });
  await seedUser(firestore, { id: inactiveUserId, email: 'inactive@test.local', fullName: 'Inactive', role: 'ROLE_OWNER', isActive: false });

  const revokedOwnerId = randomUUID();
  await seedUser(firestore, {
    id: revokedOwnerId,
    email: 'revoked@test.local',
    fullName: 'Revoked',
    role: 'ROLE_OWNER',
    tokenIssuedBefore: new Date(Date.now() + 60_000),
  });

  const bikeId = await seedBike(firestore);
  const ownerToken = makeToken(ownerId, 'owner@test.local', 'ROLE_OWNER', 2);
  const customerToken = makeToken(customerId, 'cust@test.local', 'ROLE_CUSTOMER', 1);
  const expiredToken = makeToken(ownerId, 'owner@test.local', 'ROLE_OWNER', 2, {
    expiresInSeconds: 10,
    iatOffsetSeconds: -120,
  });
  const wrongSecretToken = makeToken(ownerId, 'owner@test.local', 'ROLE_OWNER', 2, {
    secret: 'wrong-secret-with-more-than-32-characters',
  });
  const staleVersionToken = makeToken(ownerId, 'owner@test.local', 'ROLE_OWNER', 1);
  const revokedIssuedBeforeToken = makeToken(revokedOwnerId, 'revoked@test.local', 'ROLE_OWNER', 0);
  const missingUserToken = makeToken(randomUUID(), 'missing@test.local', 'ROLE_OWNER', 0);
  const inactiveUserToken = makeToken(inactiveUserId, 'inactive@test.local', 'ROLE_OWNER', 0);

  const app = createApp(config, firestore);
  await withServer(app, async (request) => {
    const seedRes = await request('/api/v1/services', 'POST', `Bearer ${ownerToken}`, {
      motorbikeId: bikeId,
      serviceDate: '2026-11-10',
      odometerReading: 1200,
      serviceProvider: 'Moto Shop',
      workPerformed: 'Initial check',
    });
    assert.equal(seedRes.status, 201);
    const serviceId = (seedRes.body as Record<string, unknown>).id as string;

    const routes: Array<{ method: HttpMethod; path: string; body?: unknown }> = [
      {
        method: 'POST',
        path: '/api/v1/services',
        body: {
          motorbikeId: bikeId,
          serviceDate: '2026-11-11',
          odometerReading: 1250,
          serviceProvider: 'Moto Shop',
          workPerformed: 'Follow-up check',
        },
      },
      { method: 'GET', path: `/api/v1/services/${serviceId}` },
      { method: 'GET', path: `/api/v1/services/bike/${bikeId}` },
      { method: 'GET', path: '/api/v1/services' },
      { method: 'GET', path: '/api/v1/services/due' },
    ];

    const badHeaders = [
      undefined,
      'Basic abc123',
      `Bearer ${expiredToken}`,
      `Bearer ${wrongSecretToken}`,
      `Bearer ${staleVersionToken}`,
      `Bearer ${revokedIssuedBeforeToken}`,
      `Bearer ${missingUserToken}`,
      `Bearer ${inactiveUserToken}`,
    ];

    for (const route of routes) {
      for (const header of badHeaders) {
        const res = await request(route.path, route.method, header, route.body);
        assert.equal(res.status, 401, `Expected 401 on ${route.method} ${route.path} with ${header}`);
      }
      // Stage C8.4.3.1: ROLE_CUSTOMER receives 403 FORBIDDEN; ROLE_OWNER succeeds
      const custRes = await request(route.path, route.method, `Bearer ${customerToken}`, route.body);
      assert.equal(custRes.status, 403, `Expected 403 FORBIDDEN for ROLE_CUSTOMER on ${route.method} ${route.path}`);
      assert.equal((custRes.body as Record<string, unknown>).error, 'FORBIDDEN');

      const ownerRes = await request(route.path, route.method, `Bearer ${ownerToken}`, route.body);
      assert.equal(
        ownerRes.status,
        route.method === 'POST' ? 201 : 200,
        `Expected ROLE_OWNER success on ${route.method} ${route.path}`,
      );
    }
  });
});

test('Servicing endpoints: bike guards, odometer monotonicity, due dates, legacy defaults, and atomic failures', async (context) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST ||
    !await reachable(process.env.FIRESTORE_EMULATOR_HOST)) {
    context.skip('Run with the Firestore emulator');
    return;
  }

  const { firestore } = initializeFirebase(config);
  await clearCollections(firestore);

  const userId = randomUUID();
  await seedUser(firestore, { id: userId, email: 'mech@test.local', fullName: 'Chief Mechanic', role: 'ROLE_OWNER' });
  const token = makeToken(userId, 'mech@test.local', 'ROLE_OWNER');

  const archivedBikeId = await seedBike(firestore, {
    registrationNumber: 'B-ARC-01',
    isArchived: true,
    currentOdometer: '5000.00',
  });
  const activeBikeId = await seedBike(firestore, {
    registrationNumber: 'B-ACT-02',
    status: 'RENTED', // Java allows servicing bikes regardless of status
    currentOdometer: '5000.00',
    serviceIntervalDays: 45,
  });
  const legacyBikeId = await seedBike(firestore, {
    registrationNumber: 'B-LEG-03',
    omitMaintenanceFields: true,
  });

  const app = createApp(config, firestore);
  await withServer(app, async (request) => {
    const partCreate = await request('/api/v1/parts', 'POST', `Bearer ${token}`, {
      partCode: 'OIL-10W40',
      name: 'Motul 10W40',
      category: 'OILS',
      initialQuantity: 10,
      minReorderLevel: 2,
      defaultUnitCost: 50,
    });
    assert.equal(partCreate.status, 201);
    const partId = (partCreate.body as Record<string, unknown>).id as string;

    const countsBeforeFailures = await snapshotCounts(firestore);

    // 1. Missing bike -> 404, zero writes
    const missingBikeRes = await request('/api/v1/services', 'POST', `Bearer ${token}`, {
      motorbikeId: randomUUID(),
      serviceDate: '2026-11-10',
      odometerReading: 100,
      serviceProvider: 'Garage',
      workPerformed: 'Oil change',
      partsUsed: [{ partId, quantity: 2 }],
    });
    assert.equal(missingBikeRes.status, 404);

    // 2. Archived bike -> 400, zero writes
    const archivedBikeRes = await request('/api/v1/services', 'POST', `Bearer ${token}`, {
      motorbikeId: archivedBikeId,
      serviceDate: '2026-11-10',
      odometerReading: 6000,
      serviceProvider: 'Garage',
      workPerformed: 'Oil change',
      partsUsed: [{ partId, quantity: 2 }],
    });
    assert.equal(archivedBikeRes.status, 400);

    // 3. Lower odometer than bike.currentOdometer -> 400, zero writes to bike, parts, or movements
    const lowOdoRes = await request('/api/v1/services', 'POST', `Bearer ${token}`, {
      motorbikeId: activeBikeId,
      serviceDate: '2026-11-10',
      odometerReading: 4999.99,
      serviceProvider: 'Garage',
      workPerformed: 'Oil change',
      partsUsed: [{ partId, quantity: 2 }],
    });
    assert.equal(lowOdoRes.status, 400);

    assert.deepEqual(await snapshotCounts(firestore), countsBeforeFailures);
    const partUnchanged = (await firestore.collection('parts').doc(partId).get()).data()!;
    assert.equal(partUnchanged.currentQuantity, '10.00');
    const bikeUnchanged = (await firestore.collection('bikes').doc(activeBikeId).get()).data()!;
    assert.equal(bikeUnchanged.currentOdometer, '5000.00');
    assert.equal(bikeUnchanged.nextServiceDueDate, null);

    // 4. Equal odometer on RENTED bike, omitted nextServiceDueDate -> uses serviceIntervalDays (45)
    const equalOdoRes = await request('/api/v1/services', 'POST', `Bearer ${token}`, {
      motorbikeId: activeBikeId,
      serviceDate: '2026-11-01',
      odometerReading: 5000,
      serviceProvider: 'Garage A',
      workPerformed: 'Inspection',
    });
    assert.equal(equalOdoRes.status, 201);
    const equalDto = equalOdoRes.body as Record<string, unknown>;
    assert.equal(equalDto.nextServiceDueDate, addDays('2026-11-01', 45));
    assert.equal(equalDto.status, 'COMPLETED');
    assert.equal(equalDto.bikeRegistrationNumber, 'B-ACT-02');
    assert.equal(equalDto.motorbikeRegistrationNumber, 'B-ACT-02');
    assert.equal(equalDto.bikeMakeModel, 'Honda CB500X');

    const bikeAfterEqual = (await firestore.collection('bikes').doc(activeBikeId).get()).data()!;
    assert.equal(bikeAfterEqual.currentOdometer, '5000.00');
    assert.equal(bikeAfterEqual.nextServiceDueDate, addDays('2026-11-01', 45));
    assert.equal(bikeAfterEqual.status, 'RENTED'); // status preserved

    // 5. Higher odometer + explicit nextServiceDueDate updates both service_record and bike
    const higherOdoRes = await request('/api/v1/services', 'POST', `Bearer ${token}`, {
      motorbikeId: activeBikeId,
      serviceDate: '2026-11-05',
      odometerReading: 5600.5,
      serviceProvider: 'Garage A',
      workPerformed: 'Chain lube',
      nextServiceDueDate: '2026-12-20',
      nextServiceDueOdometer: 9000,
      notes: 'All good',
    });
    assert.equal(higherOdoRes.status, 201);
    const higherDto = higherOdoRes.body as Record<string, unknown>;
    assert.equal(higherDto.nextServiceDueDate, '2026-12-20');
    assert.equal(higherDto.nextServiceDueOdometer, 9000);
    assert.equal(higherDto.notes, 'All good');

    const bikeAfterHigher = (await firestore.collection('bikes').doc(activeBikeId).get()).data()!;
    assert.equal(bikeAfterHigher.currentOdometer, '5600.50');
    assert.equal(bikeAfterHigher.nextServiceDueDate, '2026-12-20');

    // 6. Legacy C3 bike lacking currentOdometer/serviceIntervalDays defaults safely (0.00 / 30 days)
    const legacyRes = await request('/api/v1/services', 'POST', `Bearer ${token}`, {
      motorbikeId: legacyBikeId,
      serviceDate: '2026-11-10',
      odometerReading: 250,
      serviceProvider: 'Garage B',
      workPerformed: 'First service',
    });
    assert.equal(legacyRes.status, 201);
    const legacyDto = legacyRes.body as Record<string, unknown>;
    assert.equal(legacyDto.nextServiceDueDate, addDays('2026-11-10', 30));
    const legacyBikeAfter = (await firestore.collection('bikes').doc(legacyBikeId).get()).data()!;
    assert.equal(legacyBikeAfter.currentOdometer, '250.00');
    assert.equal(legacyBikeAfter.nextServiceDueDate, addDays('2026-11-10', 30));
  });
});

test('Servicing endpoints: all 4 statuses deduct stock, currency isolation, duplicate partId aggregation, rollback & SERVICE_USAGE ledger', async (context) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST ||
    !await reachable(process.env.FIRESTORE_EMULATOR_HOST)) {
    context.skip('Run with the Firestore emulator');
    return;
  }

  const { firestore } = initializeFirebase(config);
  await clearCollections(firestore);

  const userId = randomUUID();
  await seedUser(firestore, { id: userId, email: 'mech@test.local', fullName: 'Radu Mechanic', role: 'ROLE_OWNER' });
  const token = makeToken(userId, 'mech@test.local', 'ROLE_OWNER');
  const bikeId = await seedBike(firestore, { currentOdometer: '1000.00' });

  const app = createApp(config, firestore);
  await withServer(app, async (request) => {
    const createPart = async (code: string, name: string, qty: number, reorder: number, cost: number, currency = 'RON') => {
      const res = await request('/api/v1/parts', 'POST', `Bearer ${token}`, {
        partCode: code,
        name,
        category: 'ENGINE',
        initialQuantity: qty,
        minReorderLevel: reorder,
        defaultUnitCost: cost,
        costCurrency: currency,
      });
      assert.equal(res.status, 201);
      return (res.body as Record<string, unknown>).id as string;
    };

    const partRonId = await createPart('FILT-01', 'Oil Filter', 10, 2, 10.05, 'RON');
    const partEurId = await createPart('CHAIN-EUR', 'Chain Kit', 10, 2, 50, 'EUR');
    const partArchivedId = await createPart('OLD-01', 'Archived Gasket', 5, 1, 10, 'RON');
    await request(`/api/v1/parts/${partArchivedId}/archive`, 'POST', `Bearer ${token}`);

    // All 4 statuses deduct parts & emit SERVICE_USAGE ledger entries
    const statuses = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
    for (let idx = 0; idx < statuses.length; idx += 1) {
      const status = statuses[idx]!;
      const res = await request('/api/v1/services', 'POST', `Bearer ${token}`, {
        motorbikeId: bikeId,
        serviceDate: `2026-11-0${idx + 1}`,
        odometerReading: 1000 + idx * 100,
        serviceProvider: 'Workshop',
        workPerformed: `Step ${status}`,
        status,
        labourCost: 100,
        labourCurrency: 'RON',
        partsUsed: [
          { partId: partRonId, quantity: 1.25 },
          { partId: partEurId, quantity: 1, currency: 'EUR' },
        ],
      });
      assert.equal(res.status, 201);
      const dto = res.body as Record<string, unknown>;
      assert.equal(dto.status, status);
      const usages = dto.partsUsed as Array<Record<string, unknown>>;
      assert.equal(usages.length, 2);
      assert.equal(usages[0]?.totalCost, 12.5625);
      assert.equal(usages[1]?.totalCost, 50);
      // EUR part excluded from RON partsCost
      assert.equal(dto.partsCost, 12.5625);
      assert.equal(dto.totalCost, 112.5625);
    }

    // 4 services * 1.25 = 5.00 used -> 5.00 remaining on FILT-01
    const filtAfter4 = (await firestore.collection('parts').doc(partRonId).get()).data()!;
    assert.equal(filtAfter4.currentQuantity, '5.00');

    // Stage C8.4.2: omitted currency on an EUR part defaults to 'RON' per Java LogServicePartItem
    const omittedCurrencyRes = await request('/api/v1/services', 'POST', `Bearer ${token}`, {
      motorbikeId: bikeId,
      serviceDate: '2026-11-06',
      odometerReading: 1500,
      serviceProvider: 'Workshop',
      workPerformed: 'Omitted currency defaults to RON',
      labourCost: 100,
      labourCurrency: 'RON',
      partsUsed: [{ partId: partEurId, quantity: 1 }],
    });
    assert.equal(omittedCurrencyRes.status, 201);
    const omittedDto = omittedCurrencyRes.body as Record<string, unknown>;
    const omittedUsages = omittedDto.partsUsed as Array<Record<string, unknown>>;
    assert.equal(omittedUsages[0]?.currency, 'RON');
    assert.equal(omittedDto.partsCost, 50);
    assert.equal(omittedDto.totalCost, 150);
    assert.equal(filtAfter4.currentQuantityMinor, 500);
    assert.equal(filtAfter4.isLowStock, false);

    // Duplicate partId exceeding cumulative stock ([3.00, 3.00] = 6.00 > 5.00) -> 400 and ZERO writes
    const preFailCounts = await snapshotCounts(firestore);
    const bikePreFail = (await firestore.collection('bikes').doc(bikeId).get()).data()!;
    const dupOverdraft = await request('/api/v1/services', 'POST', `Bearer ${token}`, {
      motorbikeId: bikeId,
      serviceDate: '2026-11-08',
      odometerReading: 2000,
      serviceProvider: 'Workshop',
      workPerformed: 'Overdraft test',
      partsUsed: [
        { partId: partRonId, quantity: 3 },
        { partId: partRonId, quantity: 3 },
      ],
    });
    assert.equal(dupOverdraft.status, 400);
    assert.deepEqual(await snapshotCounts(firestore), preFailCounts);
    assert.equal((await firestore.collection('parts').doc(partRonId).get()).data()!.currentQuantity, '5.00');
    assert.equal((await firestore.collection('bikes').doc(bikeId).get()).data()!.currentOdometer, bikePreFail.currentOdometer);

    // Archived part or missing part rollback -> zero partial writes (even with valid FILT-01 paired alongside)
    const archivedPartFail = await request('/api/v1/services', 'POST', `Bearer ${token}`, {
      motorbikeId: bikeId,
      serviceDate: '2026-11-08',
      odometerReading: 2000,
      serviceProvider: 'Workshop',
      workPerformed: 'Archived part test',
      partsUsed: [
        { partId: partRonId, quantity: 1 },
        { partId: partArchivedId, quantity: 1 },
      ],
    });
    assert.equal(archivedPartFail.status, 400);
    assert.deepEqual(await snapshotCounts(firestore), preFailCounts);

    const missingPartFail = await request('/api/v1/services', 'POST', `Bearer ${token}`, {
      motorbikeId: bikeId,
      serviceDate: '2026-11-08',
      odometerReading: 2000,
      serviceProvider: 'Workshop',
      workPerformed: 'Missing part test',
      partsUsed: [
        { partId: partRonId, quantity: 1 },
        { partId: randomUUID(), quantity: 1 },
      ],
    });
    assert.equal(missingPartFail.status, 404);
    assert.deepEqual(await snapshotCounts(firestore), preFailCounts);

    // Valid duplicate partId lines ([2.00 @ 10, 1.50 @ 12] = 3.50 <= 5.00 -> remaining 1.50 <= reorder 2.00 -> isLowStock=true)
    const validDupRes = await request('/api/v1/services', 'POST', `Bearer ${token}`, {
      motorbikeId: bikeId,
      serviceDate: '2026-11-09',
      odometerReading: 1500,
      serviceProvider: 'Workshop',
      workPerformed: 'Duplicate valid',
      labourCost: 50,
      partsUsed: [
        { partId: partRonId, quantity: 2, unitCost: 10 },
        { partId: partRonId, quantity: 1.5, unitCost: 12 },
      ],
    });
    assert.equal(validDupRes.status, 201);
    const validDupDto = validDupRes.body as Record<string, unknown>;
    const validDupId = validDupDto.id as string;
    assert.equal(validDupDto.partsCost, 38);
    assert.equal(validDupDto.totalCost, 88);

    const filtFinal = (await firestore.collection('parts').doc(partRonId).get()).data()!;
    assert.equal(filtFinal.currentQuantity, '1.50');
    assert.equal(filtFinal.currentQuantityMinor, 150);
    assert.equal(filtFinal.isLowStock, true);

    const usagesSnap = await firestore
      .collection('service_part_usage')
      .where('serviceRecordId', '==', validDupId)
      .get();
    assert.equal(usagesSnap.size, 2);

    const movementsRes = await request(`/api/v1/stock-movements/part/${partRonId}`, 'GET', `Bearer ${token}`);
    assert.equal(movementsRes.status, 200);
    const serviceMovements = (movementsRes.body as Array<Record<string, unknown>>).filter(
      (m) => m.referenceId === validDupId,
    );
    assert.equal(serviceMovements.length, 2);
    for (const mov of serviceMovements) {
      assert.equal(mov.movementType, 'SERVICE_USAGE');
      assert.equal(mov.referenceType, 'SERVICE_RECORD');
      assert.equal(mov.recordedByUserName, 'Radu Mechanic');
      assert.equal(mov.reason, 'Used in service on motorbike B-101-MOT');
    }
    const deltas = serviceMovements.map((m) => m.quantityDelta).sort((a, b) => Number(a) - Number(b));
    assert.deepEqual(deltas, [-2, -1.5]);
  });
});

test('Servicing endpoints: concurrency contention, transaction limits (422), and routes 54-57 queries + precedence', async (context) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST ||
    !await reachable(process.env.FIRESTORE_EMULATOR_HOST)) {
    context.skip('Run with the Firestore emulator');
    return;
  }

  const { firestore } = initializeFirebase(config);
  await clearCollections(firestore);

  const userId = randomUUID();
  await seedUser(firestore, { id: userId, email: 'ops@test.local', fullName: 'Ops User', role: 'ROLE_OWNER' });
  const token = makeToken(userId, 'ops@test.local', 'ROLE_OWNER');

  const bike1Id = await seedBike(firestore, { registrationNumber: 'B-01-CON', currentOdometer: '1000.00' });
  const bike2Id = await seedBike(firestore, { registrationNumber: 'B-02-CON', currentOdometer: '2000.00', isArchived: true });

  const app = createApp(config, firestore);
  await withServer(app, async (request) => {
    const partCreate = await request('/api/v1/parts', 'POST', `Bearer ${token}`, {
      partCode: 'SPARK-01',
      name: 'Spark Plug',
      category: 'IGNITION',
      initialQuantity: 5,
      minReorderLevel: 1,
      defaultUnitCost: 25,
    });
    assert.equal(partCreate.status, 201);
    const partId = (partCreate.body as Record<string, unknown>).id as string;

    // 1. Concurrent competing services each requesting 3 out of 5 -> 1 succeeds (201), 1 fails (400), remaining 2.00
    const [race1, race2] = await Promise.all([
      request('/api/v1/services', 'POST', `Bearer ${token}`, {
        motorbikeId: bike1Id,
        serviceDate: '2026-11-10',
        odometerReading: 1100,
        serviceProvider: 'Shop A',
        workPerformed: 'Plugs A',
        nextServiceDueDate: '2026-11-25',
        partsUsed: [{ partId, quantity: 3 }],
      }),
      request('/api/v1/services', 'POST', `Bearer ${token}`, {
        motorbikeId: bike1Id,
        serviceDate: '2026-11-12',
        odometerReading: 1200,
        serviceProvider: 'Shop B',
        workPerformed: 'Plugs B',
        nextServiceDueDate: '2026-11-28',
        partsUsed: [{ partId, quantity: 3 }],
      }),
    ]);

    const raceStatuses = [race1.status, race2.status].sort((a, b) => a - b);
    assert.deepEqual(raceStatuses, [201, 400]);

    const partAfterRace = (await firestore.collection('parts').doc(partId).get()).data()!;
    assert.equal(partAfterRace.currentQuantity, '2.00');
    const recordsAfterRace = await firestore.collection('service_records').get();
    assert.equal(recordsAfterRace.size, 1);

    // 2. Safeguard > 50 partsUsed items -> 422 before writes
    const oversizedParts = Array.from({ length: 51 }, () => ({ partId, quantity: 0.01 }));
    const overRes = await request('/api/v1/services', 'POST', `Bearer ${token}`, {
      motorbikeId: bike1Id,
      serviceDate: '2026-11-14',
      odometerReading: 1500,
      serviceProvider: 'Shop C',
      workPerformed: 'Too many parts',
      partsUsed: oversizedParts,
    });
    assert.equal(overRes.status, 422);

    // 3. Seed additional services with different dates, statuses, due dates (including null) & test Routes 54-57
    const today = todayUtc();
    const svcPlannedRes = await request('/api/v1/services', 'POST', `Bearer ${token}`, {
      motorbikeId: bike1Id,
      serviceDate: '2026-11-15',
      odometerReading: 1300,
      serviceProvider: 'Shop C',
      workPerformed: 'Planned valve check',
      labourCost: 300,
      status: 'PLANNED',
      nextServiceDueDate: today,
    });
    assert.equal(svcPlannedRes.status, 201);
    const plannedId = (svcPlannedRes.body as Record<string, unknown>).id as string;

    // Seed one service on bike2 directly with nextServiceDueDate: null and one future due date to verify /due filtering
    const nullDueId = randomUUID();
    const futureDueId = randomUUID();
    const nowTs = Timestamp.now();
    await firestore.collection('service_records').doc(nullDueId).set({
      id: nullDueId,
      bikeId: bike2Id,
      bikeRegistrationNumber: 'B-02-CON',
      bikeMakeModel: 'Honda CB500X',
      serviceDate: '2026-11-05',
      odometerReading: '2000.00',
      serviceProvider: 'Archive Shop',
      workPerformed: 'Pre-archive work',
      labourCost: '50.00',
      labourCurrency: 'RON',
      partsCost: '0.00',
      totalCost: '50.00',
      status: 'CANCELLED',
      nextServiceDueDate: null,
      nextServiceDueOdometer: null,
      notes: null,
      partsUsed: [],
      recordedByUserId: userId,
      recordedByUserName: 'Ops User',
      createdAt: nowTs,
      updatedAt: nowTs,
    });
    await firestore.collection('service_records').doc(futureDueId).set({
      id: futureDueId,
      bikeId: bike2Id,
      bikeRegistrationNumber: 'B-02-CON',
      bikeMakeModel: 'Honda CB500X',
      serviceDate: '2026-11-18',
      odometerReading: '2050.00',
      serviceProvider: 'Future Shop',
      workPerformed: 'Scheduled future service',
      labourCost: '75.00',
      labourCurrency: 'RON',
      partsCost: '0.00',
      totalCost: '75.00',
      status: 'IN_PROGRESS',
      nextServiceDueDate: '2029-01-01',
      nextServiceDueOdometer: null,
      notes: null,
      partsUsed: [],
      recordedByUserId: userId,
      recordedByUserName: 'Ops User',
      createdAt: nowTs,
      updatedAt: nowTs,
    });

    // Route 54: GET /api/v1/services/{id}
    const getOne = await request(`/api/v1/services/${plannedId}`, 'GET', `Bearer ${token}`);
    assert.equal(getOne.status, 200);
    assert.equal((getOne.body as Record<string, unknown>).id, plannedId);

    const getMissing = await request(`/api/v1/services/${randomUUID()}`, 'GET', `Bearer ${token}`);
    assert.equal(getMissing.status, 404);

    // Route 55 & route precedence: GET /bike/:bikeId before /:id
    const bike1History = await request(`/api/v1/services/bike/${bike1Id}`, 'GET', `Bearer ${token}`);
    assert.equal(bike1History.status, 200);
    const bike1Items = bike1History.body as Array<Record<string, unknown>>;
    assert.equal(bike1Items.length, 2);
    assert.ok(String(bike1Items[0]?.serviceDate) >= String(bike1Items[1]?.serviceDate));

    const unknownBikeHistory = await request(`/api/v1/services/bike/${randomUUID()}`, 'GET', `Bearer ${token}`);
    assert.equal(unknownBikeHistory.status, 200);
    assert.deepEqual(unknownBikeHistory.body, []);

    const badBikeIdRes = await request('/api/v1/services/bike/not-a-uuid', 'GET', `Bearer ${token}`);
    assert.equal(badBikeIdRes.status, 400);

    // Route 56: GET /api/v1/services search, filter, sort, pagination
    const page1 = await request('/api/v1/services?page=0&size=2&sort=serviceDate,ASC', 'GET', `Bearer ${token}`);
    assert.equal(page1.status, 200);
    const page1Body = page1.body as Record<string, unknown>;
    assert.equal(page1Body.totalElements, 4);
    assert.equal(page1Body.totalPages, 2);
    assert.equal(page1Body.last, false);
    assert.equal((page1Body.content as unknown[]).length, 2);

    const filteredPlanned = await request(
      `/api/v1/services?bikeId=${bike1Id}&status=PLANNED&startDate=2026-11-14&endDate=2026-11-16`,
      'GET',
      `Bearer ${token}`,
    );
    assert.equal(filteredPlanned.status, 200);
    assert.equal((filteredPlanned.body as Record<string, unknown>).totalElements, 1);

    const customSortRes = await request('/api/v1/services?sort=labourCost,DESC', 'GET', `Bearer ${token}`);
    assert.equal(customSortRes.status, 200);
    const sortedContent = (customSortRes.body as Record<string, unknown>).content as Array<Record<string, unknown>>;
    assert.equal(sortedContent[0]?.id, plannedId);

    // Route 57 & precedence: GET /api/v1/services/due (default asOfDate = todayUtc + explicit future targetDate)
    const dueDefault = await request('/api/v1/services/due', 'GET', `Bearer ${token}`);
    assert.equal(dueDefault.status, 200);
    const dueDefaultItems = dueDefault.body as Array<Record<string, unknown>>;
    // Includes bike1 race service (due 2026-11-25/28) if today >= due, or at least plannedId (due today) if today >= 2026-11-28.
    assert.ok(dueDefaultItems.some((item) => item.id === plannedId), 'today service due must be returned by default /due');
    assert.ok(!dueDefaultItems.some((item) => item.id === nullDueId), 'null due dates must never appear in /due');
    assert.ok(!dueDefaultItems.some((item) => item.id === futureDueId), '2029 future due date must not appear in today /due');

    const dueExplicit = await request('/api/v1/services/due?asOfDate=2029-12-31', 'GET', `Bearer ${token}`);
    assert.equal(dueExplicit.status, 200);
    const dueExplicitItems = dueExplicit.body as Array<Record<string, unknown>>;
    // All 3 non-null nextServiceDueDate records in ASC order, still excluding nullDueId
    assert.equal(dueExplicitItems.length, 3);
    assert.ok(!dueExplicitItems.some((item) => item.id === nullDueId));
    assert.ok(String(dueExplicitItems[0]?.nextServiceDueDate) <= String(dueExplicitItems[1]?.nextServiceDueDate));
    assert.ok(String(dueExplicitItems[1]?.nextServiceDueDate) <= String(dueExplicitItems[2]?.nextServiceDueDate));

    // 4. Seed > MAX_SEARCH_SCAN_DOCS (1001 docs) to verify custom sort scan cap returns 422
    const seedDocs = 1001;
    for (let offset = 0; offset < seedDocs; offset += 500) {
      const batch = firestore.batch();
      const end = Math.min(offset + 500, seedDocs);
      for (let i = offset; i < end; i += 1) {
        const docId = `scan-${i}`;
        batch.set(firestore.collection('service_records').doc(docId), {
          id: docId,
          bikeId: bike2Id,
          bikeRegistrationNumber: 'B-02-CON',
          bikeMakeModel: 'Honda CB500X',
          serviceDate: '2026-01-01',
          odometerReading: '100.00',
          serviceProvider: 'Bulk Shop',
          workPerformed: 'Bulk entry',
          labourCost: '10.00',
          labourCurrency: 'RON',
          partsCost: '0.00',
          totalCost: '10.00',
          status: 'COMPLETED',
          nextServiceDueDate: null,
          nextServiceDueOdometer: null,
          notes: null,
          partsUsed: [],
          recordedByUserId: userId,
          recordedByUserName: 'Ops User',
          createdAt: nowTs,
          updatedAt: nowTs,
        });
      }
      await batch.commit();
    }

    const boundedScanExceeded = await request('/api/v1/services?sort=labourCost,DESC', 'GET', `Bearer ${token}`);
    assert.equal(boundedScanExceeded.status, 422);

    // Default indexed serviceDate query still succeeds past 1000 docs via Firestore count() + cursor pagination
    const indexedPast1000 = await request('/api/v1/services?page=0&size=5', 'GET', `Bearer ${token}`);
    assert.equal(indexedPast1000.status, 200);
    assert.equal((indexedPast1000.body as Record<string, unknown>).totalElements, 1005);

    // 5. Status management: PATCH /api/v1/services/:id/status
    await clearCollections(firestore);
    await seedUser(firestore, { id: userId, email: 'ops@test.local', fullName: 'Ops User', role: 'ROLE_OWNER' });
    const statusBikeId = await seedBike(firestore, { registrationNumber: 'B-55-STS', currentOdometer: '5000.00', serviceIntervalDays: 90 });
    const partRes = await request('/api/v1/parts', 'POST', `Bearer ${token}`, {
      partCode: 'FLT-55',
      name: 'Oil Filter 55',
      category: 'FILTERS',
      initialQuantity: 10,
      minReorderLevel: 2,
      defaultUnitCost: 45,
      costCurrency: 'RON',
    });
    assert.equal(partRes.status, 201);
    const statusPartId = String((partRes.body as Record<string, unknown>).id);

    const plannedCreate = await request('/api/v1/services', 'POST', `Bearer ${token}`, {
      motorbikeId: statusBikeId,
      serviceDate: '2026-11-12',
      odometerReading: 5100,
      serviceProvider: 'Moto Clinic',
      workPerformed: 'Scheduled oil change',
      labourCost: 120,
      labourCurrency: 'RON',
      status: 'PLANNED',
      nextServiceDueDate: '2027-02-12',
      nextServiceDueOdometer: 10000,
      notes: 'Preserve this note',
      partsUsed: [{ partId: statusPartId, quantity: 2 }],
    });
    assert.equal(plannedCreate.status, 201);
    const createdPlanned = plannedCreate.body as Record<string, unknown>;
    const plannedServiceId = String(createdPlanned.id);
    assert.equal(createdPlanned.status, 'PLANNED');
    assert.equal(createdPlanned.completedAt, null);

    const inProgressCreate = await request('/api/v1/services', 'POST', `Bearer ${token}`, {
      motorbikeId: statusBikeId,
      serviceDate: '2026-11-13',
      odometerReading: 5200,
      serviceProvider: 'Moto Clinic',
      workPerformed: 'Brake check',
      labourCost: 80,
      labourCurrency: 'RON',
      status: 'IN_PROGRESS',
    });
    assert.equal(inProgressCreate.status, 201);
    const inProgressServiceId = String((inProgressCreate.body as Record<string, unknown>).id);

    const cancelledCreate = await request('/api/v1/services', 'POST', `Bearer ${token}`, {
      motorbikeId: statusBikeId,
      serviceDate: '2026-11-14',
      odometerReading: 5200,
      serviceProvider: 'Moto Clinic',
      workPerformed: 'Cancelled check',
      labourCost: 0,
      labourCurrency: 'RON',
      status: 'CANCELLED',
    });
    assert.equal(cancelledCreate.status, 201);
    const cancelledServiceId = String((cancelledCreate.body as Record<string, unknown>).id);

    const partBeforePatch = await firestore.collection('parts').doc(statusPartId).get();
    const movementsBeforePatch = await firestore.collection('stock_movements').count().get();
    const recordsCountBeforePatch = await firestore.collection('service_records').count().get();

    // PLANNED -> COMPLETED succeeds
    const completePlanned = await request(
      `/api/v1/services/${plannedServiceId}/status`,
      'PATCH',
      `Bearer ${token}`,
      { status: 'COMPLETED' },
    );
    assert.equal(completePlanned.status, 200);
    const completedPlannedDto = completePlanned.body as Record<string, unknown>;
    assert.equal(completedPlannedDto.status, 'COMPLETED');
    assert.equal(typeof completedPlannedDto.completedAt, 'string');
    assert.ok(!Number.isNaN(Date.parse(String(completedPlannedDto.completedAt))));
    assert.equal(completedPlannedDto.serviceDate, '2026-11-12');
    assert.equal(completedPlannedDto.nextServiceDueDate, '2027-02-12');
    assert.equal(completedPlannedDto.nextServiceDueOdometer, 10000);
    assert.equal(completedPlannedDto.labourCost, 120);
    assert.equal(completedPlannedDto.partsCost, 90);
    assert.equal(completedPlannedDto.totalCost, 210);
    assert.equal(completedPlannedDto.notes, 'Preserve this note');
    assert.equal((completedPlannedDto.partsUsed as unknown[]).length, 1);

    // Persisted in Firestore & GET /:id
    const fetchedPlanned = await request(`/api/v1/services/${plannedServiceId}`, 'GET', `Bearer ${token}`);
    assert.equal(fetchedPlanned.status, 200);
    assert.equal((fetchedPlanned.body as Record<string, unknown>).status, 'COMPLETED');
    assert.equal((fetchedPlanned.body as Record<string, unknown>).completedAt, completedPlannedDto.completedAt);

    // IN_PROGRESS -> COMPLETED succeeds
    const completeInProgress = await request(
      `/api/v1/services/${inProgressServiceId}/status`,
      'PATCH',
      `Bearer ${token}`,
      { status: 'COMPLETED' },
    );
    assert.equal(completeInProgress.status, 200);
    assert.equal((completeInProgress.body as Record<string, unknown>).status, 'COMPLETED');
    assert.equal(typeof (completeInProgress.body as Record<string, unknown>).completedAt, 'string');

    // COMPLETED -> COMPLETED rejected (400)
    const repeatComplete = await request(
      `/api/v1/services/${plannedServiceId}/status`,
      'PATCH',
      `Bearer ${token}`,
      { status: 'COMPLETED' },
    );
    assert.equal(repeatComplete.status, 400);

    // CANCELLED -> COMPLETED rejected (400)
    const completeCancelled = await request(
      `/api/v1/services/${cancelledServiceId}/status`,
      'PATCH',
      `Bearer ${token}`,
      { status: 'COMPLETED' },
    );
    assert.equal(completeCancelled.status, 400);

    // Nonexistent service ID -> 404; invalid UUID -> 400
    const missingService = await request(
      `/api/v1/services/${randomUUID()}/status`,
      'PATCH',
      `Bearer ${token}`,
      { status: 'COMPLETED' },
    );
    assert.equal(missingService.status, 404);

    const invalidId = await request(
      '/api/v1/services/not-a-uuid/status',
      'PATCH',
      `Bearer ${token}`,
      { status: 'COMPLETED' },
    );
    assert.equal(invalidId.status, 400);

    // Invalid request bodies -> 400
    for (const badBody of [
      {},
      { status: 'PLANNED' },
      { status: 'CANCELLED' },
      { status: 'DONE' },
      { status: 'COMPLETED', extra: 1 },
    ]) {
      const badRes = await request(
        `/api/v1/services/${inProgressServiceId}/status`,
        'PATCH',
        `Bearer ${token}`,
        badBody,
      );
      assert.equal(badRes.status, 400);
    }

    // No stock quantity changes, no additional stock movements, and no extra service_records created
    const partAfterPatch = await firestore.collection('parts').doc(statusPartId).get();
    const movementsAfterPatch = await firestore.collection('stock_movements').count().get();
    const recordsCountAfterPatch = await firestore.collection('service_records').count().get();
    assert.equal(partAfterPatch.data()?.currentQuantity, partBeforePatch.data()?.currentQuantity);
    assert.equal(movementsAfterPatch.data().count, movementsBeforePatch.data().count);
    assert.equal(recordsCountAfterPatch.data().count, recordsCountBeforePatch.data().count);
  });
});
