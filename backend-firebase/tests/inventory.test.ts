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
import { InventoryService } from '../src/inventory/inventory.service.js';
import { BusinessError } from '../src/shared/errors.js';

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

async function snapshotCounts(firestore: Firestore): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const collection of TRACKED_COLLECTIONS) {
    const snap = await firestore.collection(collection).count().get();
    result[collection] = snap.data().count;
  }
  return result;
}

type HttpMethod = 'GET' | 'POST' | 'PUT';

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

test('Stage C5.1 Inventory 15-route auth matrix & ROLE_CUSTOMER parity (Firestore emulator)', async (context) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !await reachable(process.env.FIRESTORE_EMULATOR_HOST)) {
    context.skip('Run with the Firestore emulator');
    return;
  }

  const { firestore } = initializeFirebase(config);
  await clearCollections(firestore);

  const ownerUserId = randomUUID();
  const customerUserId = randomUUID();
  const revokedUserId = randomUUID();
  const inactiveUserId = randomUUID();
  const missingUserId = randomUUID();

  await seedBaseUser(firestore, {
    id: ownerUserId,
    email: 'owner-auth@example.com',
    fullName: 'Owner User',
    role: 'ROLE_OWNER',
  });
  await seedBaseUser(firestore, {
    id: customerUserId,
    email: 'customer@example.com',
    fullName: 'Customer User',
    role: 'ROLE_CUSTOMER',
  });
  await seedBaseUser(firestore, {
    id: revokedUserId,
    email: 'revoked@example.com',
    fullName: 'Revoked User',
    role: 'ROLE_OWNER',
    authVersion: 3,
    tokenIssuedBefore: new Date(Date.now() + 60_000),
  });
  await seedBaseUser(firestore, {
    id: inactiveUserId,
    email: 'inactive@example.com',
    fullName: 'Inactive User',
    role: 'ROLE_OWNER',
    isActive: false,
  });

  const ownerToken = makeToken(ownerUserId, 'owner-auth@example.com', 'ROLE_OWNER');
  const customerToken = makeToken(customerUserId, 'customer@example.com', 'ROLE_CUSTOMER');
  const expiredToken = makeToken(customerUserId, 'customer@example.com', 'ROLE_CUSTOMER', 0, {
    expiresInSeconds: -10,
    iatOffsetSeconds: -100,
  });
  const wrongSecretToken = makeToken(customerUserId, 'customer@example.com', 'ROLE_CUSTOMER', 0, {
    secret: 'wrong-secret-at-least-thirty-two-bytes',
  });
  const staleVersionToken = makeToken(revokedUserId, 'revoked@example.com', 'ROLE_OWNER', 0);
  const preIssuedBeforeToken = makeToken(revokedUserId, 'revoked@example.com', 'ROLE_OWNER', 3);
  const inactiveUserToken = makeToken(inactiveUserId, 'inactive@example.com', 'ROLE_OWNER');
  const missingUserToken = makeToken(missingUserId, 'missing@example.com', 'ROLE_OWNER');

  const app = createApp(config, firestore);
  const inventoryService = new InventoryService(firestore);

  const dummyId = randomUUID();
  const allRoutes: Array<{ method: HttpMethod; path: string; body?: unknown }> = [
    { method: 'POST', path: '/api/v1/parts', body: {} },
    { method: 'PUT', path: `/api/v1/parts/${dummyId}`, body: {} },
    { method: 'GET', path: `/api/v1/parts/${dummyId}` },
    { method: 'GET', path: '/api/v1/parts' },
    { method: 'GET', path: '/api/v1/parts/low-stock' },
    { method: 'POST', path: `/api/v1/parts/${dummyId}/archive` },
    { method: 'POST', path: `/api/v1/parts/${dummyId}/unarchive` },
    { method: 'POST', path: '/api/v1/stock-movements', body: {} },
    { method: 'GET', path: `/api/v1/stock-movements/part/${dummyId}` },
    { method: 'GET', path: '/api/v1/stock-movements' },
    { method: 'POST', path: '/api/v1/suppliers', body: {} },
    { method: 'GET', path: '/api/v1/suppliers' },
    { method: 'GET', path: `/api/v1/suppliers/${dummyId}` },
    { method: 'POST', path: `/api/v1/suppliers/${dummyId}/archive` },
    { method: 'POST', path: `/api/v1/suppliers/${dummyId}/unarchive` },
  ];

  const badAuthHeaders: Array<[string, string | undefined]> = [
    ['missing header', undefined],
    ['malformed token', 'Bearer not.a.jwt'],
    ['expired token', `Bearer ${expiredToken}`],
    ['wrong secret', `Bearer ${wrongSecretToken}`],
    ['stale authVersion', `Bearer ${staleVersionToken}`],
    ['before tokenIssuedBefore', `Bearer ${preIssuedBeforeToken}`],
    ['inactive user', `Bearer ${inactiveUserToken}`],
    ['missing user', `Bearer ${missingUserToken}`],
  ];

  await withServer(app, async (request) => {
    for (const route of allRoutes) {
      for (const [label, header] of badAuthHeaders) {
        const res = await request(route.path, route.method, header, route.body);
        assert.equal(
          res.status,
          401,
          `${route.method} ${route.path} with ${label} must return 401`,
        );
      }
    }

    // Stage C8.4.3.1: ROLE_CUSTOMER receives 403 FORBIDDEN on all 15 inventory routes (with zero writes),
    // while ROLE_OWNER succeeds across all 15 routes.
    const customerAuth = `Bearer ${customerToken}`;
    const ownerAuth = `Bearer ${ownerToken}`;
    const beforeForbiddenCounts = await snapshotCounts(firestore);
    for (const route of allRoutes) {
      const denied = await request(route.path, route.method, customerAuth, route.body);
      assert.equal(denied.status, 403, `${route.method} ${route.path} must deny ROLE_CUSTOMER with 403`);
      assert.equal((denied.body as Record<string, unknown>).error, 'FORBIDDEN');
    }
    assert.deepEqual(await snapshotCounts(firestore), beforeForbiddenCounts, '403 rejections must perform zero writes');

    // Route 48: POST /api/v1/suppliers
    const supCreate = await request('/api/v1/suppliers', 'POST', ownerAuth, {
      name: 'Owner Allowed Supplier',
    });
    assert.equal(supCreate.status, 201);
    const supplierId = String((supCreate.body as Record<string, unknown>).id);

    // Route 49: GET /api/v1/suppliers
    const supList = await request('/api/v1/suppliers', 'GET', ownerAuth);
    assert.equal(supList.status, 200);

    // Route 50: GET /api/v1/suppliers/{id}
    const supGet = await request(`/api/v1/suppliers/${supplierId}`, 'GET', ownerAuth);
    assert.equal(supGet.status, 200);

    // Route 51 & 52: archive/unarchive supplier
    const supArchive = await request(`/api/v1/suppliers/${supplierId}/archive`, 'POST', ownerAuth);
    assert.equal(supArchive.status, 200);
    const supUnarchive = await request(`/api/v1/suppliers/${supplierId}/unarchive`, 'POST', ownerAuth);
    assert.equal(supUnarchive.status, 200);

    // Route 38: POST /api/v1/parts
    const partCreate = await request('/api/v1/parts', 'POST', ownerAuth, {
      partCode: 'own-01',
      name: 'Chain Lube',
      category: 'maintenance',
      initialQuantity: 5,
      defaultSupplierId: supplierId,
    });
    assert.equal(partCreate.status, 201);
    const partId = String((partCreate.body as Record<string, unknown>).id);

    // Route 39: PUT /api/v1/parts/{id}
    const partUpdate = await request(`/api/v1/parts/${partId}`, 'PUT', ownerAuth, {
      name: 'Chain Lube Pro',
      category: 'maintenance',
      unitOfMeasure: 'CAN',
      minReorderLevel: 2,
      defaultUnitCost: 35,
      defaultSupplierId: supplierId,
    });
    assert.equal(partUpdate.status, 200);

    // Route 40: GET /api/v1/parts/{id}
    const partGet = await request(`/api/v1/parts/${partId}`, 'GET', ownerAuth);
    assert.equal(partGet.status, 200);

    // Route 41: GET /api/v1/parts
    const partList = await request('/api/v1/parts', 'GET', ownerAuth);
    assert.equal(partList.status, 200);

    // Route 42: GET /api/v1/parts/low-stock
    const lowStock = await request('/api/v1/parts/low-stock', 'GET', ownerAuth);
    assert.equal(lowStock.status, 200);

    // Route 45: POST /api/v1/stock-movements
    const movCreate = await request('/api/v1/stock-movements', 'POST', ownerAuth, {
      partId,
      quantity: 1,
      movementType: 'STOCK_IN',
    });
    assert.equal(movCreate.status, 201);

    // Route 46: GET /api/v1/stock-movements/part/{partId}
    const movByPart = await request(`/api/v1/stock-movements/part/${partId}`, 'GET', ownerAuth);
    assert.equal(movByPart.status, 200);

    // Route 47: GET /api/v1/stock-movements
    const movSearch = await request('/api/v1/stock-movements', 'GET', ownerAuth);
    assert.equal(movSearch.status, 200);

    // Route 43 & 44: archive/unarchive part
    const partArchive = await request(`/api/v1/parts/${partId}/archive`, 'POST', ownerAuth);
    assert.equal(partArchive.status, 200);
    const partUnarchive = await request(`/api/v1/parts/${partId}/unarchive`, 'POST', ownerAuth);
    assert.equal(partUnarchive.status, 200);
  });

  // Verify direct transaction audit-user rejection leaves zero orphaned writes
  const beforeDirectCounts = await snapshotCounts(firestore);
  const nowIssuedAt = Math.floor(Date.now() / 1000);
  await assert.rejects(
    () =>
      inventoryService.createPart(
        { partCode: 'NOAUTH-01', name: 'Ghost Part', category: 'OTHER', initialQuantity: 3 },
        { id: missingUserId, email: 'missing@example.com', role: 'ROLE_OWNER', authVersion: 0, issuedAt: nowIssuedAt },
      ),
    (error: unknown) => error instanceof AuthError && error.status === 401,
  );
  await assert.rejects(
    () =>
      inventoryService.createPart(
        { partCode: 'INACT-01', name: 'Inactive Auth Part', category: 'OTHER', initialQuantity: 3 },
        { id: inactiveUserId, email: 'inactive@example.com', role: 'ROLE_OWNER', authVersion: 0, issuedAt: nowIssuedAt },
      ),
    (error: unknown) => error instanceof AuthError && error.status === 401,
  );
  assert.deepEqual(await snapshotCounts(firestore), beforeDirectCounts);
});

test('Stage C5.1 Parts lifecycle, low-stock numeric order, filtering, and supplier rules (Firestore emulator)', async (context) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !await reachable(process.env.FIRESTORE_EMULATOR_HOST)) {
    context.skip('Run with the Firestore emulator');
    return;
  }

  const { firestore } = initializeFirebase(config);
  await clearCollections(firestore);

  const ownerId = randomUUID();
  await seedBaseUser(firestore, {
    id: ownerId,
    email: 'owner@example.com',
    fullName: 'Owner Audit Name',
    role: 'ROLE_OWNER',
  });
  const authHeader = `Bearer ${makeToken(ownerId, 'owner@example.com', 'ROLE_OWNER')}`;
  const app = createApp(config, firestore);

  await withServer(app, async (request) => {
    // 1. Create active supplier & archived supplier (Java allows associating archived suppliers!)
    const s1Res = await request('/api/v1/suppliers', 'POST', authHeader, {
      name: 'Acme Parts SRL',
      contactPerson: 'Elena Pop',
      phone: '+40722111222',
      email: 'no-at-sign-allowed-per-java',
      taxCui: 'RO998877',
    });
    assert.equal(s1Res.status, 201);
    const activeSupplier = s1Res.body as Record<string, unknown>;
    assert.equal(activeSupplier.active, true);
    assert.equal(activeSupplier.email, 'no-at-sign-allowed-per-java');

    const dupSup = await request('/api/v1/suppliers', 'POST', authHeader, {
      name: '  acme parts srl  ',
    });
    assert.equal(dupSup.status, 409);

    const s2Res = await request('/api/v1/suppliers', 'POST', authHeader, {
      name: 'Archived Vendor',
      taxCui: 'RO555',
    });
    assert.equal(s2Res.status, 201);
    const archivedSupplierId = String((s2Res.body as Record<string, unknown>).id);
    const archSupRes = await request(`/api/v1/suppliers/${archivedSupplierId}/archive`, 'POST', authHeader);
    assert.equal(archSupRes.status, 200);
    assert.equal((archSupRes.body as Record<string, unknown>).active, false);
    // Archived supplier name stays conflict-locked
    assert.equal(
      (await request('/api/v1/suppliers', 'POST', authHeader, { name: 'ARCHIVED VENDOR' })).status,
      409,
    );

    // 2. Supplier filtering, default active-only, includeArchived, active filter, sort=active & search across all 5 fields
    assert.equal(
      ((await request('/api/v1/suppliers', 'GET', authHeader)).body as Record<string, unknown>).totalElements,
      1,
    );
    assert.equal(
      ((await request('/api/v1/suppliers?includeArchived=false', 'GET', authHeader)).body as Record<string, unknown>).totalElements,
      1,
    );
    assert.equal(
      ((await request('/api/v1/suppliers?includeArchived=true', 'GET', authHeader)).body as Record<string, unknown>).totalElements,
      2,
    );
    assert.equal(
      ((await request('/api/v1/suppliers?active=true', 'GET', authHeader)).body as Record<string, unknown>).totalElements,
      1,
    );
    assert.equal(
      ((await request('/api/v1/suppliers?active=false', 'GET', authHeader)).body as Record<string, unknown>).totalElements,
      1,
    );
    assert.equal((await request('/api/v1/suppliers?active=invalid', 'GET', authHeader)).status, 400);
    const supSortAsc = await request('/api/v1/suppliers?includeArchived=true&sort=active,ASC', 'GET', authHeader);
    assert.equal(supSortAsc.status, 200);
    assert.deepEqual(
      ((supSortAsc.body as Record<string, unknown>).content as Array<Record<string, unknown>>).map((s) => s.active),
      [false, true],
    );
    const supSortDesc = await request('/api/v1/suppliers?includeArchived=true&sort=active,DESC', 'GET', authHeader);
    assert.equal(supSortDesc.status, 200);
    assert.deepEqual(
      ((supSortDesc.body as Record<string, unknown>).content as Array<Record<string, unknown>>).map((s) => s.active),
      [true, false],
    );
    for (const term of ['acme', 'elena', '22111', 'no-at-sign', 'ro9988']) {
      const searchRes = await request(`/api/v1/suppliers?search=${encodeURIComponent(term)}`, 'GET', authHeader);
      assert.equal(searchRes.status, 200);
      assert.equal((searchRes.body as Record<string, unknown>).totalElements, 1);
    }

    // 3. Create Part A with initialQuantity = 0 (zero stock_movements created)
    const pARes = await request('/api/v1/parts', 'POST', authHeader, {
      partCode: ' brk-01 ',
      name: 'Ceramic Brake Pad',
      category: 'brakes',
      description: 'Front axle caliper pad',
      defaultSupplierId: archivedSupplierId,
    });
    assert.equal(pARes.status, 201);
    const partA = pARes.body as Record<string, unknown>;
    assert.equal(partA.partCode, 'BRK-01');
    assert.equal(partA.category, 'BRAKES');
    assert.equal(partA.unitOfMeasure, 'PCS');
    assert.equal(partA.currentQuantity, 0);
    assert.equal(partA.minReorderLevel, 2);
    assert.equal(partA.lowStock, true);
    assert.equal(partA.isLowStock, true);
    assert.equal(partA.defaultSupplierName, 'Archived Vendor');
    const partAMovements = await request(`/api/v1/stock-movements/part/${partA.id}`, 'GET', authHeader);
    assert.equal(partAMovements.status, 200);
    assert.deepEqual(partAMovements.body, []);

    // Missing supplier ID -> 404
    assert.equal(
      (await request('/api/v1/parts', 'POST', authHeader, {
        partCode: 'MISS-SUP',
        name: 'X',
        category: 'OTHER',
        defaultSupplierId: randomUUID(),
      })).status,
      404,
    );

    // 4. Create Part B with initialQuantity = 10 -> INITIAL_SETUP STOCK_IN movement
    const pBRes = await request('/api/v1/parts', 'POST', authHeader, {
      partCode: 'eng-10',
      name: 'Spark Plug',
      category: 'engine',
      initialQuantity: 10,
      minReorderLevel: 15,
      defaultUnitCost: 22.5,
      costCurrency: 'EUR',
      defaultSupplierId: activeSupplier.id,
    });
    assert.equal(pBRes.status, 201);
    const partB = pBRes.body as Record<string, unknown>;
    assert.equal(partB.currentQuantity, 10);
    assert.equal(partB.lowStock, true);
    assert.equal(partB.isLowStock, true);

    const partBMovs = await request(`/api/v1/stock-movements/part/${partB.id}`, 'GET', authHeader);
    assert.equal(partBMovs.status, 200);
    const partBMovList = partBMovs.body as Array<Record<string, unknown>>;
    assert.equal(partBMovList.length, 1);
    assert.equal(partBMovList[0]!.movementType, 'STOCK_IN');
    assert.equal(partBMovList[0]!.quantityDelta, 10);
    assert.equal(partBMovList[0]!.referenceType, 'INITIAL_SETUP');
    assert.equal(partBMovList[0]!.unitCost, 22.5);
    assert.equal(partBMovList[0]!.currency, 'EUR');
    assert.equal(partBMovList[0]!.recordedByUserName, 'Owner Audit Name');

    // Create Part C with qty = 2, minReorderLevel = 15 (verifies numeric ordering "2" before "10")
    const pCRes = await request('/api/v1/parts', 'POST', authHeader, {
      partCode: 'chn-02',
      name: 'Drive Chain',
      category: 'drivetrain',
      initialQuantity: 2,
      minReorderLevel: 15,
    });
    assert.equal(pCRes.status, 201);
    const partC = pCRes.body as Record<string, unknown>;

    // Create Part D not low stock (qty 20 > reorder 5)
    const pDRes = await request('/api/v1/parts', 'POST', authHeader, {
      partCode: 'tir-20',
      name: 'Rear Tire',
      category: 'tires',
      initialQuantity: 20,
      minReorderLevel: 5,
    });
    assert.equal(pDRes.status, 201);

    // 5. Low-stock numeric sort check (Route 42): 0, 2, 10 (never "10" before "2"!)
    const lowStockRes = await request('/api/v1/parts/low-stock', 'GET', authHeader);
    assert.equal(lowStockRes.status, 200);
    const lowStockList = lowStockRes.body as Array<Record<string, unknown>>;
    assert.deepEqual(
      lowStockList.map((p) => [p.partCode, p.currentQuantity]),
      [
        ['BRK-01', 0],
        ['CHN-02', 2],
        ['ENG-10', 10],
      ],
    );

    // 6. Duplicate partCode case/whitespace -> 409
    assert.equal(
      (await request('/api/v1/parts', 'POST', authHeader, {
        partCode: '  BRK-01 ',
        name: 'Dup',
        category: 'BRAKES',
      })).status,
      409,
    );

    // 7. PUT /api/v1/parts/{id} clears supplier when null, updates mutable fields, ignores immutable
    const putRes = await request(`/api/v1/parts/${partB.id}`, 'PUT', authHeader, {
      name: 'Spark Plug Iridium',
      category: 'ignition',
      description: 'Updated description',
      unitOfMeasure: 'SET',
      minReorderLevel: 5,
      defaultUnitCost: 30,
      defaultSupplierId: null,
      partCode: 'HACK-CODE',
      currentQuantity: 999,
      costCurrency: 'USD',
    });
    assert.equal(putRes.status, 200);
    const updatedB = putRes.body as Record<string, unknown>;
    assert.equal(updatedB.name, 'Spark Plug Iridium');
    assert.equal(updatedB.category, 'IGNITION');
    assert.equal(updatedB.defaultSupplierId, null);
    assert.equal(updatedB.defaultSupplierName, null);
    assert.equal(updatedB.partCode, 'ENG-10');
    assert.equal(updatedB.currentQuantity, 10);
    assert.equal(updatedB.costCurrency, 'EUR');
    assert.equal(updatedB.lowStock, false); // 10 > 5
    assert.equal(updatedB.isLowStock, false);

    // 8. Archive / unarchive Part C & confirm exclusion from low-stock and archived code lock
    const arcC = await request(`/api/v1/parts/${partC.id}/archive`, 'POST', authHeader);
    assert.equal(arcC.status, 200);
    assert.equal((arcC.body as Record<string, unknown>).active, false);
    assert.equal(
      ((await request('/api/v1/parts/low-stock', 'GET', authHeader)).body as unknown[]).length,
      1, // Only BRK-01 now (ENG-10 updated reorder=5, CHN-02 archived)
    );
    // Archived part can still be updated per Java PartService.updatePart (preserving unitOfMeasure casing)
    const editArchived = await request(`/api/v1/parts/${partC.id}`, 'PUT', authHeader, {
      name: 'Drive Chain Heavy',
      category: 'drivetrain',
      unitOfMeasure: 'pcs',
      minReorderLevel: 15,
      defaultUnitCost: 50,
      defaultSupplierId: null,
    });
    assert.equal(editArchived.status, 200);
    assert.equal((editArchived.body as Record<string, unknown>).unitOfMeasure, 'pcs');

    // Stage C8.4.2: default active-only, includeArchived, active filter & sort=active compatibility on GET /parts
    assert.equal(
      ((await request('/api/v1/parts', 'GET', authHeader)).body as Record<string, unknown>).totalElements,
      3,
    );
    assert.equal(
      ((await request('/api/v1/parts?includeArchived=false', 'GET', authHeader)).body as Record<string, unknown>).totalElements,
      3,
    );
    const partsSortActiveAsc = await request('/api/v1/parts?includeArchived=true&sort=active,ASC', 'GET', authHeader);
    assert.equal(partsSortActiveAsc.status, 200);
    assert.equal((partsSortActiveAsc.body as Record<string, unknown>).totalElements, 4);
    assert.equal(
      ((partsSortActiveAsc.body as Record<string, unknown>).content as Array<Record<string, unknown>>)[0]?.active,
      false,
    );
    const activeParts = await request('/api/v1/parts?active=true&sort=active,ASC', 'GET', authHeader);
    assert.equal(activeParts.status, 200);
    assert.equal((activeParts.body as Record<string, unknown>).totalElements, 3);
    const inactiveParts = await request('/api/v1/parts?active=false&sort=active,DESC', 'GET', authHeader);
    assert.equal(inactiveParts.status, 200);
    assert.equal((inactiveParts.body as Record<string, unknown>).totalElements, 1);
    assert.equal(
      (await request('/api/v1/parts?active=yes', 'GET', authHeader)).status,
      400,
    );
    assert.equal(
      (await request('/api/v1/parts', 'POST', authHeader, {
        partCode: 'chn-02',
        name: 'Dup Archived Code',
        category: 'DRIVETRAIN',
      })).status,
      409,
    );
    const unarcC = await request(`/api/v1/parts/${partC.id}/unarchive`, 'POST', authHeader);
    assert.equal(unarcC.status, 200);
    assert.equal((unarcC.body as Record<string, unknown>).active, true);
    assert.equal(
      (await request(`/api/v1/parts/${randomUUID()}/archive`, 'POST', authHeader)).status,
      404,
    );

    // 9. GET /api/v1/parts filtering, search across partCode/name/description, pagination, custom sort
    const page1 = await request('/api/v1/parts?page=0&size=2&sort=partCode,ASC', 'GET', authHeader);
    assert.equal(page1.status, 200);
    const page1Body = page1.body as Record<string, unknown>;
    assert.equal(page1Body.totalElements, 4);
    assert.equal(page1Body.totalPages, 2);
    assert.equal(page1Body.last, false);
    assert.equal((page1Body.content as unknown[]).length, 2);

    const byCat = await request('/api/v1/parts?category=ignition', 'GET', authHeader);
    assert.equal((byCat.body as Record<string, unknown>).totalElements, 1);

    const byDesc = await request('/api/v1/parts?search=caliper', 'GET', authHeader);
    assert.equal((byDesc.body as Record<string, unknown>).totalElements, 1);

    const lowOnly = await request('/api/v1/parts?lowStockOnly=true', 'GET', authHeader);
    assert.equal((lowOnly.body as Record<string, unknown>).totalElements, 2); // BRK-01 (0<=2), CHN-02 (2<=15)

    const lowOnlyFalse = await request('/api/v1/parts?lowStockOnly=false', 'GET', authHeader);
    assert.equal((lowOnlyFalse.body as Record<string, unknown>).totalElements, 4); // No filter applied

    const customSorted = await request('/api/v1/parts?sort=currentQuantity,DESC', 'GET', authHeader);
    assert.equal(customSorted.status, 200);
    assert.deepEqual(
      ((customSorted.body as Record<string, unknown>).content as Array<Record<string, unknown>>).map(
        (p) => p.currentQuantity,
      ),
      [20, 10, 2, 0],
    );
  });
});

test('Stage C5.1 Stock movements, currency/cost fallbacks, overdraft protection, and filters (Firestore emulator)', async (context) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !await reachable(process.env.FIRESTORE_EMULATOR_HOST)) {
    context.skip('Run with the Firestore emulator');
    return;
  }

  const { firestore } = initializeFirebase(config);
  await clearCollections(firestore);

  const ownerId = randomUUID();
  await seedBaseUser(firestore, {
    id: ownerId,
    email: 'owner@example.com',
    fullName: 'Movement Recorder',
    role: 'ROLE_OWNER',
  });
  const authHeader = `Bearer ${makeToken(ownerId, 'owner@example.com', 'ROLE_OWNER')}`;
  const app = createApp(config, firestore);

  await withServer(app, async (request) => {
    const createPartRes = await request('/api/v1/parts', 'POST', authHeader, {
      partCode: 'OIL-1040',
      name: 'Engine Oil 10W40',
      category: 'fluids',
      unitOfMeasure: 'L',
      initialQuantity: 5,
      minReorderLevel: 3,
      defaultUnitCost: 40,
      costCurrency: 'EUR',
    });
    assert.equal(createPartRes.status, 201);
    const partId = String((createPartRes.body as Record<string, unknown>).id);

    // 1. STOCK_IN & RETURN increase stock; omitted currency -> RON, explicit null currency -> part.costCurrency (EUR)
    const stockIn = await request('/api/v1/stock-movements', 'POST', authHeader, {
      partId,
      quantity: 2.5,
      movementType: 'STOCK_IN',
    });
    assert.equal(stockIn.status, 201);
    const inBody = stockIn.body as Record<string, unknown>;
    assert.equal(inBody.quantityDelta, 2.5);
    assert.equal(inBody.currency, 'RON');
    assert.equal(inBody.unitCost, 40);

    const retMov = await request('/api/v1/stock-movements', 'POST', authHeader, {
      partId,
      quantity: 1,
      movementType: 'RETURN',
      currency: null,
      unitCost: 42,
      referenceType: 'CUSTOMER_RETURN',
    });
    assert.equal(retMov.status, 201);
    assert.equal((retMov.body as Record<string, unknown>).currency, 'EUR');
    assert.equal((retMov.body as Record<string, unknown>).unitCost, 42);
    // Current qty = 5 + 2.5 + 1 = 8.5

    // 2. STOCK_OUT & SERVICE_USAGE deduct stock; overdraft fails 400 atomically with zero side effects
    const svcOut = await request('/api/v1/stock-movements', 'POST', authHeader, {
      partId,
      quantity: '5.50',
      movementType: 'SERVICE_USAGE',
    });
    assert.equal(svcOut.status, 201);
    assert.equal((svcOut.body as Record<string, unknown>).quantityDelta, -5.5);
    // Current qty = 3.00 -> isLowStock becomes true (3.00 <= 3.00)
    const midPart = (await request(`/api/v1/parts/${partId}`, 'GET', authHeader)).body as Record<string, unknown>;
    assert.equal(midPart.currentQuantity, 3);
    assert.equal(midPart.lowStock, true);

    const beforeOverdraftCounts = await snapshotCounts(firestore);
    const overdraft = await request('/api/v1/stock-movements', 'POST', authHeader, {
      partId,
      quantity: 3.01,
      movementType: 'STOCK_OUT',
    });
    assert.equal(overdraft.status, 400);
    assert.deepEqual(await snapshotCounts(firestore), beforeOverdraftCounts);

    // 3. ADJUSTMENT & REVERSAL positive >= 0.01 succeed; <= 0 fails 400 VALIDATION_FAILED
    assert.equal(
      (await request('/api/v1/stock-movements', 'POST', authHeader, {
        partId,
        quantity: 0,
        movementType: 'ADJUSTMENT',
      })).status,
      400,
    );
    assert.equal(
      (await request('/api/v1/stock-movements', 'POST', authHeader, {
        partId,
        quantity: -1,
        movementType: 'REVERSAL',
      })).status,
      400,
    );
    const purchaseAlias = await request('/api/v1/stock-movements', 'POST', authHeader, {
      partId,
      quantity: 1,
      movementType: 'PURCHASE',
    });
    assert.equal(purchaseAlias.status, 201);
    assert.equal((purchaseAlias.body as Record<string, unknown>).movementType, 'STOCK_IN');
    assert.equal((purchaseAlias.body as Record<string, unknown>).quantityDelta, 1);

    const usageAlias = await request('/api/v1/stock-movements', 'POST', authHeader, {
      partId,
      quantity: 1,
      movementType: 'USAGE_NON_SERVICE',
    });
    assert.equal(usageAlias.status, 201);
    assert.equal((usageAlias.body as Record<string, unknown>).movementType, 'STOCK_OUT');
    assert.equal((usageAlias.body as Record<string, unknown>).quantityDelta, -1);

    assert.equal(
      (await request('/api/v1/stock-movements', 'POST', authHeader, {
        partId,
        quantity: 1,
        movementType: 'UNKNOWN_MOVEMENT',
      })).status,
      400,
    );

    const adjMov = await request('/api/v1/stock-movements', 'POST', authHeader, {
      partId,
      quantity: 0.5,
      movementType: 'ADJUSTMENT',
    });
    assert.equal(adjMov.status, 201);
    assert.equal((adjMov.body as Record<string, unknown>).quantityDelta, 0.5);

    const revMov = await request('/api/v1/stock-movements', 'POST', authHeader, {
      partId,
      quantity: 0.5,
      movementType: 'REVERSAL',
    });
    assert.equal(revMov.status, 201);
    assert.equal((revMov.body as Record<string, unknown>).quantityDelta, 0.5);

    // 4. GET /stock-movements/part/:partId ordering + unknown partId returns []
    const historyRes = await request(`/api/v1/stock-movements/part/${partId}`, 'GET', authHeader);
    assert.equal(historyRes.status, 200);
    const history = historyRes.body as Array<Record<string, unknown>>;
    assert.equal(history.length, 8); // initial + STOCK_IN + RETURN + SERVICE_USAGE + PURCHASE(STOCK_IN) + USAGE_NON_SERVICE(STOCK_OUT) + ADJUSTMENT + REVERSAL
    for (let i = 1; i < history.length; i += 1) {
      assert.ok(String(history[i - 1]!.createdAt) >= String(history[i]!.createdAt));
    }

    // Verify stock balance equals exact sum of all 8 movement deltas
    const partAfterMovements = await request(`/api/v1/parts/${partId}`, 'GET', authHeader);
    assert.equal(partAfterMovements.status, 200);
    const ledgerSum = history.reduce((acc, item) => acc + Math.round(Number(item.quantityDelta) * 100), 0);
    assert.equal(Math.round(Number((partAfterMovements.body as Record<string, unknown>).currentQuantity) * 100), ledgerSum);

    // Alias filter parity: PURCHASE -> STOCK_IN, USAGE_NON_SERVICE -> STOCK_OUT
    const purchaseFilter = await request(`/api/v1/stock-movements?partId=${partId}&type=PURCHASE`, 'GET', authHeader);
    assert.equal(purchaseFilter.status, 200);
    assert.equal((purchaseFilter.body as Record<string, unknown>).totalElements, 3);
    const usageFilter = await request(`/api/v1/stock-movements?partId=${partId}&type=USAGE_NON_SERVICE`, 'GET', authHeader);
    assert.equal(usageFilter.status, 200);
    assert.equal((usageFilter.body as Record<string, unknown>).totalElements, 1);

    const emptyHistory = await request(`/api/v1/stock-movements/part/${randomUUID()}`, 'GET', authHeader);
    assert.equal(emptyHistory.status, 200);
    assert.deepEqual(emptyHistory.body, []);

    // 5. GET /stock-movements filtering by partId, type, startDate/endDate, and pagination
    const typeFilter = await request('/api/v1/stock-movements?type=RETURN', 'GET', authHeader);
    assert.equal(typeFilter.status, 200);
    assert.equal((typeFilter.body as Record<string, unknown>).totalElements, 1);

    const futureFilter = await request(
      `/api/v1/stock-movements?partId=${partId}&startDate=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`,
      'GET',
      authHeader,
    );
    assert.equal(futureFilter.status, 200);
    assert.equal((futureFilter.body as Record<string, unknown>).totalElements, 0);

    // 6. Movement on archived part fails with 400
    assert.equal((await request(`/api/v1/parts/${partId}/archive`, 'POST', authHeader)).status, 200);
    assert.equal(
      (await request('/api/v1/stock-movements', 'POST', authHeader, {
        partId,
        quantity: 1,
        movementType: 'STOCK_IN',
      })).status,
      400,
    );
  });
});

test('Stage C5.1 Concurrency contention, 422 scan cap, and Stage C6 servicing deduction helper (Firestore emulator)', async (context) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !await reachable(process.env.FIRESTORE_EMULATOR_HOST)) {
    context.skip('Run with the Firestore emulator');
    return;
  }

  const { firestore } = initializeFirebase(config);
  await clearCollections(firestore);

  const ownerId = randomUUID();
  await seedBaseUser(firestore, {
    id: ownerId,
    email: 'owner@example.com',
    fullName: 'Concurrency Owner',
    role: 'ROLE_OWNER',
  });
  const authHeader = `Bearer ${makeToken(ownerId, 'owner@example.com', 'ROLE_OWNER')}`;
  const app = createApp(config, firestore);
  const service = new InventoryService(firestore);

  await withServer(app, async (request) => {
    // 1. Concurrent STOCK_OUT contention on stock = 5.00
    const created = await request('/api/v1/parts', 'POST', authHeader, {
      partCode: 'RACE-01',
      name: 'Race Pad',
      category: 'BRAKES',
      initialQuantity: 5,
      minReorderLevel: 2,
      defaultUnitCost: 15,
      costCurrency: 'EUR',
    });
    assert.equal(created.status, 201);
    const partId = String((created.body as Record<string, unknown>).id);

    const stockOutResults = await Promise.all([
      request('/api/v1/stock-movements', 'POST', authHeader, {
        partId,
        quantity: 4,
        movementType: 'STOCK_OUT',
      }),
      request('/api/v1/stock-movements', 'POST', authHeader, {
        partId,
        quantity: 4,
        movementType: 'STOCK_OUT',
      }),
    ]);
    const stockStatuses = stockOutResults.map((r) => r.status).sort();
    assert.deepEqual(stockStatuses, [201, 400]);

    const partAfterRace = (await request(`/api/v1/parts/${partId}`, 'GET', authHeader)).body as Record<string, unknown>;
    assert.equal(partAfterRace.currentQuantity, 1);
    assert.equal(partAfterRace.lowStock, true);

    // 2. Concurrent duplicate partCode create -> [201, 409]
    const dupPartCreates = await Promise.all([
      request('/api/v1/parts', 'POST', authHeader, {
        partCode: 'PAR-DUP',
        name: 'Parallel Part 1',
        category: 'OTHER',
      }),
      request('/api/v1/parts', 'POST', authHeader, {
        partCode: ' par-dup ',
        name: 'Parallel Part 2',
        category: 'OTHER',
      }),
    ]);
    assert.deepEqual(dupPartCreates.map((r) => r.status).sort(), [201, 409]);

    // 3. Concurrent duplicate supplier create -> [201, 409]
    const dupSupCreates = await Promise.all([
      request('/api/v1/suppliers', 'POST', authHeader, { name: 'Race Vendor' }),
      request('/api/v1/suppliers', 'POST', authHeader, { name: '  race vendor ' }),
    ]);
    assert.deepEqual(dupSupCreates.map((r) => r.status).sort(), [201, 409]);

    // 4. Stage C6 servicing deduction helper: duplicate partId aggregation & atomic write plan
    const serviceRecordId = randomUUID();
    // Part currentQuantity is 1.00; requesting 0.60 + 0.60 = 1.20 for the same partId must fail with 400
    await assert.rejects(
      () =>
        firestore.runTransaction((tx) =>
          service.prepareServicePartDeductionsInTx(tx, {
            rawPartsUsed: [
              { partId, quantity: '0.60' },
              { partId, quantity: '0.60' },
            ],
            serviceRecordId,
            bikeRegistrationNumber: 'B-99-XYZ',
            recordedByUserId: ownerId,
            recordedByUserName: 'Concurrency Owner',
            now: Timestamp.now(),
          })
        ),
      (error: unknown) => error instanceof BusinessError && error.status === 400,
    );

    // Valid duplicate lines 0.20 + 0.20 + 0.30 = 0.70 against 1.00 -> leaves 0.30 and emits 3 SERVICE_USAGE rows
    // Verifies all 3 currency cases: omitted -> 'RON', explicit null -> part.costCurrency ('EUR'), explicit 'USD' -> 'USD'
    const preparedMovements = await firestore.runTransaction(async (tx) => {
      const plan = await service.prepareServicePartDeductionsInTx(tx, {
        rawPartsUsed: [
          { partId, quantity: '0.20' },
          { partId, quantity: '0.20', currency: null },
          { partId, quantity: '0.30', unitCost: '19.00', currency: 'USD' },
        ],
        serviceRecordId,
        bikeRegistrationNumber: 'B-99-XYZ',
        recordedByUserId: ownerId,
        recordedByUserName: 'Concurrency Owner',
        now: Timestamp.now(),
      });
      plan.applyWrites();
      return plan.movements;
    });
    assert.equal(preparedMovements.length, 3);
    assert.equal(preparedMovements[0]!.unitCost, '15.00');
    assert.equal(preparedMovements[0]!.currency, 'RON');
    assert.equal(preparedMovements[1]!.unitCost, '15.00');
    assert.equal(preparedMovements[1]!.currency, 'EUR');
    assert.equal(preparedMovements[2]!.unitCost, '19.00');
    assert.equal(preparedMovements[2]!.currency, 'USD');

    const partAfterService = (await request(`/api/v1/parts/${partId}`, 'GET', authHeader)).body as Record<string, unknown>;
    assert.equal(partAfterService.currentQuantity, 0.3);

    const svcMovements = (await request(`/api/v1/stock-movements?partId=${partId}&type=SERVICE_USAGE`, 'GET', authHeader)).body as Record<string, unknown>;
    assert.equal(svcMovements.totalElements, 3);

    // 5. Seed up to 1001 parts & 1001 suppliers to verify MAX_SEARCH_SCAN_DOCS = 1000 returns 422 while non-search paging succeeds
    const existingPartsCount = (await firestore.collection('parts').count().get()).data().count;
    const partsNeeded = 1001 - existingPartsCount;
    const now = Timestamp.now();
    for (let offset = 0; offset < partsNeeded; offset += 400) {
      const batch = firestore.batch();
      const end = Math.min(partsNeeded, offset + 400);
      for (let i = offset; i < end; i += 1) {
        const id = randomUUID();
        batch.set(firestore.collection('parts').doc(id), {
          id,
          partCode: `BULK-${String(i).padStart(4, '0')}`,
          name: `Bulk Part ${i}`,
          category: 'BULK',
          description: null,
          unitOfMeasure: 'PCS',
          currentQuantity: '5.00',
          currentQuantityMinor: 500,
          minReorderLevel: '2.00',
          defaultUnitCost: '1.00',
          costCurrency: 'RON',
          defaultSupplierId: null,
          defaultSupplierName: null,
          isLowStock: false,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
      }
      await batch.commit();
    }

    const searchParts422 = await request('/api/v1/parts?search=Bulk', 'GET', authHeader);
    assert.equal(searchParts422.status, 422);
    const pagedParts200 = await request('/api/v1/parts?page=0&size=10', 'GET', authHeader);
    assert.equal(pagedParts200.status, 200);
    assert.equal((pagedParts200.body as Record<string, unknown>).totalElements, 1001);

    const existingSupCount = (await firestore.collection('suppliers').count().get()).data().count;
    const supNeeded = 1001 - existingSupCount;
    for (let offset = 0; offset < supNeeded; offset += 400) {
      const batch = firestore.batch();
      const end = Math.min(supNeeded, offset + 400);
      for (let i = offset; i < end; i += 1) {
        const id = randomUUID();
        const name = `Bulk Supplier ${String(i).padStart(4, '0')}`;
        batch.set(firestore.collection('suppliers').doc(id), {
          id,
          name,
          nameNormalized: name.toLowerCase(),
          contactPerson: null,
          phone: null,
          email: null,
          taxCui: null,
          address: null,
          notes: null,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
      }
      await batch.commit();
    }

    const searchSuppliers422 = await request('/api/v1/suppliers?search=Bulk', 'GET', authHeader);
    assert.equal(searchSuppliers422.status, 422);
    const pagedSuppliers200 = await request('/api/v1/suppliers?page=0&size=10', 'GET', authHeader);
    assert.equal(pagedSuppliers200.status, 200);
    assert.equal((pagedSuppliers200.body as Record<string, unknown>).totalElements, 1001);
  });
});
