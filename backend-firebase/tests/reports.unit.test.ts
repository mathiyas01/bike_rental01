import test from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  MAX_REPORT_SCAN_DOCS,
  type BikeRoiDto,
} from '../src/reports/reports.types.js';
import { ReportsRepository } from '../src/reports/reports.repository.js';
import {
  computeBikeRoiDto,
  computeDashboardKpiDto,
  computeDateRangeReportDto,
  computeFleetUtilizationDto,
  timestampToUtcDate,
} from '../src/reports/reports.service.js';
import { parseBikeRoiIdParam, parseDateRangeQuery } from '../src/reports/reports.validation.js';
import {
  BusinessError,
  UnprocessableEntityError,
  ValidationError,
} from '../src/shared/errors.js';
import {
  fromMinorUnits,
  fromScale4Units,
  minorToScale4Units,
  minorUnitsToJson,
  moneyToJson,
  multiplyMinorToScale4Units,
  scale4ToJson,
  scale4UnitsToJson,
  toMinorUnits,
  toScale4Units,
} from '../src/shared/money.js';

const BIKE_ID = '11111111-1111-4111-8111-111111111111';
const PART_ID = '22222222-2222-4222-8222-222222222222';

test('shared pure financial utility preserves BigInt scale-2/scale-4 precision and guards large JSON serialization', () => {
  assert.equal(toMinorUnits('12.50'), 1250n);
  assert.equal(fromMinorUnits(1250n), '12.50');
  assert.equal(toScale4Units('12.5625'), 125_625n);
  assert.equal(fromScale4Units(125_625n), '12.5625');
  assert.equal(fromScale4Units(10_000n), '1.00');
  assert.equal(fromScale4Units(-125_625n), '-12.5625');

  // Exact scale-2 * scale-2 -> scale-4 without float drift
  const product = multiplyMinorToScale4Units(toMinorUnits('1.25'), toMinorUnits('10.05'));
  assert.equal(product, 125_625n);
  assert.equal(scale4UnitsToJson(product), 12.5625);

  // Lifting scale-2 to scale-4 before mixed-scale addition/subtraction
  const labourScale4 = minorToScale4Units(toMinorUnits('100.00'));
  assert.equal(labourScale4, 1_000_000n);
  assert.equal(scale4UnitsToJson(labourScale4 + product), 112.5625);
  assert.equal(scale4UnitsToJson(minorToScale4Units(toMinorUnits('50.00')) - product), 37.4375);

  // Classic binary float failure case stays exact
  assert.equal(
    scale4UnitsToJson(multiplyMinorToScale4Units(toMinorUnits('0.01'), toMinorUnits('0.01'))),
    0.0001,
  );
  assert.equal(minorUnitsToJson(toMinorUnits('0.10') + toMinorUnits('0.20')), 0.3);

  // Large values that fit losslessly in IEEE-754 double serialize cleanly
  assert.equal(minorUnitsToJson(99_999_999_999_999n), 999999999999.99);
  assert.equal(scale4UnitsToJson(1_000_000_000_001_234n), 100000000000.1234);
  assert.equal(scale4UnitsToJson(-1_000_000_000_001_234n), -100000000000.1234);

  // Values that would silently lose .01 or .0001 precision (or exceed MAX_SAFE_INTEGER) throw
  assert.throws(() => moneyToJson('90071992547409.91'), /safe JSON serialization range/);
  assert.throws(() => moneyToJson('90071992547409.92'), /safe JSON serialization range/);
  assert.throws(() => minorUnitsToJson(BigInt(Number.MAX_SAFE_INTEGER) + 1n), /safe JSON serialization range/);
  assert.throws(() => scale4ToJson('900719925474.0993'), /safe JSON serialization range/);
  assert.throws(() => scale4UnitsToJson(-9_007_199_254_740_993n), /safe JSON serialization range/);
  assert.throws(() => scale4UnitsToJson(10n ** 21n), /safe JSON serialization range/);
});

test('parseDateRangeQuery and parseBikeRoiIdParam enforce all Stage C7.0.1 validation rules', () => {
  // Valid: fromDate < toDate
  assert.deepEqual(
    parseDateRangeQuery({ fromDate: '2026-06-01', toDate: '2026-06-30' }),
    { fromDate: '2026-06-01', toDate: '2026-06-30' },
  );

  // Valid: fromDate === toDate (single-day inclusive window)
  assert.deepEqual(
    parseDateRangeQuery({ fromDate: '2026-06-15', toDate: '2026-06-15' }),
    { fromDate: '2026-06-15', toDate: '2026-06-15' },
  );

  // Invalid: fromDate > toDate -> 400 BusinessError (intentional deviation from Java 500)
  assert.throws(
    () => parseDateRangeQuery({ fromDate: '2026-06-20', toDate: '2026-06-10' }),
    (err) => err instanceof BusinessError && err.status === 400 && err.message === 'fromDate cannot be after toDate',
  );

  // Invalid date formats -> 400 ValidationError
  for (const invalidQuery of [
    { fromDate: '2026-02-30', toDate: '2026-03-01' },
    { fromDate: '2026-06-01', toDate: 'not-a-date' },
    { fromDate: '15/06/2026', toDate: '2026-06-30' },
    { fromDate: ['2026-06-01'], toDate: '2026-06-30' },
  ]) {
    assert.throws(
      () => parseDateRangeQuery(invalidQuery),
      (err) => err instanceof ValidationError && err.status === 400,
    );
  }

  // Missing required parameters -> 400 ValidationError
  for (const missingQuery of [
    {},
    { fromDate: '2026-06-01' },
    { toDate: '2026-06-30' },
    { fromDate: '   ', toDate: '2026-06-30' },
  ]) {
    assert.throws(
      () => parseDateRangeQuery(missingQuery),
      (err) => err instanceof ValidationError && err.status === 400,
    );
  }

  assert.equal(parseBikeRoiIdParam(BIKE_ID), BIKE_ID);
  assert.throws(
    () => parseBikeRoiIdParam('not-a-uuid'),
    (err) => err instanceof ValidationError && err.status === 400,
  );
});

test('empty-data behavior returns exact zero-initialized DTOs across all four reports', () => {
  assert.deepEqual(
    computeDashboardKpiDto({
      bikes: [],
      overdueChargesCount: 0,
      lowStockPartsCount: 0,
      monthlyConfirmedPayments: [],
    }),
    {
      activeRentalsCount: 0,
      availableBikesCount: 0,
      inServiceBikesCount: 0,
      totalFleetCount: 0,
      overdueChargesCount: 0,
      lowStockPartsCount: 0,
      monthlyRevenue: { RON: 0, EUR: 0, USD: 0 },
      monthlyExpenses: { RON: 0, EUR: 0, USD: 0 },
    },
  );

  assert.deepEqual(computeFleetUtilizationDto([]), {
    totalBikes: 0,
    rentedBikes: 0,
    availableBikes: 0,
    inMaintenanceBikes: 0,
    utilizationRate: 0,
  });

  assert.deepEqual(
    computeDateRangeReportDto({
      fromDate: '2026-06-01',
      toDate: '2026-06-30',
      rentals: [],
      confirmedPayments: [],
      services: [],
      stockMovements: [],
    }),
    {
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
    },
  );

  const emptyRoi: BikeRoiDto = computeBikeRoiDto({
    bike: { id: BIKE_ID, registrationNumber: 'B-01-MOT', make: 'Honda', model: 'CB500X' },
    payments: [],
    services: [],
  });
  assert.deepEqual(emptyRoi, {
    bikeId: BIKE_ID,
    registrationNumber: 'B-01-MOT',
    makeModel: 'Honda CB500X',
    totalRevenue: { RON: 0, EUR: 0, USD: 0 },
    totalMaintenanceCost: { RON: 0, EUR: 0, USD: 0 },
    netProfit: { RON: 0, EUR: 0, USD: 0 },
  });
});

test('dashboard KPIs and fleet utilization preserve Java bike status semantics and currency isolation', () => {
  const bikes = [
    { status: 'AVAILABLE' as const, isArchived: false },
    { status: 'RENTED' as const, isArchived: false },
    { status: 'IN_SERVICE' as const, isArchived: false },
    { status: 'INACTIVE' as const, isArchived: false },
    { status: 'RENTED' as const, isArchived: true }, // Archived must be excluded
  ];

  const util = computeFleetUtilizationDto(bikes);
  assert.deepEqual(util, {
    totalBikes: 4,
    rentedBikes: 1,
    availableBikes: 1,
    inMaintenanceBikes: 1,
    utilizationRate: 25,
  });

  const kpi = computeDashboardKpiDto({
    bikes,
    overdueChargesCount: 3,
    lowStockPartsCount: 2,
    monthStartDate: '2026-06-01',
    monthEndDate: '2026-06-15',
    monthlyConfirmedPayments: [
      { amount: '150.25', currency: 'RON', status: 'CONFIRMED', paymentDate: '2026-06-01' },
      { amount: '49.75', currency: 'ron' as never, status: 'CONFIRMED', paymentDate: '2026-06-15' },
      { amount: '999.00', currency: 'RON', status: 'REVERSED', paymentDate: '2026-06-10' },
      { amount: '80.00', currency: 'EUR', status: 'CONFIRMED', paymentDate: '2026-05-31' }, // Out of range
      { amount: '30.50', currency: 'GBP' as never, status: 'CONFIRMED', paymentDate: '2026-06-12' }, // Unknown ignored
    ],
  });

  assert.deepEqual(kpi, {
    activeRentalsCount: 1,
    availableBikesCount: 1,
    inServiceBikesCount: 1,
    totalFleetCount: 4,
    overdueChargesCount: 3,
    lowStockPartsCount: 2,
    monthlyRevenue: { RON: 200, EUR: 0, USD: 0 },
    monthlyExpenses: { RON: 0, EUR: 0, USD: 0 },
  });
});

test('date-range calculations enforce inclusive boundaries, scale-4 unrounded precision, and movement filtering', () => {
  const fromDate = '2026-06-01';
  const toDate = '2026-06-01'; // Equal bounds -> single-day inclusive window

  const report = computeDateRangeReportDto({
    fromDate,
    toDate,
    rentals: [
      { startDate: '2026-05-31', status: 'ACTIVE' },
      { startDate: '2026-06-01', status: 'ACTIVE' },
      { startDate: '2026-06-01', status: 'CLOSED' },
      { startDate: '2026-06-01', status: 'CANCELLED' },
      { startDate: '2026-06-02', status: 'CLOSED' },
    ],
    confirmedPayments: [
      { amount: '100.10', currency: 'RON', status: 'CONFIRMED', paymentDate: '2026-06-01' },
      { amount: '200.20', currency: 'RON', status: 'CONFIRMED', paymentDate: '2026-06-01' },
      { amount: '50.00', currency: 'RON', status: 'REVERSED', paymentDate: '2026-06-01' },
      { amount: '75.00', currency: 'EUR', status: 'CONFIRMED', paymentDate: '2026-06-02' },
    ],
    services: [
      {
        serviceDate: '2026-06-01',
        labourCost: '150.00',
        labourCurrency: 'RON',
        partsUsed: [
          {
            id: 'u1',
            partId: PART_ID,
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
        serviceDate: '2026-06-01',
        labourCost: '40.00',
        labourCurrency: 'EUR',
        partsUsed: [],
      },
      {
        serviceDate: '2026-05-31',
        labourCost: '999.00',
        labourCurrency: 'RON',
        partsUsed: [],
      },
    ],
    stockMovements: [
      {
        createdAt: Timestamp.fromDate(new Date('2026-06-01T00:00:00.000Z')),
        quantityDelta: '3.50',
        unitCost: '2.05',
        currency: 'USD',
        movementType: 'STOCK_IN',
      },
      {
        createdAt: Timestamp.fromDate(new Date('2026-06-01T23:59:59.999Z')),
        quantityDelta: '1.00',
        unitCost: '4.11',
        currency: 'USD',
        movementType: 'RETURN',
      },
      {
        createdAt: Timestamp.fromDate(new Date('2026-06-01T12:00:00.000Z')),
        quantityDelta: '-2.75',
        unitCost: '3.33',
        currency: 'RON',
        movementType: 'SERVICE_USAGE',
      },
      {
        createdAt: Timestamp.fromDate(new Date('2026-06-01T12:00:00.000Z')),
        quantityDelta: '-1.00',
        unitCost: '10.00',
        currency: 'EUR',
        movementType: 'STOCK_OUT',
      },
      {
        // ADJUSTMENT & REVERSAL are ignored by Java ReportService
        createdAt: Timestamp.fromDate(new Date('2026-06-01T12:00:00.000Z')),
        quantityDelta: '100.00',
        unitCost: '50.00',
        currency: 'RON',
        movementType: 'ADJUSTMENT',
      },
      {
        createdAt: Timestamp.fromDate(new Date('2026-06-01T12:00:00.000Z')),
        quantityDelta: '-100.00',
        unitCost: '50.00',
        currency: 'RON',
        movementType: 'REVERSAL',
      },
      {
        // Next UTC day excluded even with identical dates
        createdAt: Timestamp.fromDate(new Date('2026-06-02T00:00:00.000Z')),
        quantityDelta: '5.00',
        unitCost: '10.00',
        currency: 'RON',
        movementType: 'STOCK_IN',
      },
    ],
  });

  assert.equal(timestampToUtcDate(Timestamp.fromDate(new Date('2026-06-01T23:59:59.999Z'))), '2026-06-01');
  assert.deepEqual(report, {
    totalRentals: 3,
    activeRentals: 1,
    closedRentals: 1,
    serviceCount: 2,
    revenue: { RON: 300.3, EUR: 0, USD: 0 },
    labourCost: { RON: 150, EUR: 40, USD: 0 },
    sparePartsCost: { RON: 12.5625, EUR: 0, USD: 0 },
    stockInQuantity: { TOTAL: 4.5 },
    stockOutQuantity: { TOTAL: 3.75 },
    stockInCost: { RON: 0, EUR: 0, USD: 11.285 },
    stockOutCost: { RON: 9.1575, EUR: 10, USD: 0 },
  });
});

test('Bike ROI calculation distinguishes literal Java parity from proposed rental-linked fix', () => {
  const bike = {
    id: BIKE_ID,
    registrationNumber: 'B-77-ROI',
    make: 'Yamaha',
    model: 'Tracer 7',
  };
  const services = [
    {
      labourCost: '100.00',
      labourCurrency: 'RON' as const,
      partsUsed: [
        {
          id: 'u1',
          partId: PART_ID,
          partCode: 'BRK-1',
          partName: 'Brake Pad',
          quantity: '1.25',
          unitCost: '10.05',
          currency: 'RON' as const,
          totalCost: '12.5625',
        },
      ],
    },
  ];

  // Case A: Under literal Java parity, payments passed to computeBikeRoiDto are only those where
  // payment.rentalId === bikeId. Normal domain payments against rentalId != bikeId produce 0 revenue.
  // (A future approved business-rule change would resolve rental.bikeId === bikeId and filter CONFIRMED.)
  const normalDomainRoi = computeBikeRoiDto({
    bike,
    payments: [],
    services,
  });
  assert.deepEqual(normalDomainRoi.totalRevenue, { RON: 0, EUR: 0, USD: 0 });
  assert.deepEqual(normalDomainRoi.totalMaintenanceCost, { RON: 112.5625, EUR: 0, USD: 0 });
  assert.deepEqual(normalDomainRoi.netProfit, { RON: -112.5625, EUR: 0, USD: 0 });

  // Case B: When payments have rentalId === bikeId, Java includes BOTH CONFIRMED and REVERSED payments.
  const literalParityRoi = computeBikeRoiDto({
    bike,
    payments: [
      { amount: '250.00', currency: 'RON', status: 'CONFIRMED' },
      { amount: '50.00', currency: 'RON', status: 'REVERSED' },
      { amount: '20.00', currency: 'EUR', status: 'CONFIRMED' },
    ],
    services,
  });
  assert.deepEqual(literalParityRoi.totalRevenue, { RON: 300, EUR: 20, USD: 0 });
  assert.deepEqual(literalParityRoi.totalMaintenanceCost, { RON: 112.5625, EUR: 0, USD: 0 });
  assert.deepEqual(literalParityRoi.netProfit, { RON: 187.4375, EUR: 20, USD: 0 });
});

test('ReportsRepository enforces bounded scan limit (422 UnprocessableEntityError) and avoids unbounded reads', async () => {
  const capturedLimits: number[] = [];
  const fakeDocs = Array.from({ length: MAX_REPORT_SCAN_DOCS + 1 }, (_, index) => ({
    id: `doc-${index}`,
    data: () => ({
      isArchived: false,
      status: 'AVAILABLE',
      registrationNumber: `B-${index}`,
      make: 'Honda',
      model: 'CB',
    }),
  }));

  const buildChain = () => ({
    where: () => buildChain(),
    orderBy: () => buildChain(),
    limit: (value: number) => {
      capturedLimits.push(value);
      return buildChain();
    },
    get: async () => ({ docs: fakeDocs }),
  });

  const stubFirestore = {
    collection: () => buildChain(),
  } as unknown as Firestore;

  const repository = new ReportsRepository(stubFirestore);
  await assert.rejects(
    () => repository.listActiveBikes(),
    (err) => err instanceof UnprocessableEntityError && err.status === 422,
  );
  assert.deepEqual(capturedLimits, [MAX_REPORT_SCAN_DOCS + 1]);
});
