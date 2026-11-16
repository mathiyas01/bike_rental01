import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import net from 'node:net';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { parseEnvironment } from '../src/config/env.js';
import { initializeFirebase } from '../src/config/firebase.js';
import { RentalRepository } from '../src/rental/rental.repository.js';
import { PaymentRepository } from '../src/payment/payment.repository.js';
import { InventoryRepository } from '../src/inventory/inventory.repository.js';
import { ServicingRepository } from '../src/servicing/servicing.repository.js';
import { ReportsRepository } from '../src/reports/reports.repository.js';
import { ReferenceRepository } from '../src/reference/reference.repository.js';
import type { ServiceStatus } from '../src/domain/types.js';
import type { PageRequest } from '../src/shared/pagination.js';
import type { PaymentSearchFilters } from '../src/payment/payment.types.js';

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

interface IndexField {
  fieldPath: string;
  order: 'ASCENDING' | 'DESCENDING';
}

interface FirestoreIndex {
  collectionGroup: string;
  queryScope: string;
  fields: IndexField[];
}

interface IndexesFile {
  indexes: FirestoreIndex[];
  fieldOverrides?: unknown[];
}

test('firestore.indexes.json schema and matrix verification', () => {
  const indexPath = resolve(process.cwd(), 'firestore.indexes.json');
  const raw = readFileSync(indexPath, 'utf-8');
  const parsed = JSON.parse(raw) as IndexesFile;

  assert.ok(Array.isArray(parsed.indexes), 'indexes must be an array');

  // Verify chargeSequence DESC index exists for rental_charges
  const hasRentalChargeSequenceDesc = parsed.indexes.some((idx) =>
    idx.collectionGroup === 'rental_charges' &&
    idx.fields.length === 2 &&
    idx.fields[0]?.fieldPath === 'rentalId' && idx.fields[0]?.order === 'ASCENDING' &&
    idx.fields[1]?.fieldPath === 'chargeSequence' && idx.fields[1]?.order === 'DESCENDING',
  );
  assert.ok(hasRentalChargeSequenceDesc, 'Index for rental_charges (rentalId ASC, chargeSequence DESC) must exist');

  // Verify customerId indexing exists for rental_charges
  const hasRentalChargeCustomerIdDueDateAsc = parsed.indexes.some((idx) =>
    idx.collectionGroup === 'rental_charges' &&
    idx.fields.some((f) => f.fieldPath === 'customerId') &&
    idx.fields.some((f) => f.fieldPath === 'dueDate'),
  );
  assert.ok(hasRentalChargeCustomerIdDueDateAsc, 'Index for rental_charges with customerId and dueDate must exist');

  // Verify status + customerId indexing exists for rental_charges
  const hasRentalChargeStatusCustomer = parsed.indexes.some((idx) =>
    idx.collectionGroup === 'rental_charges' &&
    idx.fields.some((f) => f.fieldPath === 'status') &&
    idx.fields.some((f) => f.fieldPath === 'customerId') &&
    idx.fields.some((f) => f.fieldPath === 'dueDate'),
  );
  assert.ok(hasRentalChargeStatusCustomer, 'Index for rental_charges (status, customerId, dueDate) must exist');

  // Verify rentals status ASC and DESC
  const hasRentalsStatusDesc = parsed.indexes.some((idx) =>
    idx.collectionGroup === 'rentals' &&
    idx.fields[0]?.fieldPath === 'status' &&
    idx.fields[1]?.fieldPath === 'startDate' && idx.fields[1]?.order === 'DESCENDING',
  );
  assert.ok(hasRentalsStatusDesc, 'Index for rentals (status ASC, startDate DESC) must exist');

  // Verify rentals customerId ASC and DESC
  const hasRentalsCustomerDesc = parsed.indexes.some((idx) =>
    idx.collectionGroup === 'rentals' &&
    idx.fields[0]?.fieldPath === 'customerId' &&
    idx.fields[1]?.fieldPath === 'startDate' && idx.fields[1]?.order === 'DESCENDING',
  );
  assert.ok(hasRentalsCustomerDesc, 'Index for rentals (customerId ASC, startDate DESC) must exist');

  // Verify fieldOverrides is empty so automatic single-field indexing stays enabled (e.g. payment_allocations.rentalChargeId)
  assert.deepEqual(parsed.fieldOverrides ?? [], [], 'fieldOverrides must remain empty');

  // Verify all 33 payments composite indexes exist
  const filterFields = ['status', 'currency', 'paymentMethod', 'customerId'] as const;
  const subsets: string[][] = [];
  for (let mask = 1; mask < 16; mask += 1) {
    const fields: string[] = [];
    for (let bit = 0; bit < 4; bit += 1) {
      if ((mask & (1 << bit)) !== 0) fields.push(filterFields[bit]!);
    }
    subsets.push(fields);
  }

  for (const subset of subsets) {
    for (const order of ['ASCENDING', 'DESCENDING'] as const) {
      const expected = [...subset.map((f) => `${f}:ASCENDING`), `paymentDate:${order}`].join('|');
      const found = parsed.indexes.some((idx) =>
        idx.collectionGroup === 'payments' &&
        idx.fields.map((f) => `${f.fieldPath}:${f.order}`).join('|') === expected,
      );
      assert.ok(found, `Missing payments search composite index: ${expected}`);
    }
  }

  for (const expected of [
    'rentalId:ASCENDING|paymentDate:DESCENDING',
    'rentalId:ASCENDING|paymentDate:ASCENDING',
    'customerId:ASCENDING|status:ASCENDING',
  ]) {
    const found = parsed.indexes.some((idx) =>
      idx.collectionGroup === 'payments' &&
      idx.fields.map((f) => `${f.fieldPath}:${f.order}`).join('|') === expected,
    );
    assert.ok(found, `Missing payments composite index: ${expected}`);
  }

  for (const expected of [
    'isActive:ASCENDING|partCode:ASCENDING',
    'isActive:ASCENDING|partCode:DESCENDING',
    'isActive:ASCENDING|category:ASCENDING|partCode:ASCENDING',
    'isActive:ASCENDING|category:ASCENDING|partCode:DESCENDING',
    'category:ASCENDING|partCode:ASCENDING',
    'category:ASCENDING|partCode:DESCENDING',
    'isActive:ASCENDING|isLowStock:ASCENDING|partCode:ASCENDING',
    'isActive:ASCENDING|isLowStock:ASCENDING|partCode:DESCENDING',
    'isActive:ASCENDING|category:ASCENDING|isLowStock:ASCENDING|partCode:ASCENDING',
    'isActive:ASCENDING|category:ASCENDING|isLowStock:ASCENDING|partCode:DESCENDING',
    'isActive:ASCENDING|isLowStock:ASCENDING|currentQuantityMinor:ASCENDING',
  ]) {
    const found = parsed.indexes.some((idx) =>
      idx.collectionGroup === 'parts' &&
      idx.fields.map((f) => `${f.fieldPath}:${f.order}`).join('|') === expected,
    );
    assert.ok(found, `Missing parts composite index: ${expected}`);
  }

  for (const expected of [
    'partId:ASCENDING|createdAt:DESCENDING',
    'partId:ASCENDING|createdAt:ASCENDING',
    'movementType:ASCENDING|createdAt:DESCENDING',
    'movementType:ASCENDING|createdAt:ASCENDING',
    'partId:ASCENDING|movementType:ASCENDING|createdAt:DESCENDING',
    'partId:ASCENDING|movementType:ASCENDING|createdAt:ASCENDING',
  ]) {
    const found = parsed.indexes.some((idx) =>
      idx.collectionGroup === 'stock_movements' &&
      idx.fields.map((f) => `${f.fieldPath}:${f.order}`).join('|') === expected,
    );
    assert.ok(found, `Missing stock_movements composite index: ${expected}`);
  }

  for (const expected of [
    'isActive:ASCENDING|name:ASCENDING',
    'isActive:ASCENDING|name:DESCENDING',
  ]) {
    const found = parsed.indexes.some((idx) =>
      idx.collectionGroup === 'suppliers' &&
      idx.fields.map((f) => `${f.fieldPath}:${f.order}`).join('|') === expected,
    );
    assert.ok(found, `Missing suppliers composite index: ${expected}`);
  }

  for (const expected of [
    'bikeId:ASCENDING|serviceDate:DESCENDING',
    'bikeId:ASCENDING|serviceDate:ASCENDING',
    'status:ASCENDING|serviceDate:DESCENDING',
    'status:ASCENDING|serviceDate:ASCENDING',
    'bikeId:ASCENDING|status:ASCENDING|serviceDate:DESCENDING',
    'bikeId:ASCENDING|status:ASCENDING|serviceDate:ASCENDING',
  ]) {
    const found = parsed.indexes.some((idx) =>
      idx.collectionGroup === 'service_records' &&
      idx.fields.map((f) => `${f.fieldPath}:${f.order}`).join('|') === expected,
    );
    assert.ok(found, `Missing service_records composite index: ${expected}`);
  }

  // Stage C7 reports reuses existing composite indexes (status+dueDate on rental_charges)
  const hasChargeStatusDueDateAsc = parsed.indexes.some((idx) =>
    idx.collectionGroup === 'rental_charges' &&
    idx.fields.map((f) => `${f.fieldPath}:${f.order}`).join('|') === 'status:ASCENDING|dueDate:ASCENDING',
  );
  assert.ok(hasChargeStatusDueDateAsc, 'Missing rental_charges index: status:ASCENDING|dueDate:ASCENDING');

  // Stage C8 bikes & customers composite indexes
  const expectedStageC8Indexes: Array<{ collection: string; fields: string }> = [
    { collection: 'bikes', fields: 'isArchived:ASCENDING|createdAt:DESCENDING' },
    { collection: 'bikes', fields: 'isArchived:ASCENDING|createdAt:ASCENDING' },
    { collection: 'bikes', fields: 'status:ASCENDING|createdAt:DESCENDING' },
    { collection: 'bikes', fields: 'status:ASCENDING|createdAt:ASCENDING' },
    { collection: 'bikes', fields: 'isArchived:ASCENDING|status:ASCENDING|createdAt:DESCENDING' },
    { collection: 'bikes', fields: 'isArchived:ASCENDING|status:ASCENDING|createdAt:ASCENDING' },
    { collection: 'customers', fields: 'isArchived:ASCENDING|createdAt:DESCENDING' },
    { collection: 'customers', fields: 'isArchived:ASCENDING|createdAt:ASCENDING' },
  ];
  for (const expected of expectedStageC8Indexes) {
    const found = parsed.indexes.some((idx) =>
      idx.collectionGroup === expected.collection &&
      idx.fields.map((f) => `${f.fieldPath}:${f.order}`).join('|') === expected.fields,
    );
    assert.ok(found, `Missing ${expected.collection} index: ${expected.fields}`);
  }

  // Stage C8.3.1 complete rentals & rental_charges composite index matrix + integrity checks
  const hasPermutedIndex = (
    collectionGroup: string,
    equalityFields: string[],
    sortField: string,
    order: 'ASCENDING' | 'DESCENDING',
  ): boolean => {
    const eqKey = [...equalityFields].sort().join('|');
    return parsed.indexes.some((idx) => {
      if (idx.collectionGroup !== collectionGroup || idx.fields.length !== equalityFields.length + 1) {
        return false;
      }
      const last = idx.fields[idx.fields.length - 1];
      if (!last || last.fieldPath !== sortField || last.order !== order) {
        return false;
      }
      const prefix = idx.fields.slice(0, -1);
      if (prefix.some((f) => f.order !== 'ASCENDING')) {
        return false;
      }
      return prefix.map((f) => f.fieldPath).sort().join('|') === eqKey;
    });
  };

  const buildSubsets = (fields: readonly string[]): string[][] => {
    const result: string[][] = [];
    for (let mask = 1; mask < (1 << fields.length); mask += 1) {
      const subset: string[] = [];
      for (let bit = 0; bit < fields.length; bit += 1) {
        if ((mask & (1 << bit)) !== 0) subset.push(fields[bit]!);
      }
      result.push(subset);
    }
    return result;
  };

  // Validate no duplicate composite indexes or duplicate fieldPath within any index
  const seenSignatures = new Set<string>();
  for (const idx of parsed.indexes) {
    const fieldPaths = idx.fields.map((f) => f.fieldPath);
    assert.equal(
      new Set(fieldPaths).size,
      fieldPaths.length,
      `Invalid duplicate fieldPath in ${idx.collectionGroup}: ${fieldPaths.join(',')}`,
    );
    const sig = `${idx.collectionGroup}|${idx.fields.map((f) => `${f.fieldPath}:${f.order}`).join('|')}`;
    assert.ok(!seenSignatures.has(sig), `Duplicate composite index definition: ${sig}`);
    seenSignatures.add(sig);
  }

  for (const sortField of ['startDate', 'createdAt'] as const) {
    for (const subset of buildSubsets(['status', 'customerId', 'bikeId'])) {
      for (const order of ['ASCENDING', 'DESCENDING'] as const) {
        assert.ok(
          hasPermutedIndex('rentals', subset, sortField, order),
          `Missing rentals index for [${subset.join(',')}] -> ${sortField}:${order}`,
        );
      }
    }
  }
  for (const subset of buildSubsets(['customerId', 'bikeId'])) {
    for (const order of ['ASCENDING', 'DESCENDING'] as const) {
      assert.ok(
        hasPermutedIndex('rentals', subset, 'status', order),
        `Missing rentals index for [${subset.join(',')}] -> status:${order}`,
      );
    }
  }

  // Stage C8.3.3 Strategy 2A composite index quota (< 200) & matrix checks
  assert.ok(
    parsed.indexes.length < 200,
    `Expected < 200 composite indexes for Firestore quota, got ${parsed.indexes.length}`,
  );
  assert.equal(parsed.indexes.length, 151);

  // Redundant indexes must remain removed
  assert.equal(
    parsed.indexes.some((idx) => idx.collectionGroup === 'payment_allocations'),
    false,
    'Redundant payment_allocations single-field composite index must be removed',
  );
  assert.equal(
    parsed.indexes.some(
      (idx) => idx.collectionGroup === 'suppliers' && idx.fields.some((f) => f.fieldPath === 'nameNormalized'),
    ),
    false,
    'Unused suppliers nameNormalized indexes must be removed',
  );

  // Required rentalId composite indexes for chargesForRental, generateNext, and AUTO_FIFO must be preserved
  for (const preserved of [
    'rentalId:ASCENDING|chargeSequence:ASCENDING',
    'rentalId:ASCENDING|chargeSequence:DESCENDING',
    'status:ASCENDING|currency:ASCENDING|rentalId:ASCENDING|dueDate:ASCENDING',
  ]) {
    assert.ok(
      parsed.indexes.some(
        (idx) =>
          idx.collectionGroup === 'rental_charges' &&
          idx.fields.map((f) => `${f.fieldPath}:${f.order}`).join('|') === preserved,
      ),
      `Missing preserved rental_charges index: ${preserved}`,
    );
  }

  for (const sortField of ['dueDate', 'createdAt', 'chargeSequence'] as const) {
    for (const subset of buildSubsets(['status', 'currency', 'customerId'])) {
      for (const order of ['ASCENDING', 'DESCENDING'] as const) {
        assert.ok(
          hasPermutedIndex('rental_charges', subset, sortField, order),
          `Missing rental_charges index for [${subset.join(',')}] -> ${sortField}:${order}`,
        );
      }
    }
  }
  for (const subset of buildSubsets(['currency', 'customerId'])) {
    for (const order of ['ASCENDING', 'DESCENDING'] as const) {
      assert.ok(
        hasPermutedIndex('rental_charges', subset, 'status', order),
        `Missing rental_charges index for [${subset.join(',')}] -> status:${order}`,
      );
    }
  }
});

test('live execution of supported filter and sort queries on Firestore emulator', async (context) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST ||
    !await emulatorIsReachable(process.env.FIRESTORE_EMULATOR_HOST)) {
    context.skip('Run with the Firestore emulator');
    return;
  }

  const { firestore } = initializeFirebase(config);
  for (const collection of [
    'bikes',
    'customers',
    'rentals',
    'rental_charges',
    'payment_allocations',
    'payments',
    'parts',
    'stock_movements',
    'suppliers',
    'service_records',
  ]) {
    await firestore.recursiveDelete(firestore.collection(collection));
  }

  const repo = new RentalRepository(firestore);
  const paymentRepo = new PaymentRepository(firestore);
  const inventoryRepo = new InventoryRepository(firestore);
  const servicingRepo = new ServicingRepository(firestore);
  const reportsRepo = new ReportsRepository(firestore);
  const now = new Date();

  // Seed sample rentals
  const customerId = 'cust-uuid-1';
  const bikeId = 'bike-uuid-1';
  const rentalId = 'rental-uuid-1';

  await firestore.collection('rentals').doc(rentalId).set({
    customerId,
    customerName: 'Test Customer',
    bikeId,
    bikeRegistrationNumber: 'B-01-TST',
    bikeMakeModel: 'Test Bike',
    startDate: '2026-11-01',
    weeklyRate: '100.00',
    currency: 'RON',
    depositAmount: '200.00',
    depositCurrency: 'RON',
    paymentFrequency: 'WEEKLY',
    scheduleAnchorDay: 'START_DAY',
    status: 'ACTIVE',
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
  });

  // Seed sample charges
  for (let seq = 1; seq <= 3; seq++) {
    await firestore.collection('rental_charges').doc(`${rentalId}_${seq}`).set({
      rentalId,
      customerId,
      bikeId,
      chargeSequence: seq,
      periodStartDate: `2026-11-0${seq}`,
      periodEndDate: `2026-11-0${seq + 6}`,
      dueDate: `2026-11-0${seq}`,
      amount: '100.00',
      currency: 'RON',
      status: seq === 1 ? 'PAID' : 'UNPAID',
      paidAmount: seq === 1 ? '100.00' : '0.00',
      remainingAmount: seq === 1 ? '0.00' : '100.00',
      notes: `Charge ${seq}`,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });
  }

  // 1. Test pageRentals combinations
  const rentalFilterCombinations: Array<{ status?: string; customerId?: string; bikeId?: string }> = [
    {},
    { status: 'ACTIVE' },
    { customerId },
    { bikeId },
    { status: 'ACTIVE', customerId },
    { status: 'ACTIVE', bikeId },
    { customerId, bikeId },
    { status: 'ACTIVE', customerId, bikeId },
  ];

  for (const filters of rentalFilterCombinations) {
    for (const sortField of ['startDate', 'createdAt', 'status'] as const) {
      for (const direction of ['ASC', 'DESC'] as const) {
        const pageReq: PageRequest = { page: 0, size: 10, sortField, direction };
        const res = await repo.pageRentals(filters, pageReq);
        assert.ok(
          Array.isArray(res.items),
          `pageRentals failed for filters: ${JSON.stringify(filters)}, sort: ${sortField}, dir: ${direction}`,
        );
      }
    }
  }

  // 2. Test all 16 pageCharges filter combinations x 4 sort fields x 2 directions
  const chargeFilterCombinations: Array<{ status?: string; currency?: string; customerId?: string; rentalId?: string }> = [
    {},
    { status: 'UNPAID' },
    { currency: 'RON' },
    { customerId },
    { rentalId },
    { status: 'UNPAID', currency: 'RON' },
    { status: 'UNPAID', customerId },
    { status: 'UNPAID', rentalId },
    { currency: 'RON', customerId },
    { currency: 'RON', rentalId },
    { customerId, rentalId },
    { status: 'UNPAID', currency: 'RON', customerId },
    { status: 'UNPAID', currency: 'RON', rentalId },
    { status: 'UNPAID', customerId, rentalId },
    { currency: 'RON', customerId, rentalId },
    { status: 'UNPAID', currency: 'RON', customerId, rentalId },
  ];

  for (const filters of chargeFilterCombinations) {
    for (const sortField of ['dueDate', 'createdAt', 'chargeSequence', 'status'] as const) {
      for (const direction of ['ASC', 'DESC'] as const) {
        const pageReq: PageRequest = { page: 0, size: 10, sortField, direction };
        const res = await repo.pageCharges(filters, pageReq);
        assert.ok(
          Array.isArray(res.items),
          `pageCharges failed for filters: ${JSON.stringify(filters)}, sort: ${sortField}, dir: ${direction}`,
        );
      }
    }
  }

  // 3. Test generateNext latestCharge descending query
  const descSnapshot = await firestore.collection('rental_charges')
    .where('rentalId', '==', rentalId)
    .orderBy('chargeSequence', 'desc')
    .limit(1)
    .get();
  assert.equal(descSnapshot.docs.length, 1);
  assert.equal(descSnapshot.docs[0]?.data().chargeSequence, 3);

  // 4. Test chargesForRental ascending query
  const rentalCharges = await repo.chargesForRental(rentalId);
  assert.equal(rentalCharges.length, 3);
  assert.equal(rentalCharges[0]?.chargeSequence, 1);
  assert.equal(rentalCharges[2]?.chargeSequence, 3);

  // 5. Test dueCharges inequality query
  const due = await repo.dueCharges('2026-11-05');
  assert.equal(due.length, 2); // Charges 2 and 3 are UNPAID with dueDate <= 2026-11-05

  // 6. Seed payments and test all 16 filter subsets x 2 sort directions + date ranges + non-search composites
  const paymentId = 'pay-uuid-1';
  await firestore.collection('payments').doc(paymentId).set({
    id: paymentId,
    customerId,
    customerName: 'Test Customer',
    rentalId,
    paymentDate: '2026-11-03',
    amount: '100.00',
    currency: 'RON',
    paymentMethod: 'CASH',
    referenceNumber: null,
    notes: null,
    status: 'CONFIRMED',
    recordedByUserId: 'user-1',
    recordedByUserName: 'Owner',
    allocationMode: 'AUTO_FIFO',
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
  });

  const paymentFilterCombinations: PaymentSearchFilters[] = [];
  for (let mask = 0; mask < 16; mask += 1) {
    const combo: PaymentSearchFilters = {};
    if ((mask & 1) !== 0) combo.status = 'CONFIRMED';
    if ((mask & 2) !== 0) combo.currency = 'RON';
    if ((mask & 4) !== 0) combo.method = 'CASH';
    if ((mask & 8) !== 0) combo.customerId = customerId;
    paymentFilterCombinations.push(combo);
  }

  for (const filters of paymentFilterCombinations) {
    for (const direction of ['ASC', 'DESC'] as const) {
      const pageReq: PageRequest = { page: 0, size: 10, sortField: 'paymentDate', direction };
      const res = await paymentRepo.pagePayments(filters, pageReq);
      assert.equal(
        res.items.length,
        1,
        `pagePayments failed for filters: ${JSON.stringify(filters)}, dir: ${direction}`,
      );
      const ranged = await paymentRepo.pagePayments(
        { ...filters, startDate: '2026-11-01', endDate: '2026-11-05' },
        pageReq,
      );
      assert.equal(ranged.items.length, 1);
    }
  }

  const byCustomer = await paymentRepo.findPaymentsByCustomerId(customerId);
  assert.equal(byCustomer.length, 1);
  const byRental = await paymentRepo.findPaymentsByRentalId(rentalId);
  assert.equal(byRental.length, 1);
  const confirmed = await paymentRepo.findConfirmedPaymentsForCustomer(customerId);
  assert.equal(confirmed.length, 1);

  // 7. Seed Stage C5 inventory collections and verify all query + composite index paths
  const supplierId = 'sup-uuid-1';
  await firestore.collection('suppliers').doc(supplierId).set({
    id: supplierId,
    name: 'Acme Parts SRL',
    nameNormalized: 'acme parts srl',
    contactPerson: 'Ion',
    phone: '+40700000001',
    email: 'ion@acme.ro',
    taxCui: 'RO123',
    address: 'Bucharest',
    notes: null,
    isActive: true,
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
  });

  const partId = 'part-uuid-1';
  await firestore.collection('parts').doc(partId).set({
    id: partId,
    partCode: 'BRK-01',
    name: 'Front Brake Pad',
    category: 'BRAKES',
    description: 'Sintered pad',
    unitOfMeasure: 'PCS',
    currentQuantity: '2.00',
    currentQuantityMinor: 200,
    minReorderLevel: '5.00',
    defaultUnitCost: '45.00',
    costCurrency: 'RON',
    defaultSupplierId: supplierId,
    defaultSupplierName: 'Acme Parts SRL',
    isLowStock: true,
    isActive: true,
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
  });

  await firestore.collection('stock_movements').doc('mov-uuid-1').set({
    id: 'mov-uuid-1',
    partId,
    partCode: 'BRK-01',
    partName: 'Front Brake Pad',
    quantityDelta: '2.00',
    movementType: 'STOCK_IN',
    referenceType: 'INITIAL_SETUP',
    referenceId: null,
    unitCost: '45.00',
    currency: 'RON',
    reason: 'Seeded movement',
    recordedByUserId: 'user-1',
    recordedByUserName: 'Owner',
    createdAt: Timestamp.fromDate(now),
  });

  const lowStock = await inventoryRepo.getLowStockParts();
  assert.equal(lowStock.length, 1);

  for (const includeArchived of [false, true]) {
    for (const lowStockOnly of [false, true]) {
      for (const category of [undefined, 'BRAKES']) {
        for (const direction of ['ASC', 'DESC'] as const) {
          const res = await inventoryRepo.pageParts(
            { includeArchived, lowStockOnly, ...(category ? { category } : {}) },
            { page: 0, size: 10, sortField: 'partCode', direction },
          );
          assert.equal(res.items.length, 1);
        }
      }
    }
  }
  const partSearch = await inventoryRepo.pageParts(
    { includeArchived: false, lowStockOnly: false, category: 'BRAKES', search: 'pad' },
    { page: 0, size: 10, sortField: 'currentQuantity', direction: 'DESC' },
  );
  assert.equal(partSearch.items.length, 1);

  const partMovements = await inventoryRepo.getMovementsForPart(partId);
  assert.equal(partMovements.length, 1);

  const startTs = Timestamp.fromDate(new Date(now.getTime() - 60_000));
  const endTs = Timestamp.fromDate(new Date(now.getTime() + 60_000));
  for (const usePartId of [false, true]) {
    for (const useType of [false, true]) {
      for (const useRange of [false, true]) {
        for (const direction of ['ASC', 'DESC'] as const) {
          const res = await inventoryRepo.pageStockMovements(
            {
              ...(usePartId ? { partId } : {}),
              ...(useType ? { type: 'STOCK_IN' as const } : {}),
              ...(useRange ? { startDate: startTs, endDate: endTs } : {}),
            },
            { page: 0, size: 10, sortField: 'createdAt', direction },
          );
          assert.equal(res.items.length, 1);
        }
      }
    }
  }

  for (const includeArchived of [false, true]) {
    for (const direction of ['ASC', 'DESC'] as const) {
      const res = await inventoryRepo.pageSuppliers(
        { includeArchived },
        { page: 0, size: 10, sortField: 'name', direction },
      );
      assert.equal(res.items.length, 1);
    }
  }
  const supplierSearch = await inventoryRepo.pageSuppliers(
    { includeArchived: false, search: 'acme' },
    { page: 0, size: 10, sortField: 'name', direction: 'ASC' },
  );
  assert.equal(supplierSearch.items.length, 1);

  // 8. Seed Stage C6 service_records and verify all query + composite index paths
  await firestore.collection('service_records').doc('srv-uuid-1').set({
    id: 'srv-uuid-1',
    bikeId,
    bikeRegistrationNumber: 'B-01-TST',
    bikeMakeModel: 'Test Bike',
    serviceDate: '2026-11-04',
    odometerReading: '1500.00',
    serviceProvider: 'Moto Service SRL',
    workPerformed: 'Oil and filter change',
    labourCost: '150.00',
    labourCurrency: 'RON',
    partsCost: '45.00',
    totalCost: '195.00',
    status: 'COMPLETED',
    nextServiceDueDate: '2026-11-10',
    nextServiceDueOdometer: '5000.00',
    notes: null,
    partsUsed: [],
    recordedByUserId: 'user-1',
    recordedByUserName: 'Owner',
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
  });
  await firestore.collection('service_records').doc('srv-uuid-null-due').set({
    id: 'srv-uuid-null-due',
    bikeId: 'other-bike',
    bikeRegistrationNumber: 'B-99-TST',
    bikeMakeModel: 'Other Bike',
    serviceDate: '2026-11-02',
    odometerReading: '800.00',
    serviceProvider: 'Other Shop',
    workPerformed: 'Inspection',
    labourCost: '50.00',
    labourCurrency: 'RON',
    partsCost: '0.00',
    totalCost: '50.00',
    status: 'PLANNED',
    nextServiceDueDate: null,
    nextServiceDueOdometer: null,
    notes: null,
    partsUsed: [],
    recordedByUserId: 'user-1',
    recordedByUserName: 'Owner',
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
  });

  const bikeServices = await servicingRepo.getServicesForBike(bikeId);
  assert.equal(bikeServices.length, 1);

  const dueServices = await servicingRepo.getDueServices('2026-11-15');
  assert.equal(dueServices.length, 1);
  assert.equal(dueServices[0]?.id, 'srv-uuid-1');

  for (const useBike of [false, true]) {
    for (const useStatus of [false, true]) {
      for (const useRange of [false, true]) {
        for (const direction of ['ASC', 'DESC'] as const) {
          const res = await servicingRepo.pageServices(
            {
              ...(useBike ? { bikeId } : {}),
              ...(useStatus ? { status: 'COMPLETED' as ServiceStatus } : {}),
              ...(useRange ? { startDate: '2026-11-03', endDate: '2026-11-05' } : {}),
            },
            { page: 0, size: 10, sortField: 'serviceDate', direction },
          );
          const expectedCount = !useBike && !useStatus && !useRange ? 2 : 1;
          assert.equal(res.items.length, expectedCount);
          assert.equal(res.totalElements, expectedCount);
          if (expectedCount === 2) {
            assert.equal(
              res.items[0]?.id,
              direction === 'ASC' ? 'srv-uuid-null-due' : 'srv-uuid-1',
            );
          } else {
            assert.equal(res.items[0]?.id, 'srv-uuid-1');
          }
        }
      }
    }
  }

  const customServiceSort = await servicingRepo.pageServices(
    {
      bikeId,
      status: 'COMPLETED',
      startDate: '2026-11-01',
      endDate: '2026-11-10',
    },
    { page: 0, size: 10, sortField: 'labourCost', direction: 'DESC' },
  );
  assert.equal(customServiceSort.items.length, 1);

  // Stage C7 live index queries via ReportsRepository
  await firestore.collection('bikes').doc(bikeId).set({
    id: bikeId,
    registrationNumber: 'B-01-TST',
    vin: 'VIN-TEST-1',
    make: 'Honda',
    model: 'CB500X',
    status: 'RENTED',
    isArchived: false,
  });
  const activeBikes = await reportsRepo.listActiveBikes();
  assert.equal(activeBikes.length, 1);
  const overdueCount = await reportsRepo.countOverdueOrDueCharges('2026-12-31');
  assert.equal(overdueCount, 2); // Charges 2 and 3 are UNPAID; Charge 1 is PAID (line 279, matching line 350)
  const lowStockCount = await reportsRepo.countLowStockParts();
  assert.equal(lowStockCount, 1); // part-uuid-1 seeded at lines 425-443 is active and low-stock (matching line 463)
  const confirmedInRange = await reportsRepo.listConfirmedPaymentsInDateRange('2026-11-01', '2026-11-30');
  assert.equal(confirmedInRange.length, 1);
  const bikeServicesRoi = await reportsRepo.listServicesForBike(bikeId);
  assert.equal(bikeServicesRoi.length, 1);
  const bikePaymentsRoi = await reportsRepo.listPaymentsForBikeRoiLiteralParity(bikeId);
  assert.equal(bikePaymentsRoi.length, 0);

  // Stage C8 live index queries via ReferenceRepository (6 bikes indexes + 2 customers indexes)
  const refRepo = new ReferenceRepository(firestore);
  const c8Timestamp = Timestamp.now();
  await firestore.collection('bikes').doc('bike-c8-idx').set({
    id: 'bike-c8-idx',
    registrationNumber: 'B-88-IDX',
    vin: 'VIN-IDX-0088',
    make: 'Honda',
    model: 'NX500',
    manufactureYear: 2024,
    status: 'AVAILABLE',
    isArchived: false,
    currentOdometer: '150.00',
    serviceIntervalDays: 30,
    createdAt: c8Timestamp,
    updatedAt: c8Timestamp,
  });
  await firestore.collection('customers').doc('cust-c8-idx').set({
    id: 'cust-c8-idx',
    fullName: 'Index Test Customer',
    phone: '+40700888999',
    isArchived: false,
    createdAt: c8Timestamp,
    updatedAt: c8Timestamp,
  });

  for (const direction of ['ASC', 'DESC'] as const) {
    assert.equal((await refRepo.queryBikesIndexed({ includeArchived: false }, direction, 5)).length, 1);
    assert.equal((await refRepo.queryBikesIndexed({ includeArchived: true, status: 'AVAILABLE' }, direction, 5)).length, 1);
    assert.equal((await refRepo.queryBikesIndexed({ includeArchived: false, status: 'AVAILABLE' }, direction, 5)).length, 1);
    assert.equal((await refRepo.queryCustomersIndexed({ includeArchived: false }, direction, 5)).length, 1);
  }
});

