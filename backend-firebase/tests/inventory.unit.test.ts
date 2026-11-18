import test from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { toPartDto } from '../src/inventory/inventory.repository.js';
import {
  MAX_COMMIT_PAYLOAD_BYTES,
  MAX_COST_MINOR,
  MAX_QUANTITY_MINOR,
  MAX_SERVICE_PARTS_ITEMS,
  MAX_TRANSACTION_WRITES,
} from '../src/inventory/inventory.types.js';
import {
  assertTransactionBudget,
  computeSignedDeltaMinor,
  estimateCommitPayloadBytes,
  isPartLowStock,
  parseBoundedDecimal,
  parseCreatePartInput,
  parseCreateSupplierInput,
  parsePartSearchQuery,
  parseRecordStockMovementInput,
  parseServicePartsUsed,
  parseStockMovementSearchQuery,
  parseSupplierSearchQuery,
  parseUpdatePartInput,
} from '../src/inventory/inventory.validation.js';
import { UnprocessableEntityError, ValidationError } from '../src/shared/errors.js';

const PART_ID = '11111111-1111-4111-8111-111111111111';
const SUPPLIER_ID = '22222222-2222-4222-8222-222222222222';

test('scale-2 decimal validation accepts finite numbers and strings, rejects >2 decimals, negatives, and overflow', () => {
  assert.deepEqual(parseBoundedDecimal(15.5, 'q', 0, MAX_QUANTITY_MINOR), {
    canonical: '15.50',
    minor: 1550n,
  });
  assert.deepEqual(parseBoundedDecimal('15.50', 'q', 0.01, MAX_QUANTITY_MINOR), {
    canonical: '15.50',
    minor: 1550n,
  });
  assert.deepEqual(parseBoundedDecimal(0, 'q', 0, MAX_QUANTITY_MINOR), {
    canonical: '0.00',
    minor: 0n,
  });
  assert.deepEqual(parseBoundedDecimal('999999999999.99', 'cost', 0, MAX_COST_MINOR), {
    canonical: '999999999999.99',
    minor: MAX_COST_MINOR,
  });

  for (const bad of [15.125, '15.125', -1, '-0.01', 'abc', null, undefined, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => parseBoundedDecimal(bad, 'q', 0, MAX_QUANTITY_MINOR),
      ValidationError,
    );
  }
  assert.throws(
    () => parseBoundedDecimal('100000000.00', 'q', 0, MAX_QUANTITY_MINOR),
    ValidationError,
  );
  assert.throws(
    () => parseBoundedDecimal('1000000000000.00', 'cost', 0, MAX_COST_MINOR),
    ValidationError,
  );
});

test('parseCreatePartInput normalizes defaults and rejects explicit null defaults', () => {
  const created = parseCreatePartInput({
    partCode: ' brk-01 ',
    name: ' Brake Pad ',
    category: ' brakes ',
  });
  assert.equal(created.partCode, 'BRK-01');
  assert.equal(created.name, 'Brake Pad');
  assert.equal(created.category, 'BRAKES');
  assert.equal(created.unitOfMeasure, 'PCS');
  assert.equal(created.initialQuantity, '0.00');
  assert.equal(created.minReorderLevel, '2.00');
  assert.equal(created.defaultUnitCost, '0.00');
  assert.equal(created.costCurrency, 'RON');
  assert.equal(created.defaultSupplierId, null);

  assert.throws(
    () =>
      parseCreatePartInput({
        partCode: 'BRK-01',
        name: 'Brake Pad',
        category: 'BRAKES',
        unitOfMeasure: null,
      }),
    ValidationError,
  );
  assert.throws(
    () =>
      parseCreatePartInput({
        partCode: 'BRK-01',
        name: 'Brake Pad',
        category: 'BRAKES',
        initialQuantity: null,
      }),
    ValidationError,
  );
});

test('parseUpdatePartInput enforces required unitOfMeasure, preserves casing, and requires minReorderLevel/defaultUnitCost', () => {
  const updated = parseUpdatePartInput({
    name: 'Front Pad',
    category: 'brakes',
    unitOfMeasure: 'liters',
    minReorderLevel: 5,
    defaultUnitCost: '12.50',
    defaultSupplierId: SUPPLIER_ID,
  });
  assert.equal(updated.category, 'BRAKES');
  assert.equal(updated.unitOfMeasure, 'liters');
  assert.equal(updated.minReorderLevel, '5.00');
  assert.equal(updated.defaultUnitCost, '12.50');
  assert.equal(updated.defaultSupplierId, SUPPLIER_ID);

  for (const badUnit of [undefined, null, '', '   ', 'x'.repeat(21)]) {
    assert.throws(
      () =>
        parseUpdatePartInput({
          name: 'Front Pad',
          category: 'BRAKES',
          ...(badUnit !== undefined ? { unitOfMeasure: badUnit } : {}),
          minReorderLevel: '5.00',
          defaultUnitCost: '12.50',
        }),
      ValidationError,
    );
  }

  assert.throws(
    () =>
      parseUpdatePartInput({
        name: 'Front Pad',
        category: 'BRAKES',
        defaultUnitCost: '12.50',
      }),
    ValidationError,
  );
  assert.throws(
    () =>
      parseUpdatePartInput({
        name: 'Front Pad',
        category: 'BRAKES',
        minReorderLevel: '5.00',
        defaultUnitCost: null,
      }),
    ValidationError,
  );
});

test('parseRecordStockMovementInput preserves @DecimalMin(0.01), currency defaults, and strict enum check', () => {
  const omittedCurrency = parseRecordStockMovementInput({
    partId: PART_ID,
    quantity: 3,
    movementType: 'STOCK_IN',
  });
  assert.equal(omittedCurrency.currency, 'RON');
  assert.equal(omittedCurrency.unitCost, null);

  // Stage C8.4.1: Flutter inventory enum aliases & React empty unitCost string compatibility
  const flutterPurchase = parseRecordStockMovementInput({
    partId: PART_ID,
    quantity: 2,
    movementType: 'PURCHASE',
    unitCost: '',
  });
  assert.equal(flutterPurchase.movementType, 'STOCK_IN');
  assert.equal(flutterPurchase.unitCost, null);

  const flutterUsage = parseRecordStockMovementInput({
    partId: PART_ID,
    quantity: 1,
    movementType: 'USAGE_NON_SERVICE',
  });
  assert.equal(flutterUsage.movementType, 'STOCK_OUT');

  const nullCurrency = parseRecordStockMovementInput({
    partId: PART_ID,
    quantity: '2.50',
    movementType: 'ADJUSTMENT',
    currency: null,
  });
  assert.equal(nullCurrency.currency, null);
  assert.equal(nullCurrency.quantity, '2.50');

  for (const zeroOrNeg of [0, '0.00', -1, '-0.50']) {
    assert.throws(
      () =>
        parseRecordStockMovementInput({
          partId: PART_ID,
          quantity: zeroOrNeg,
          movementType: 'ADJUSTMENT',
        }),
      ValidationError,
    );
    assert.throws(
      () =>
        parseRecordStockMovementInput({
          partId: PART_ID,
          quantity: zeroOrNeg,
          movementType: 'REVERSAL',
        }),
      ValidationError,
    );
  }

  for (const invalidType of ['INVALID_TYPE', 'stock_in']) {
    assert.throws(
      () =>
        parseRecordStockMovementInput({
          partId: PART_ID,
          quantity: 1,
          movementType: invalidType,
        }),
      ValidationError,
    );
  }
});

test('computeSignedDeltaMinor resolves sign across all 6 StockMovementType values', () => {
  assert.equal(computeSignedDeltaMinor('STOCK_IN', 250n), 250n);
  assert.equal(computeSignedDeltaMinor('RETURN', 250n), 250n);
  assert.equal(computeSignedDeltaMinor('STOCK_OUT', 250n), -250n);
  assert.equal(computeSignedDeltaMinor('SERVICE_USAGE', 250n), -250n);
  assert.equal(computeSignedDeltaMinor('ADJUSTMENT', 250n), 250n);
  assert.equal(computeSignedDeltaMinor('ADJUSTMENT', -250n), -250n);
  assert.equal(computeSignedDeltaMinor('REVERSAL', 250n), 250n);
  assert.equal(computeSignedDeltaMinor('REVERSAL', -250n), -250n);
});

test('isPartLowStock boundary and PartDto dual wire key emission', () => {
  assert.equal(isPartLowStock(201n, 200n), false);
  assert.equal(isPartLowStock(200n, 200n), true);
  assert.equal(isPartLowStock(199n, 200n), true);

  const now = Timestamp.fromDate(new Date('2026-11-16T00:00:00.000Z'));
  const dto = toPartDto({
    id: PART_ID,
    partCode: 'BRK-01',
    name: 'Pad',
    category: 'BRAKES',
    description: null,
    unitOfMeasure: 'PCS',
    currentQuantity: '2.00',
    currentQuantityMinor: 200,
    minReorderLevel: '2.00',
    defaultUnitCost: '10.00',
    costCurrency: 'RON',
    defaultSupplierId: null,
    defaultSupplierName: null,
    isLowStock: true,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  assert.equal(dto.lowStock, true);
  assert.equal(dto.isLowStock, true);
  assert.equal(dto.active, true);
  assert.equal(dto.currentQuantity, 2);
});

test('parseCreateSupplierInput allows non-standard email strings up to 150 chars and validates search queries', () => {
  const supplier = parseCreateSupplierInput({
    name: '  Acme Parts  ',
    email: 'internal-alias',
  });
  assert.equal(supplier.name, 'Acme Parts');
  assert.equal(supplier.nameNormalized, 'acme parts');
  assert.equal(supplier.email, 'internal-alias');

  const partQuery = parsePartSearchQuery({
    includeArchived: 'true',
    lowStockOnly: 'false',
    active: 'false',
    category: 'brakes',
    search: '  pad ',
    sort: 'active,desc',
  });
  assert.equal(partQuery.filters.includeArchived, true);
  assert.equal(partQuery.filters.lowStockOnly, false);
  assert.equal(partQuery.filters.active, false);
  assert.equal(partQuery.filters.category, 'BRAKES');
  assert.equal(partQuery.filters.search, 'pad');
  assert.equal(partQuery.page.sortField, 'active');
  assert.equal(partQuery.page.direction, 'DESC');

  const partDefaultActive = parsePartSearchQuery({});
  assert.equal(partDefaultActive.filters.active, undefined);

  assert.throws(() => parsePartSearchQuery({ active: 'invalid' }), ValidationError);

  const supQuery = parsePartSearchQuery({ sort: 'active,asc', active: 'true' });
  assert.equal(supQuery.filters.active, true);
  assert.equal(supQuery.page.sortField, 'active');
  assert.throws(() => parsePartSearchQuery({ sort: 'unknown,asc' }), ValidationError);

  const supplierDefault = parseSupplierSearchQuery({});
  assert.equal(supplierDefault.filters.includeArchived, false);
  assert.equal(supplierDefault.filters.active, undefined);
  assert.equal(supplierDefault.page.sortField, 'name');
  assert.equal(supplierDefault.page.direction, 'ASC');

  const supplierActiveSort = parseSupplierSearchQuery({
    includeArchived: 'true',
    active: 'false',
    sort: 'active,desc',
  });
  assert.equal(supplierActiveSort.filters.includeArchived, true);
  assert.equal(supplierActiveSort.filters.active, false);
  assert.equal(supplierActiveSort.page.sortField, 'active');
  assert.equal(supplierActiveSort.page.direction, 'DESC');
  assert.throws(() => parseSupplierSearchQuery({ active: 'invalid' }), ValidationError);

  const movQuery = parseStockMovementSearchQuery({
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2026-01-02T23:59:59.999999999+02:00',
  });
  assert.ok(movQuery.filters.startDate instanceof Timestamp);
  assert.equal(movQuery.filters.endDate?.nanoseconds, 999999999);

  assert.throws(
    () => parseStockMovementSearchQuery({ startDate: '2026-02-30T00:00:00Z' }),
    ValidationError,
  );
  assert.throws(
    () => parseStockMovementSearchQuery({ startDate: 'not-a-timestamp' }),
    ValidationError,
  );
});

test('Stage C6 parseServicePartsUsed and assertTransactionBudget enforce 422 bounds', () => {
  assert.deepEqual(parseServicePartsUsed(undefined), []);
  const currencyDefaults = parseServicePartsUsed([
    { partId: PART_ID, quantity: 1 },
    { partId: PART_ID, quantity: 1, currency: null },
    { partId: PART_ID, quantity: 1, currency: 'EUR' },
  ]);
  assert.equal(currencyDefaults[0]?.currency, 'RON');
  assert.equal(currencyDefaults[1]?.currency, null);
  assert.equal(currencyDefaults[2]?.currency, 'EUR');
  const oversized = Array.from({ length: MAX_SERVICE_PARTS_ITEMS + 1 }, () => ({
    partId: PART_ID,
    quantity: 1,
  }));
  assert.throws(() => parseServicePartsUsed(oversized), UnprocessableEntityError);

  const tooManyWrites = Array.from({ length: MAX_TRANSACTION_WRITES + 1 }, (_, i) => ({
    path: `stock_movements/m-${i}`,
    data: { id: `m-${i}` },
  }));
  assert.throws(() => assertTransactionBudget(tooManyWrites), UnprocessableEntityError);

  const hugeDocBytes = estimateCommitPayloadBytes([
    { path: 'parts/big', data: { payload: 'x'.repeat(MAX_COMMIT_PAYLOAD_BYTES) } },
  ]);
  assert.ok(hugeDocBytes > MAX_COMMIT_PAYLOAD_BYTES);
  assert.throws(
    () => assertTransactionBudget([{ path: 'parts/big', data: { payload: 'x'.repeat(MAX_COMMIT_PAYLOAD_BYTES) } }]),
    UnprocessableEntityError,
  );
});
