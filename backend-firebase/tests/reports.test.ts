import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { createApp } from '../src/app.js';
import { parseEnvironment } from '../src/config/env.js';
import { initializeFirebase } from '../src/config/firebase.js';
import { ReportsRepository } from '../src/reports/reports.repository.js';
import { addDays, todayUtc } from '../src/shared/dates.js';
import { UnprocessableEntityError } from '../src/shared/errors.js';

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
  'payments',
  'parts',
  'stock_movements',
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

type HttpMethod = 'GET' | 'POST';

type RequestFn = (
  path: string,
  method?: HttpMethod,
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
    const request: RequestFn = async (path, method = 'GET', authHeader, body) => {
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
  } = {},
): Promise<string> {
  const id = overrides.id ?? randomUUID();
  const now = Timestamp.fromDate(new Date());
  await firestore.collection('bikes').doc(id).set({
    id,
    registrationNumber: overrides.registrationNumber ?? `B-${id.slice(0, 5)}`,
    vin: `VIN-${id.slice(0, 8)}`,
    make: overrides.make ?? 'Honda',
    model: overrides.model ?? 'CB500X',
    status: overrides.status ?? 'AVAILABLE',
    isArchived: overrides.isArchived ?? false,
    currentOdometer: '1000.00',
    serviceIntervalDays: 30,
    nextServiceDueDate: null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

test('Reports endpoints: 4-route auth matrix & ROLE_CUSTOMER parity + empty-data defaults', async (context) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST ||
    !await reachable(process.env.FIRESTORE_EMULATOR_HOST)) {
    context.skip('Run with the Firestore emulator');
    return;
  }

  const { firestore } = initializeFirebase(config);
  await clearCollections(firestore);

  const ownerId = randomUUID();
  const customerUserId = randomUUID();
  const inactiveUserId = randomUUID();
  const revokedOwnerId = randomUUID();

  await seedUser(firestore, { id: ownerId, email: 'owner@reports.local', fullName: 'Owner', role: 'ROLE_OWNER', authVersion: 2 });
  await seedUser(firestore, { id: customerUserId, email: 'customer@reports.local', fullName: 'Customer', role: 'ROLE_CUSTOMER', authVersion: 1 });
  await seedUser(firestore, { id: inactiveUserId, email: 'inactive@reports.local', fullName: 'Inactive', role: 'ROLE_OWNER', isActive: false });
  await seedUser(firestore, {
    id: revokedOwnerId,
    email: 'revoked@reports.local',
    fullName: 'Revoked',
    role: 'ROLE_OWNER',
    tokenIssuedBefore: new Date(Date.now() + 60_000),
  });

  const emptyBikeId = await seedBike(firestore, {
    registrationNumber: 'B-00-EMP',
    make: 'Honda',
    model: 'NX500',
    status: 'INACTIVE',
    isArchived: true, // Keeps active fleet empty while providing valid bikeId for /bike-roi/:bikeId
  });

  const ownerToken = makeToken(ownerId, 'owner@reports.local', 'ROLE_OWNER', 2);
  const customerToken = makeToken(customerUserId, 'customer@reports.local', 'ROLE_CUSTOMER', 1);
  const expiredToken = makeToken(ownerId, 'owner@reports.local', 'ROLE_OWNER', 2, { expiresInSeconds: 10, iatOffsetSeconds: -120 });
  const wrongSecretToken = makeToken(ownerId, 'owner@reports.local', 'ROLE_OWNER', 2, { secret: 'wrong-secret-with-more-than-32-characters' });
  const staleVersionToken = makeToken(ownerId, 'owner@reports.local', 'ROLE_OWNER', 1);
  const revokedToken = makeToken(revokedOwnerId, 'revoked@reports.local', 'ROLE_OWNER', 0);
  const missingUserToken = makeToken(randomUUID(), 'missing@reports.local', 'ROLE_OWNER', 0);
  const inactiveToken = makeToken(inactiveUserId, 'inactive@reports.local', 'ROLE_OWNER', 0);

  const app = createApp(config, firestore);
  await withServer(app, async (request) => {
    const routes = [
      '/api/v1/reports/dashboard',
      '/api/v1/reports/fleet-utilization',
      '/api/v1/reports/date-range?fromDate=2026-06-01&toDate=2026-06-30',
      `/api/v1/reports/bike-roi/${emptyBikeId}`,
    ];

    for (const path of routes) {
      for (const badAuth of [
        undefined,
        'Basic abc',
        `Bearer ${expiredToken}`,
        `Bearer ${wrongSecretToken}`,
        `Bearer ${staleVersionToken}`,
        `Bearer ${revokedToken}`,
        `Bearer ${missingUserToken}`,
        `Bearer ${inactiveToken}`,
      ]) {
        const res = await request(path, 'GET', badAuth);
        assert.equal(res.status, 401, `Expected 401 on ${path}`);
      }

      // Both ROLE_OWNER and ROLE_CUSTOMER succeed (no ownerMiddleware)
      const ownerRes = await request(path, 'GET', `Bearer ${ownerToken}`);
      assert.equal(ownerRes.status, 200, `Expected 200 for ROLE_OWNER on ${path}`);
      const customerRes = await request(path, 'GET', `Bearer ${customerToken}`);
      assert.equal(customerRes.status, 200, `Expected 200 for ROLE_CUSTOMER on ${path}`);
    }

    // Empty-data assertions across all 4 DTOs
    const dashEmpty = await request('/api/v1/reports/dashboard', 'GET', `Bearer ${ownerToken}`);
    assert.deepEqual(dashEmpty.body, {
      activeRentalsCount: 0,
      availableBikesCount: 0,
      inServiceBikesCount: 0,
      totalFleetCount: 0,
      overdueChargesCount: 0,
      lowStockPartsCount: 0,
      monthlyRevenue: { RON: 0, EUR: 0, USD: 0 },
      monthlyExpenses: { RON: 0, EUR: 0, USD: 0 },
    });

    const utilEmpty = await request('/api/v1/reports/fleet-utilization', 'GET', `Bearer ${ownerToken}`);
    assert.deepEqual(utilEmpty.body, {
      totalBikes: 0,
      rentedBikes: 0,
      availableBikes: 0,
      inMaintenanceBikes: 0,
      utilizationRate: 0,
    });

    const dateRangeEmpty = await request(
      '/api/v1/reports/date-range?fromDate=2026-06-01&toDate=2026-06-30',
      'GET',
      `Bearer ${ownerToken}`,
    );
    assert.deepEqual(dateRangeEmpty.body, {
      totalRentals: 0,
      activeRentals: 0,
      closedRentals: 0,
      serviceCount: 0,
      revenue: { RON: 0, EUR: 0, USD: 0 },
      labourCost: { RON: 0, EUR: 0, USD: 0 },
      sparePartsCost: { RON: 0, EUR: 0, USD: 0 },
      stockInQuantity: { TOTAL: 0 },
      stockOutQuantity: { TOTAL: 0 },
      stockInCost: { RON: 0, EUR: 0, USD: 0 },
      stockOutCost: { RON: 0, EUR: 0, USD: 0 },
    });

    const roiEmpty = await request(`/api/v1/reports/bike-roi/${emptyBikeId}`, 'GET', `Bearer ${ownerToken}`);
    assert.deepEqual(roiEmpty.body, {
      bikeId: emptyBikeId,
      registrationNumber: 'B-00-EMP',
      makeModel: 'Honda NX500',
      totalRevenue: { RON: 0, EUR: 0, USD: 0 },
      totalMaintenanceCost: { RON: 0, EUR: 0, USD: 0 },
      netProfit: { RON: 0, EUR: 0, USD: 0 },
    });
  });
});

test('Reports endpoints: dashboard KPIs, fleet utilization, date-range aggregation, and validation', async (context) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST ||
    !await reachable(process.env.FIRESTORE_EMULATOR_HOST)) {
    context.skip('Run with the Firestore emulator');
    return;
  }

  const { firestore } = initializeFirebase(config);
  await clearCollections(firestore);

  const ownerId = randomUUID();
  await seedUser(firestore, { id: ownerId, email: 'owner@reports.local', fullName: 'Owner', role: 'ROLE_OWNER' });
  const ownerToken = makeToken(ownerId, 'owner@reports.local', 'ROLE_OWNER', 0);

  const today = todayUtc();
  const monthStart = `${today.slice(0, 8)}01`;
  const previousMonthDate = addDays(monthStart, -1);
  const tomorrow = addDays(today, 1);
  const nowTs = Timestamp.fromDate(new Date());

  // Seed 5 bikes: 1 AVAILABLE, 1 RENTED, 1 IN_SERVICE, 1 INACTIVE (non-archived), 1 archived RENTED
  const availableBikeId = await seedBike(firestore, { status: 'AVAILABLE', registrationNumber: 'B-01-AVL' });
  const rentedBikeId = await seedBike(firestore, { status: 'RENTED', registrationNumber: 'B-02-RNT' });
  await seedBike(firestore, { status: 'IN_SERVICE', registrationNumber: 'B-03-SRV' });
  await seedBike(firestore, { status: 'INACTIVE', registrationNumber: 'B-04-INA' });
  await seedBike(firestore, { status: 'RENTED', isArchived: true, registrationNumber: 'B-05-ARC' });

  // Seed overdue & non-overdue rental_charges (expect 2 overdue: UNPAID <= today + PARTIALLY_PAID <= today)
  const customerId = randomUUID();
  const chargeSeeds = [
    { id: randomUUID(), status: 'UNPAID', dueDate: previousMonthDate },
    { id: randomUUID(), status: 'PARTIALLY_PAID', dueDate: today },
    { id: randomUUID(), status: 'UNPAID', dueDate: tomorrow },
    { id: randomUUID(), status: 'PAID', dueDate: previousMonthDate },
    { id: randomUUID(), status: 'CANCELLED', dueDate: previousMonthDate },
  ];
  for (let idx = 0; idx < chargeSeeds.length; idx += 1) {
    const c = chargeSeeds[idx]!;
    await firestore.collection('rental_charges').doc(c.id).set({
      rentalId: randomUUID(),
      customerId,
      bikeId: rentedBikeId,
      chargeSequence: idx + 1,
      periodStartDate: previousMonthDate,
      periodEndDate: today,
      dueDate: c.dueDate,
      amount: '100.00',
      currency: 'RON',
      status: c.status,
      paidAmount: c.status === 'PARTIALLY_PAID' ? '25.00' : c.status === 'PAID' ? '100.00' : '0.00',
      remainingAmount: c.status === 'PARTIALLY_PAID' ? '75.00' : c.status === 'PAID' ? '0.00' : '100.00',
      notes: '',
      createdAt: nowTs,
      updatedAt: nowTs,
    });
  }

  // Seed parts: 2 active low-stock, 1 active healthy stock, 1 inactive low-stock
  const part1Id = randomUUID();
  for (const part of [
    { id: part1Id, code: 'PAD-01', qty: '5.00', qtyMinor: 500, reorder: '5.00', low: true, active: true },
    { id: randomUUID(), code: 'OIL-01', qty: '1.00', qtyMinor: 100, reorder: '3.00', low: true, active: true },
    { id: randomUUID(), code: 'CHN-01', qty: '10.00', qtyMinor: 1000, reorder: '2.00', low: false, active: true },
    { id: randomUUID(), code: 'OLD-01', qty: '0.00', qtyMinor: 0, reorder: '2.00', low: true, active: false },
  ]) {
    await firestore.collection('parts').doc(part.id).set({
      id: part.id,
      partCode: part.code,
      name: part.code,
      category: 'GENERAL',
      description: null,
      unitOfMeasure: 'PCS',
      currentQuantity: part.qty,
      currentQuantityMinor: part.qtyMinor,
      minReorderLevel: part.reorder,
      defaultUnitCost: '10.05',
      costCurrency: 'RON',
      defaultSupplierId: null,
      defaultSupplierName: null,
      isLowStock: part.low,
      isActive: part.active,
      createdAt: nowTs,
      updatedAt: nowTs,
    });
  }

  // Seed monthly payments (dashboard filters startOfMonth..today + CONFIRMED)
  for (const p of [
    { amount: '120.50', currency: 'RON', status: 'CONFIRMED', paymentDate: monthStart },
    { amount: '79.50', currency: 'RON', status: 'CONFIRMED', paymentDate: today },
    { amount: '45.25', currency: 'EUR', status: 'CONFIRMED', paymentDate: today },
    { amount: '30.00', currency: 'USD', status: 'CONFIRMED', paymentDate: monthStart },
    { amount: '500.00', currency: 'RON', status: 'REVERSED', paymentDate: today },
    { amount: '900.00', currency: 'RON', status: 'CONFIRMED', paymentDate: previousMonthDate },
  ]) {
    const id = randomUUID();
    await firestore.collection('payments').doc(id).set({
      id,
      customerId,
      customerName: 'Customer',
      rentalId: null,
      paymentDate: p.paymentDate,
      amount: p.amount,
      currency: p.currency,
      paymentMethod: 'CASH',
      referenceNumber: null,
      notes: null,
      status: p.status,
      recordedByUserId: ownerId,
      recordedByUserName: 'Owner',
      allocationMode: 'AUTO_FIFO',
      createdAt: nowTs,
      updatedAt: nowTs,
    });
  }

  // Seed historical data specifically in fixed date window 2026-06-01..2026-06-15 for date-range report tests
  const rangeStart = '2026-06-01';
  const rangeEnd = '2026-06-15';
  for (const r of [
    { startDate: '2026-05-31', status: 'ACTIVE' },
    { startDate: '2026-06-01', status: 'ACTIVE' },
    { startDate: '2026-06-10', status: 'CLOSED' },
    { startDate: '2026-06-15', status: 'CANCELLED' },
    { startDate: '2026-06-16', status: 'ACTIVE' },
  ]) {
    const id = randomUUID();
    await firestore.collection('rentals').doc(id).set({
      id,
      customerId,
      customerName: 'Customer',
      customerPhone: '0700',
      bikeId: availableBikeId,
      bikeRegistrationNumber: 'B-01-AVL',
      bikeMakeModel: 'Honda CB500X',
      startDate: r.startDate,
      plannedEndDate: null,
      actualClosedDate: null,
      weeklyRate: '100.00',
      currency: 'RON',
      depositAmount: '0.00',
      depositCurrency: 'RON',
      paymentFrequency: 'WEEKLY',
      scheduleAnchorDay: 'START_DAY',
      status: r.status,
      termsAndNotes: null,
      createdAt: nowTs,
      updatedAt: nowTs,
    });
  }

  for (const p of [
    { amount: '250.40', currency: 'RON', status: 'CONFIRMED', paymentDate: '2026-06-01' },
    { amount: '50.10', currency: 'EUR', status: 'CONFIRMED', paymentDate: '2026-06-15' },
    { amount: '99.00', currency: 'RON', status: 'REVERSED', paymentDate: '2026-06-05' },
  ]) {
    const id = randomUUID();
    await firestore.collection('payments').doc(id).set({
      id,
      customerId,
      customerName: 'Customer',
      rentalId: null,
      paymentDate: p.paymentDate,
      amount: p.amount,
      currency: p.currency,
      paymentMethod: 'BANK_TRANSFER',
      referenceNumber: null,
      notes: null,
      status: p.status,
      recordedByUserId: ownerId,
      recordedByUserName: 'Owner',
      allocationMode: 'AUTO_FIFO',
      createdAt: nowTs,
      updatedAt: nowTs,
    });
  }

  const app = createApp(config, firestore);
  await withServer(app, async (request) => {
    // 1. Live POST /api/v1/services inside 2026-06-10 creates a service record + SERVICE_USAGE movement
    const serviceRes = await request('/api/v1/services', 'POST', `Bearer ${ownerToken}`, {
      motorbikeId: availableBikeId,
      serviceDate: '2026-06-10',
      odometerReading: 1200,
      serviceProvider: 'Moto Shop',
      workPerformed: 'Pad replacement',
      labourCost: 150,
      labourCurrency: 'RON',
      status: 'COMPLETED',
      partsUsed: [
        {
          partId: part1Id,
          quantity: 1.25,
          unitCost: 10.05,
          currency: 'RON',
        },
      ],
    });
    assert.equal(serviceRes.status, 201);

    // Move generated SERVICE_USAGE movement timestamp cleanly into 2026-06-10 UTC so range query finds it
    const svcMovements = await firestore
      .collection('stock_movements')
      .where('movementType', '==', 'SERVICE_USAGE')
      .get();
    assert.equal(svcMovements.docs.length, 1);
    await svcMovements.docs[0]!.ref.update({
      createdAt: Timestamp.fromDate(new Date('2026-06-10T12:00:00.000Z')),
    });

    // Add a PLANNED service on boundary date 2026-06-01 (all service statuses are included)
    const plannedSvcId = randomUUID();
    await firestore.collection('service_records').doc(plannedSvcId).set({
      id: plannedSvcId,
      bikeId: availableBikeId,
      bikeRegistrationNumber: 'B-01-AVL',
      bikeMakeModel: 'Honda CB500X',
      serviceDate: '2026-06-01',
      odometerReading: '1100.00',
      serviceProvider: 'Moto Shop',
      workPerformed: 'Planned check',
      labourCost: '50.00',
      labourCurrency: 'EUR',
      partsCost: '0.00',
      totalCost: '50.00',
      status: 'PLANNED',
      nextServiceDueDate: null,
      nextServiceDueOdometer: null,
      notes: null,
      partsUsed: [],
      recordedByUserId: ownerId,
      recordedByUserName: 'Owner',
      createdAt: nowTs,
      updatedAt: nowTs,
    });

    // Seed STOCK_IN, RETURN, STOCK_OUT, ADJUSTMENT, REVERSAL, plus boundary out-of-range movement
    for (const m of [
      { ts: '2026-06-01T00:00:00.000Z', delta: '4.00', unitCost: '2.25', curr: 'USD', type: 'STOCK_IN' },
      { ts: '2026-06-15T23:59:59.999Z', delta: '1.50', unitCost: '3.01', curr: 'USD', type: 'RETURN' },
      { ts: '2026-06-12T10:00:00.000Z', delta: '-2.00', unitCost: '5.50', curr: 'EUR', type: 'STOCK_OUT' },
      { ts: '2026-06-12T10:00:00.000Z', delta: '99.00', unitCost: '10.00', curr: 'RON', type: 'ADJUSTMENT' },
      { ts: '2026-06-12T10:00:00.000Z', delta: '-99.00', unitCost: '10.00', curr: 'RON', type: 'REVERSAL' },
      { ts: '2026-06-16T00:00:00.000Z', delta: '50.00', unitCost: '10.00', curr: 'RON', type: 'STOCK_IN' },
    ]) {
      const id = randomUUID();
      await firestore.collection('stock_movements').doc(id).set({
        id,
        partId: part1Id,
        partCode: 'PAD-01',
        partName: 'PAD-01',
        quantityDelta: m.delta,
        movementType: m.type,
        referenceType: null,
        referenceId: null,
        unitCost: m.unitCost,
        currency: m.curr,
        reason: null,
        recordedByUserId: ownerId,
        recordedByUserName: 'Owner',
        createdAt: Timestamp.fromDate(new Date(m.ts)),
      });
    }

    const beforeCounts = await snapshotCounts(firestore);

    // Verify Dashboard KPIs
    const dashRes = await request('/api/v1/reports/dashboard', 'GET', `Bearer ${ownerToken}`);
    assert.equal(dashRes.status, 200);
    assert.deepEqual(dashRes.body, {
      activeRentalsCount: 1,
      availableBikesCount: 1,
      inServiceBikesCount: 1,
      totalFleetCount: 4,
      overdueChargesCount: 2,
      lowStockPartsCount: 2,
      monthlyRevenue: { RON: 200, EUR: 45.25, USD: 30 },
      monthlyExpenses: { RON: 0, EUR: 0, USD: 0 },
    });

    // Verify Fleet Utilization
    const utilRes = await request('/api/v1/reports/fleet-utilization', 'GET', `Bearer ${ownerToken}`);
    assert.equal(utilRes.status, 200);
    assert.deepEqual(utilRes.body, {
      totalBikes: 4,
      rentedBikes: 1,
      availableBikes: 1,
      inMaintenanceBikes: 1,
      utilizationRate: 25,
    });

    // Date-range Acceptance Case 1: fromDate < toDate
    const drValid = await request(
      `/api/v1/reports/date-range?fromDate=${rangeStart}&toDate=${rangeEnd}`,
      'GET',
      `Bearer ${ownerToken}`,
    );
    assert.equal(drValid.status, 200);
    assert.deepEqual(drValid.body, {
      totalRentals: 3,
      activeRentals: 1,
      closedRentals: 1,
      serviceCount: 2,
      revenue: { RON: 250.4, EUR: 50.1, USD: 0 },
      labourCost: { RON: 150, EUR: 50, USD: 0 },
      sparePartsCost: { RON: 12.5625, EUR: 0, USD: 0 }, // 1.25 * 10.05 exact scale-4
      stockInQuantity: { TOTAL: 5.5 }, // 4.00 + 1.50
      stockOutQuantity: { TOTAL: 3.25 }, // 1.25 (SERVICE_USAGE) + 2.00 (STOCK_OUT)
      stockInCost: { RON: 0, EUR: 0, USD: 13.515 }, // (4.00*2.25) + (1.50*3.01) = 9 + 4.515 = 13.515
      stockOutCost: { RON: 12.5625, EUR: 11, USD: 0 }, // (1.25*10.05) RON + (2.00*5.50) EUR
    });

    // Date-range Acceptance Case 2: fromDate == toDate (single-day inclusive boundary)
    const drSingleDay = await request(
      '/api/v1/reports/date-range?fromDate=2026-06-15&toDate=2026-06-15',
      'GET',
      `Bearer ${ownerToken}`,
    );
    assert.equal(drSingleDay.status, 200);
    assert.deepEqual(drSingleDay.body, {
      totalRentals: 1, // CANCELLED rental on 2026-06-15
      activeRentals: 0,
      closedRentals: 0,
      serviceCount: 0,
      revenue: { RON: 0, EUR: 50.1, USD: 0 },
      labourCost: { RON: 0, EUR: 0, USD: 0 },
      sparePartsCost: { RON: 0, EUR: 0, USD: 0 },
      stockInQuantity: { TOTAL: 1.5 }, // RETURN at 2026-06-15T23:59:59.999Z
      stockOutQuantity: { TOTAL: 0 },
      stockInCost: { RON: 0, EUR: 0, USD: 4.515 },
      stockOutCost: { RON: 0, EUR: 0, USD: 0 },
    });

    // Date-range Acceptance Case 3: fromDate > toDate -> HTTP 400 (intentional deviation from Java 500)
    const drInverted = await request(
      '/api/v1/reports/date-range?fromDate=2026-06-20&toDate=2026-06-10',
      'GET',
      `Bearer ${ownerToken}`,
    );
    assert.equal(drInverted.status, 400);
    assert.equal(drInverted.body.message, 'fromDate cannot be after toDate');

    // Date-range Acceptance Case 4: Invalid date formats -> HTTP 400
    for (const badPath of [
      '/api/v1/reports/date-range?fromDate=2026-02-30&toDate=2026-06-30',
      '/api/v1/reports/date-range?fromDate=2026-06-01&toDate=not-a-date',
      '/api/v1/reports/date-range?fromDate=15/06/2026&toDate=2026-06-30',
    ]) {
      const badRes = await request(badPath, 'GET', `Bearer ${ownerToken}`);
      assert.equal(badRes.status, 400);
    }

    // Date-range Acceptance Case 5: Missing required parameters -> HTTP 400
    for (const missingPath of [
      '/api/v1/reports/date-range',
      '/api/v1/reports/date-range?fromDate=2026-06-01',
      '/api/v1/reports/date-range?toDate=2026-06-30',
    ]) {
      const missingRes = await request(missingPath, 'GET', `Bearer ${ownerToken}`);
      assert.equal(missingRes.status, 400);
    }

    // Verify all report endpoints are strictly read-only
    const afterCounts = await snapshotCounts(firestore);
    assert.deepEqual(afterCounts, beforeCounts);
  });
});

test('Reports endpoints: Bike ROI Java parity, large-value serialization, errors, and read-budget safeguard', async (context) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST ||
    !await reachable(process.env.FIRESTORE_EMULATOR_HOST)) {
    context.skip('Run with the Firestore emulator');
    return;
  }

  const { firestore } = initializeFirebase(config);
  await clearCollections(firestore);

  const ownerId = randomUUID();
  const customerId = randomUUID();
  await seedUser(firestore, { id: ownerId, email: 'owner@roi.local', fullName: 'Owner', role: 'ROLE_OWNER' });
  const ownerToken = makeToken(ownerId, 'owner@roi.local', 'ROLE_OWNER', 0);

  // Bike 1: normal domain linkage (Rental.bikeId = bike1, Payment.rentalId = rental1) -> revenue MUST be 0 per Java parity
  const bike1 = await seedBike(firestore, { registrationNumber: 'B-11-NRM', make: 'Kawasaki', model: 'Z650' });
  const rental1 = randomUUID();
  const nowTs = Timestamp.fromDate(new Date());

  await firestore.collection('rentals').doc(rental1).set({
    id: rental1,
    customerId,
    customerName: 'Customer',
    customerPhone: '0700',
    bikeId: bike1,
    bikeRegistrationNumber: 'B-11-NRM',
    bikeMakeModel: 'Kawasaki Z650',
    startDate: '2026-06-01',
    plannedEndDate: null,
    actualClosedDate: null,
    weeklyRate: '100.00',
    currency: 'RON',
    depositAmount: '0.00',
    depositCurrency: 'RON',
    paymentFrequency: 'WEEKLY',
    scheduleAnchorDay: 'START_DAY',
    status: 'ACTIVE',
    termsAndNotes: null,
    createdAt: nowTs,
    updatedAt: nowTs,
  });
  const normalPaymentId = randomUUID();
  await firestore.collection('payments').doc(normalPaymentId).set({
    id: normalPaymentId,
    customerId,
    customerName: 'Customer',
    rentalId: rental1,
    paymentDate: '2026-06-05',
    amount: '500.00',
    currency: 'RON',
    paymentMethod: 'CASH',
    referenceNumber: null,
    notes: null,
    status: 'CONFIRMED',
    recordedByUserId: ownerId,
    recordedByUserName: 'Owner',
    allocationMode: 'AUTO_FIFO',
    createdAt: nowTs,
    updatedAt: nowTs,
  });

  // Bike 2: archived bike with literal Java parity payments (rentalId === bike2, BOTH CONFIRMED & REVERSED) + scale-4 service
  const bike2 = await seedBike(firestore, {
    registrationNumber: 'B-22-PAR',
    make: 'Yamaha',
    model: 'MT-07',
    isArchived: true,
  });
  for (const p of [
    { id: randomUUID(), paymentDate: '2026-06-01', amount: '200.00', currency: 'RON', status: 'CONFIRMED' },
    { id: randomUUID(), paymentDate: '2026-06-10', amount: '50.00', currency: 'RON', status: 'REVERSED' },
    { id: randomUUID(), paymentDate: '2026-06-05', amount: '40.00', currency: 'EUR', status: 'CONFIRMED' },
  ]) {
    await firestore.collection('payments').doc(p.id).set({
      id: p.id,
      customerId,
      customerName: 'Customer',
      rentalId: bike2,
      paymentDate: p.paymentDate,
      amount: p.amount,
      currency: p.currency,
      paymentMethod: 'BANK_TRANSFER',
      referenceNumber: null,
      notes: null,
      status: p.status,
      recordedByUserId: ownerId,
      recordedByUserName: 'Owner',
      allocationMode: 'AUTO_FIFO',
      createdAt: nowTs,
      updatedAt: nowTs,
    });
  }

  for (const svc of [
    {
      bikeId: bike1,
      serviceDate: '2026-06-02',
      labourCost: '100.00',
      labourCurrency: 'RON',
      partsUsed: [
        {
          id: randomUUID(),
          partId: randomUUID(),
          partCode: 'P-1',
          partName: 'Pad',
          quantity: '1.25',
          unitCost: '10.05',
          currency: 'RON',
          totalCost: '12.5625',
        },
      ],
    },
    {
      bikeId: bike2,
      serviceDate: '2026-06-03',
      labourCost: '100.00',
      labourCurrency: 'RON',
      partsUsed: [
        {
          id: randomUUID(),
          partId: randomUUID(),
          partCode: 'P-2',
          partName: 'Chain',
          quantity: '1.25',
          unitCost: '10.05',
          currency: 'RON',
          totalCost: '12.5625',
        },
      ],
    },
  ]) {
    const id = randomUUID();
    await firestore.collection('service_records').doc(id).set({
      id,
      bikeId: svc.bikeId,
      bikeRegistrationNumber: 'REG',
      bikeMakeModel: 'Make Model',
      serviceDate: svc.serviceDate,
      odometerReading: '1000.00',
      serviceProvider: 'Shop',
      workPerformed: 'Service',
      labourCost: svc.labourCost,
      labourCurrency: svc.labourCurrency,
      partsCost: '12.5625',
      totalCost: '112.5625',
      status: 'COMPLETED',
      nextServiceDueDate: null,
      nextServiceDueOdometer: null,
      notes: null,
      partsUsed: svc.partsUsed,
      recordedByUserId: ownerId,
      recordedByUserName: 'Owner',
      createdAt: nowTs,
      updatedAt: nowTs,
    });
  }

  // Bike 3: large-value lossless scale-4 check through live HTTP endpoint
  const bike3 = await seedBike(firestore, { registrationNumber: 'B-33-BIG', make: 'BMW', model: 'R1250GS' });
  const bigPaymentId = randomUUID();
  await firestore.collection('payments').doc(bigPaymentId).set({
    id: bigPaymentId,
    customerId,
    customerName: 'Customer',
    rentalId: bike3,
    paymentDate: '2026-06-08',
    amount: '200000000000.00',
    currency: 'RON',
    paymentMethod: 'BANK_TRANSFER',
    referenceNumber: null,
    notes: null,
    status: 'CONFIRMED',
    recordedByUserId: ownerId,
    recordedByUserName: 'Owner',
    allocationMode: 'AUTO_FIFO',
    createdAt: nowTs,
    updatedAt: nowTs,
  });
  const bigSvcId = randomUUID();
  await firestore.collection('service_records').doc(bigSvcId).set({
    id: bigSvcId,
    bikeId: bike3,
    bikeRegistrationNumber: 'B-33-BIG',
    bikeMakeModel: 'BMW R1250GS',
    serviceDate: '2026-06-09',
    odometerReading: '2000.00',
    serviceProvider: 'Big Shop',
    workPerformed: 'Engine rebuild',
    labourCost: '0.00',
    labourCurrency: 'RON',
    partsCost: '123456810864.195',
    totalCost: '123456810864.195',
    status: 'COMPLETED',
    nextServiceDueDate: null,
    nextServiceDueOdometer: null,
    notes: null,
    partsUsed: [
      {
        id: randomUUID(),
        partId: randomUUID(),
        partCode: 'ENG-1',
        partName: 'Assembly',
        quantity: '1000000.25',
        unitCost: '123456.78',
        currency: 'RON',
        totalCost: '123456810864.195',
      },
    ],
    recordedByUserId: ownerId,
    recordedByUserName: 'Owner',
    createdAt: nowTs,
    updatedAt: nowTs,
  });

  // Verify repository literal-parity query preserves paymentDate DESC ordering and includes all statuses
  const repo = new ReportsRepository(firestore);
  const orderedPayments = await repo.listPaymentsForBikeRoiLiteralParity(bike2);
  assert.deepEqual(
    orderedPayments.map((p) => p.paymentDate),
    ['2026-06-10', '2026-06-05', '2026-06-01'],
  );

  // Verify bounded scan safeguard against live emulator when exceeding custom cap (3 bikes > limit 2)
  const boundedRepo = new ReportsRepository(firestore, 2);
  await assert.rejects(
    () => boundedRepo.listPaymentsForBikeRoiLiteralParity(bike2),
    (err) => err instanceof UnprocessableEntityError && err.status === 422,
  );

  const app = createApp(config, firestore);
  await withServer(app, async (request) => {
    const invalidId = await request('/api/v1/reports/bike-roi/not-a-uuid', 'GET', `Bearer ${ownerToken}`);
    assert.equal(invalidId.status, 400);

    const missingBike = await request(`/api/v1/reports/bike-roi/${randomUUID()}`, 'GET', `Bearer ${ownerToken}`);
    assert.equal(missingBike.status, 404);

    // Case 1: Normal rental-linked payments do NOT populate totalRevenue under literal Java parity
    const roi1 = await request(`/api/v1/reports/bike-roi/${bike1}`, 'GET', `Bearer ${ownerToken}`);
    assert.equal(roi1.status, 200);
    assert.deepEqual(roi1.body, {
      bikeId: bike1,
      registrationNumber: 'B-11-NRM',
      makeModel: 'Kawasaki Z650',
      totalRevenue: { RON: 0, EUR: 0, USD: 0 },
      totalMaintenanceCost: { RON: 112.5625, EUR: 0, USD: 0 },
      netProfit: { RON: -112.5625, EUR: 0, USD: 0 },
    });

    // Case 2: Archived bike + direct rentalId === bike2 includes BOTH CONFIRMED and REVERSED payments
    const roi2 = await request(`/api/v1/reports/bike-roi/${bike2}`, 'GET', `Bearer ${ownerToken}`);
    assert.equal(roi2.status, 200);
    assert.deepEqual(roi2.body, {
      bikeId: bike2,
      registrationNumber: 'B-22-PAR',
      makeModel: 'Yamaha MT-07',
      totalRevenue: { RON: 250, EUR: 40, USD: 0 },
      totalMaintenanceCost: { RON: 112.5625, EUR: 0, USD: 0 },
      netProfit: { RON: 137.4375, EUR: 40, USD: 0 },
    });

    // Case 3: Large values remain exact across 200B - 123456810864.1950 = 76543189135.8050
    const roi3 = await request(`/api/v1/reports/bike-roi/${bike3}`, 'GET', `Bearer ${ownerToken}`);
    assert.equal(roi3.status, 200);
    assert.deepEqual(roi3.body, {
      bikeId: bike3,
      registrationNumber: 'B-33-BIG',
      makeModel: 'BMW R1250GS',
      totalRevenue: { RON: 200000000000, EUR: 0, USD: 0 },
      totalMaintenanceCost: { RON: 123456810864.195, EUR: 0, USD: 0 },
      netProfit: { RON: 76543189135.805, EUR: 0, USD: 0 },
    });
  });
});
