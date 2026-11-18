import test from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { toServiceRecordDto } from '../src/servicing/servicing.repository.js';
import {
  computePartUsageTotalCost,
  computeServiceCostTotals,
  fromScale4Units,
  parseDueServicesQuery,
  parseLogServiceInput,
  parseServiceSearchQuery,
  parseUpdateServiceStatusInput,
  scale4ToJson,
  toScale4Units,
  validateServiceStatus,
} from '../src/servicing/servicing.validation.js';
import { UnprocessableEntityError, ValidationError } from '../src/shared/errors.js';

const BIKE_ID = '11111111-1111-4111-8111-111111111111';
const PART_ID_1 = '22222222-2222-4222-8222-222222222222';

test('parseLogServiceInput applies defaults, trims strings, and validates fields', () => {
  const minimal = parseLogServiceInput({
    motorbikeId: BIKE_ID,
    serviceDate: '2026-11-10',
    odometerReading: 12500.5,
    serviceProvider: '  Moto Service SRL  ',
    workPerformed: '  Oil and brake fluid change  ',
  });

  assert.equal(minimal.motorbikeId, BIKE_ID);
  assert.equal(minimal.serviceDate, '2026-11-10');
  assert.equal(minimal.odometerReading, '12500.50');
  assert.equal(minimal.odometerReadingMinor, 1_250_050n);
  assert.equal(minimal.serviceProvider, 'Moto Service SRL');
  assert.equal(minimal.workPerformed, 'Oil and brake fluid change');
  assert.equal(minimal.labourCost, '0.00');
  assert.equal(minimal.labourCurrency, 'RON');
  assert.equal(minimal.status, 'COMPLETED');
  assert.equal(minimal.nextServiceDueDate, null);
  assert.equal(minimal.nextServiceDueOdometer, null);
  assert.equal(minimal.notes, null);
  assert.deepEqual(minimal.partsUsed, []);

  // Explicit status null defaults to COMPLETED per Java LogServiceRequest semantics
  const explicitNullStatus = parseLogServiceInput({
    motorbikeId: BIKE_ID,
    serviceDate: '2026-11-10',
    odometerReading: '0',
    serviceProvider: 'Workshop',
    workPerformed: 'Inspection',
    status: null,
  });
  assert.equal(explicitNullStatus.status, 'COMPLETED');
  assert.equal(explicitNullStatus.odometerReading, '0.00');

  for (const status of ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const) {
    assert.equal(validateServiceStatus(status), status);
    const parsed = parseLogServiceInput({
      motorbikeId: BIKE_ID,
      serviceDate: '2026-11-10',
      odometerReading: 100,
      serviceProvider: 'Workshop',
      workPerformed: 'Check',
      status,
    });
    assert.equal(parsed.status, status);
  }
});

test('parseLogServiceInput rejects invalid payloads, explicit null costs/currency, >2 decimals, and >50 parts', () => {
  const base = {
    motorbikeId: BIKE_ID,
    serviceDate: '2026-11-10',
    odometerReading: 1000,
    serviceProvider: 'Workshop',
    workPerformed: 'Service',
  };

  for (const bad of [
    null,
    [],
    { ...base, motorbikeId: 'not-a-uuid' },
    { ...base, serviceDate: '2026-02-30' },
    { ...base, serviceDate: '10-11-2026' },
    { ...base, odometerReading: -0.01 },
    { ...base, odometerReading: 12.125 },
    { ...base, odometerReading: '1000000000.0' },
    { ...base, serviceProvider: '   ' },
    { ...base, serviceProvider: 'x'.repeat(151) },
    { ...base, workPerformed: '  ' },
    { ...base, labourCost: null },
    { ...base, labourCost: -1 },
    { ...base, labourCost: 10.125 },
    { ...base, labourCurrency: null },
    { ...base, labourCurrency: 'GBP' },
    { ...base, status: 'DONE' },
    { ...base, nextServiceDueDate: '2026-13-01' },
    { ...base, nextServiceDueOdometer: -1 },
    { ...base, nextServiceDueOdometer: '1000000000.0' },
    { ...base, notes: 123 },
  ]) {
    assert.throws(() => parseLogServiceInput(bad), ValidationError);
  }

  const tooManyParts = Array.from({ length: 51 }, () => ({
    partId: PART_ID_1,
    quantity: 1,
  }));
  assert.throws(
    () => parseLogServiceInput({ ...base, partsUsed: tooManyParts }),
    UnprocessableEntityError,
  );
});

test('scale-4 fixed-point calculations preserve BigDecimal accuracy and currency isolation', () => {
  assert.equal(toScale4Units('0.00'), 0n);
  assert.equal(toScale4Units('12.50'), 125_000n);
  assert.equal(toScale4Units('12.5625'), 125_625n);
  assert.equal(fromScale4Units(0n), '0.00');
  assert.equal(fromScale4Units(125_000n), '12.50');
  assert.equal(fromScale4Units(125_620n), '12.562');
  assert.equal(fromScale4Units(125_625n), '12.5625');
  assert.equal(scale4ToJson('12.5625'), 12.5625);
  assert.equal(scale4ToJson('90.00'), 90);

  const line1 = computePartUsageTotalCost('1.25', '10.05');
  assert.equal(line1.totalCost, '12.5625');
  assert.equal(line1.totalCostScale4, 125_625n);

  const line2 = computePartUsageTotalCost('2.00', '45.00');
  assert.equal(line2.totalCost, '90.00');

  // Currency isolation: EUR line must not be added into RON partsCost
  const totals = computeServiceCostTotals('100.00', 'RON', [
    { currency: 'RON', totalCost: line1.totalCost },
    { currency: 'EUR', totalCost: line2.totalCost },
    { currency: 'RON', totalCost: '10.00' },
  ]);
  assert.equal(totals.partsCost, '22.5625');
  assert.equal(totals.totalCost, '122.5625');
});

test('toServiceRecordDto serializes dual bikeRegistrationNumber aliases and numeric totals', () => {
  const dto = toServiceRecordDto({
    id: 'srv-1',
    bikeId: BIKE_ID,
    bikeRegistrationNumber: 'B-99-MOT',
    bikeMakeModel: 'Honda CB500X',
    serviceDate: '2026-11-10',
    odometerReading: '12500.00',
    serviceProvider: 'Moto Shop',
    workPerformed: 'Brake pad replacement',
    labourCost: '150.00',
    labourCurrency: 'RON',
    partsCost: '12.5625',
    totalCost: '162.5625',
    status: 'IN_PROGRESS',
    nextServiceDueDate: '2026-12-10',
    nextServiceDueOdometer: '17500.00',
    notes: 'Check rotors next visit',
    partsUsed: [
      {
        id: 'use-1',
        partId: PART_ID_1,
        partCode: 'BRK-01',
        partName: 'Brake Pad',
        quantity: '1.25',
        unitCost: '10.05',
        currency: 'RON',
        totalCost: '12.5625',
      },
    ],
    recordedByUserId: 'usr-1',
    recordedByUserName: 'Mechanic',
    createdAt: Timestamp.fromDate(new Date('2026-11-10T10:00:00.000Z')),
    updatedAt: Timestamp.fromDate(new Date('2026-11-10T10:00:00.000Z')),
  });

  assert.equal(dto.bikeRegistrationNumber, 'B-99-MOT');
  assert.equal(dto.motorbikeRegistrationNumber, 'B-99-MOT');
  assert.equal(dto.bikeMakeModel, 'Honda CB500X');
  assert.equal(dto.odometerReading, 12500);
  assert.equal(dto.labourCost, 150);
  assert.equal(dto.partsCost, 12.5625);
  assert.equal(dto.totalCost, 162.5625);
  assert.equal(dto.nextServiceDueOdometer, 17500);
  assert.equal(dto.partsUsed.length, 1);
  assert.equal(dto.partsUsed[0]?.totalCost, 12.5625);
  assert.equal(dto.completedAt, null);
  assert.equal(dto.createdAt, '2026-11-10T10:00:00.000Z');
});

test('parseServiceSearchQuery and parseDueServicesQuery validate parameters cleanly', () => {
  const def = parseServiceSearchQuery({});
  assert.equal(def.page.page, 0);
  assert.equal(def.page.size, 20);
  assert.equal(def.page.sortField, 'serviceDate');
  assert.equal(def.page.direction, 'DESC');
  assert.deepEqual(def.filters, {});

  const filtered = parseServiceSearchQuery({
    bikeId: BIKE_ID,
    status: 'PLANNED',
    startDate: '2026-11-01',
    endDate: '2026-11-30',
    page: '1',
    size: '10',
    sort: 'totalCost,asc',
  });
  assert.equal(filtered.filters.bikeId, BIKE_ID);
  assert.equal(filtered.filters.status, 'PLANNED');
  assert.equal(filtered.filters.startDate, '2026-11-01');
  assert.equal(filtered.filters.endDate, '2026-11-30');
  assert.equal(filtered.page.page, 1);
  assert.equal(filtered.page.size, 10);
  assert.equal(filtered.page.sortField, 'totalCost');
  assert.equal(filtered.page.direction, 'ASC');

  assert.throws(() => parseServiceSearchQuery({ bikeId: 'bad-id' }), ValidationError);
  assert.throws(() => parseServiceSearchQuery({ status: 'UNKNOWN' }), ValidationError);
  assert.throws(() => parseServiceSearchQuery({ startDate: '2026-99-01' }), ValidationError);
  assert.throws(() => parseServiceSearchQuery({ sort: 'bikeId,ASC' }), ValidationError);

  assert.equal(parseDueServicesQuery({ asOfDate: '2026-12-31' }), '2026-12-31');
  assert.match(parseDueServicesQuery({}), /^\d{4}-\d{2}-\d{2}$/);
  assert.throws(() => parseDueServicesQuery({ asOfDate: '2026-02-29' }), ValidationError);
});

test('parseUpdateServiceStatusInput strictly validates COMPLETED status payload', () => {
  assert.deepEqual(parseUpdateServiceStatusInput({ status: 'COMPLETED' }), {
    status: 'COMPLETED',
  });

  for (const bad of [
    null,
    undefined,
    [],
    'COMPLETED',
    {},
    { status: 'PLANNED' },
    { status: 'IN_PROGRESS' },
    { status: 'CANCELLED' },
    { status: 'DONE' },
    { status: null },
    { status: 'COMPLETED', extra: true },
  ]) {
    assert.throws(() => parseUpdateServiceStatusInput(bad), ValidationError);
  }
});
