import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { todayUtc } from '../src/shared/dates.js';
import { UnprocessableEntityError, ValidationError } from '../src/shared/errors.js';
import { parsePage } from '../src/shared/pagination.js';
import {
  ReferenceRepository,
  bikeRecordFrom,
  bikeRegLockId,
  bikeVinLockId,
  customerPhoneLockId,
  customerRecordFrom,
  filterAndSortBikes,
  filterAndSortCustomers,
  toBikeDto,
  toCustomerDto,
} from '../src/reference/reference.repository.js';
import {
  MAX_ODOMETER_MINOR,
  MAX_SEARCH_SCAN_DOCS,
} from '../src/reference/reference.types.js';
import {
  parseBikeSearchQuery,
  parseCreateBikeInput,
  parseCreateCustomerInput,
  parseCustomerSearchQuery,
  parseUpdateBikeInput,
  parseUpdateBikeStatusInput,
  parseUpdateCustomerInput,
  validateBikeStatus,
} from '../src/reference/reference.validation.js';

function assertValidationFailure(fn: () => unknown, expectedField?: string): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof ValidationError, `Expected ValidationError, got ${String(error)}`);
    if (expectedField) {
      assert.equal(error.validationErrors[0]?.field, expectedField);
    }
    return true;
  });
}

test('validateBikeStatus accepts valid enum values and rejects unknown values', () => {
  for (const status of ['AVAILABLE', 'RENTED', 'IN_SERVICE', 'INACTIVE']) {
    assert.equal(validateBikeStatus(status), status);
  }
  assertValidationFailure(() => validateBikeStatus('BROKEN'), 'status');
  assertValidationFailure(() => validateBikeStatus(''), 'status');
  assertValidationFailure(() => validateBikeStatus(null), 'status');
});

test('parseCreateBikeInput normalizes fields, applies defaults, and normalizes React empty strings', () => {
  const minimal = parseCreateBikeInput({
    registrationNumber: '  b-101-mot  ',
    vin: ' jh2pc460000123456 ',
    make: '  Honda  ',
    model: '  CB500X  ',
    manufactureYear: 2023,
    itpExpiryDate: '',
    rcaExpiryDate: '   ',
    cascoExpiryDate: null,
    notes: '   ',
  });

  assert.deepEqual(minimal, {
    registrationNumber: 'B-101-MOT',
    vin: 'JH2PC460000123456',
    make: 'Honda',
    model: 'CB500X',
    manufactureYear: 2023,
    currentOdometer: '0.00',
    itpExpiryDate: null,
    rcaExpiryDate: null,
    cascoExpiryDate: null,
    serviceIntervalDays: 30,
    status: 'AVAILABLE',
    notes: null,
  });

  const full = parseCreateBikeInput({
    registrationNumber: 'b-202-mot',
    vin: 'vin12345',
    make: 'Yamaha',
    model: 'Tracer 7',
    manufactureYear: 2025,
    currentOdometer: 12500.5,
    itpExpiryDate: '2027-05-01',
    rcaExpiryDate: '2027-04-01',
    cascoExpiryDate: '2027-06-01',
    serviceIntervalDays: 45,
    status: 'IN_SERVICE',
    notes: '  Fresh chain  ',
  });

  assert.equal(full.currentOdometer, '12500.50');
  assert.equal(full.serviceIntervalDays, 45);
  assert.equal(full.status, 'IN_SERVICE');
  assert.equal(full.notes, 'Fresh chain');
  assert.equal(full.itpExpiryDate, '2027-05-01');
});

test('parseCreateBikeInput enforces Java constraints and bounds', () => {
  const base = {
    registrationNumber: 'B-101-MOT',
    vin: 'JH2PC460000123456',
    make: 'Honda',
    model: 'CB500X',
    manufactureYear: 2023,
  };

  assertValidationFailure(() => parseCreateBikeInput(null), 'body');
  assertValidationFailure(() => parseCreateBikeInput({ ...base, registrationNumber: 'AB' }), 'registrationNumber');
  assertValidationFailure(() => parseCreateBikeInput({ ...base, registrationNumber: 'X'.repeat(21) }), 'registrationNumber');
  assertValidationFailure(() => parseCreateBikeInput({ ...base, vin: '1234' }), 'vin');
  assertValidationFailure(() => parseCreateBikeInput({ ...base, vin: 'X'.repeat(31) }), 'vin');
  assertValidationFailure(() => parseCreateBikeInput({ ...base, make: '   ' }), 'make');
  assertValidationFailure(() => parseCreateBikeInput({ ...base, make: 'X'.repeat(51) }), 'make');
  assertValidationFailure(() => parseCreateBikeInput({ ...base, model: 'X'.repeat(51) }), 'model');
  assertValidationFailure(() => parseCreateBikeInput({ ...base, manufactureYear: 1989 }), 'manufactureYear');
  assertValidationFailure(() => parseCreateBikeInput({ ...base, manufactureYear: 2051 }), 'manufactureYear');
  assertValidationFailure(() => parseCreateBikeInput({ ...base, manufactureYear: 2023.5 }), 'manufactureYear');
  assertValidationFailure(() => parseCreateBikeInput({ ...base, currentOdometer: null }), 'currentOdometer');
  assertValidationFailure(() => parseCreateBikeInput({ ...base, currentOdometer: -1 }), 'currentOdometer');
  assertValidationFailure(
    () => parseCreateBikeInput({ ...base, currentOdometer: Number(MAX_ODOMETER_MINOR) / 100 + 1 }),
    'currentOdometer',
  );
  assertValidationFailure(() => parseCreateBikeInput({ ...base, serviceIntervalDays: null }), 'serviceIntervalDays');
  assertValidationFailure(() => parseCreateBikeInput({ ...base, serviceIntervalDays: 0 }), 'serviceIntervalDays');
  assertValidationFailure(() => parseCreateBikeInput({ ...base, itpExpiryDate: '2026-02-30' }), 'itpExpiryDate');
  assertValidationFailure(() => parseCreateBikeInput({ ...base, status: 'MAINTENANCE' }), 'status');
});

test('parseUpdateBikeInput and parseUpdateBikeStatusInput handle optional and required fields', () => {
  const updated = parseUpdateBikeInput({
    registrationNumber: ' b-101-upd ',
    vin: ' vin-upd-01 ',
    make: 'Honda',
    model: 'NC750X',
    manufactureYear: 2024,
    currentOdometer: 500,
  });

  assert.equal(updated.registrationNumber, 'B-101-UPD');
  assert.equal(updated.vin, 'VIN-UPD-01');
  assert.equal(updated.currentOdometer, '500.00');
  assert.equal(updated.serviceIntervalDays, null);
  assert.equal(updated.status, null);

  assertValidationFailure(
    () => parseUpdateBikeInput({
      registrationNumber: 'B-101-UPD',
      vin: 'VIN-UPD-01',
      make: 'Honda',
      model: 'NC750X',
      manufactureYear: 2024,
    }),
    'currentOdometer',
  );
  assertValidationFailure(
    () => parseUpdateBikeInput({
      registrationNumber: 'B-101-UPD',
      vin: 'VIN-UPD-01',
      make: 'Honda',
      model: 'NC750X',
      manufactureYear: 2024,
      currentOdometer: null,
    }),
    'currentOdometer',
  );

  assert.deepEqual(parseUpdateBikeStatusInput({ status: 'IN_SERVICE' }), { status: 'IN_SERVICE' });
  assertValidationFailure(() => parseUpdateBikeStatusInput({}), 'status');
  assertValidationFailure(() => parseUpdateBikeStatusInput({ status: null }), 'status');
  assertValidationFailure(() => parseUpdateBikeStatusInput([]), 'body');
});

test('parseCreateCustomerInput and parseUpdateCustomerInput handle defaults, React blanks, and email rules', () => {
  const created = parseCreateCustomerInput({
    fullName: '  Ion Popescu  ',
    phone: '  +40722123456  ',
    email: '',
    cnpOrTaxId: '',
    dateOfBirth: '',
    livingCity: '   ',
    drivingLicenceNumber: '',
    licenceExpiryDate: '',
    address: '',
    notes: '',
  });

  assert.deepEqual(created, {
    fullName: 'Ion Popescu',
    phone: '+40722123456',
    email: null,
    cnpOrTaxId: null,
    dateOfBirth: null,
    livingCity: null,
    drivingLicenceNumber: null,
    licenceCategories: 'A,A2',
    licenceExpiryDate: null,
    address: null,
    gdprConsentDate: todayUtc(),
    notes: null,
  });

  const withEmail = parseCreateCustomerInput({
    fullName: 'Maria Ionescu',
    phone: '+40733111222',
    email: '  Maria.Ionescu@Example.RO ',
    gdprConsentDate: '2026-10-01',
    licenceCategories: 'A',
  });
  assert.equal(withEmail.email, 'maria.ionescu@example.ro');
  assert.equal(withEmail.gdprConsentDate, '2026-10-01');
  assert.equal(withEmail.licenceCategories, 'A');

  assertValidationFailure(() => parseCreateCustomerInput({ fullName: '  ', phone: '+40722123456' }), 'fullName');
  assertValidationFailure(() => parseCreateCustomerInput({ fullName: 'X'.repeat(151), phone: '+40722123456' }), 'fullName');
  assertValidationFailure(() => parseCreateCustomerInput({ fullName: 'Ion', phone: '1234567' }), 'phone');
  assertValidationFailure(() => parseCreateCustomerInput({ fullName: 'Ion', phone: '1'.repeat(31) }), 'phone');
  assertValidationFailure(() => parseCreateCustomerInput({ fullName: 'Ion', phone: '+40722123456', email: 'bad-email' }), 'email');
  assertValidationFailure(() => parseCreateCustomerInput({ fullName: 'Ion', phone: '+40722123456', email: 'a@b' }), 'email');
  assertValidationFailure(() => parseCreateCustomerInput({ fullName: 'Ion', phone: '+40722123456', email: 'a@b..ro' }), 'email');
  assertValidationFailure(() => parseCreateCustomerInput({ fullName: 'Ion', phone: '+40722123456', licenceExpiryDate: '2026-02-30' }), 'licenceExpiryDate');
  assertValidationFailure(() => parseCreateCustomerInput({ fullName: 'Ion', phone: '+40722123456', livingCity: 'X'.repeat(101) }), 'livingCity');

  const updatedOmittedCat = parseUpdateCustomerInput({
    fullName: 'Ion Edited',
    phone: '+40722999888',
    email: '  ION@EXAMPLE.COM ',
  });
  assert.equal(updatedOmittedCat.email, 'ion@example.com');
  assert.equal(updatedOmittedCat.licenceCategories, null);

  const updatedWithCat = parseUpdateCustomerInput({
    fullName: 'Ion Edited',
    phone: '+40722999888',
    licenceCategories: 'A,A2,B',
  });
  assert.equal(updatedWithCat.licenceCategories, 'A,A2,B');
});

test('parseBikeSearchQuery and parseCustomerSearchQuery support Java sort fields and defaults', () => {
  const bikeDefault = parseBikeSearchQuery({});
  assert.deepEqual(bikeDefault, {
    filters: { includeArchived: false },
    page: { page: 0, size: 20, sortField: 'createdAt', direction: 'DESC' },
  });

  const bikeCustom = parseBikeSearchQuery({
    search: '  Cb500 ',
    status: 'RENTED',
    includeArchived: 'true',
    page: '1',
    size: '10',
    sort: 'currentOdometer,asc',
  });
  assert.deepEqual(bikeCustom, {
    filters: { search: 'cb500', status: 'RENTED', includeArchived: true },
    page: { page: 1, size: 10, sortField: 'currentOdometer', direction: 'ASC' },
  });

  for (const field of [
    'createdAt',
    'updatedAt',
    'registrationNumber',
    'vin',
    'make',
    'model',
    'manufactureYear',
    'currentOdometer',
    'serviceIntervalDays',
    'nextServiceDueDate',
    'status',
  ]) {
    const parsed = parseBikeSearchQuery({ sort: `${field},DESC` });
    assert.equal(parsed.page.sortField, field);
  }
  assertValidationFailure(() => parseBikeSearchQuery({ sort: 'notes,ASC' }), 'sort');
  assertValidationFailure(() => parseBikeSearchQuery({ includeArchived: 'yes' }), 'includeArchived');
  assertValidationFailure(() => parseBikeSearchQuery({ status: 'UNKNOWN' }), 'status');

  for (const field of ['createdAt', 'updatedAt', 'fullName', 'phone', 'email', 'livingCity']) {
    const parsed = parseCustomerSearchQuery({ sort: `${field},ASC` });
    assert.equal(parsed.page.sortField, field);
  }
  assertValidationFailure(() => parseCustomerSearchQuery({ sort: 'cnpOrTaxId,ASC' }), 'sort');
});

test('deterministic SHA-256 lock IDs use distinct domain prefixes', () => {
  const expectedHash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

  const regLock = bikeRegLockId('B-101-MOT');
  const vinLock = bikeVinLockId('B-101-MOT');
  const phoneLock = customerPhoneLockId('+40722123456');

  assert.equal(regLock, `bike_reg_${expectedHash('B-101-MOT')}`);
  assert.equal(vinLock, `bike_vin_${expectedHash('B-101-MOT')}`);
  assert.equal(phoneLock, `customer_phone_${expectedHash('+40722123456')}`);
  assert.notEqual(regLock, vinLock);
});

test('bikeRecordFrom / toBikeDto and customerRecordFrom / toCustomerDto emit Java + Flutter fields and tolerate legacy docs', () => {
  const legacyBike = bikeRecordFrom('bike-legacy', {
    registrationNumber: 'B-99-OLD',
    vin: 'VIN-LEGACY-99',
    make: 'Honda',
    model: 'PCX 125',
    status: 'AVAILABLE',
    archived: true,
    yearOfManufacture: 2021,
  });

  const legacyBikeDto = toBikeDto(legacyBike);
  assert.equal(legacyBikeDto.manufactureYear, 2021);
  assert.equal(legacyBikeDto.yearOfManufacture, 2021);
  assert.equal(legacyBikeDto.currentOdometer, 0);
  assert.equal(legacyBikeDto.serviceIntervalDays, 30);
  assert.equal(legacyBikeDto.archived, true);
  assert.equal(legacyBikeDto.createdAt, new Date(0).toISOString());

  const legacyCustomer = customerRecordFrom('cust-legacy', {
    fullName: 'Minimal Legacy',
    phone: '+40700000001',
    isArchived: false,
  });
  const legacyCustomerDto = toCustomerDto(legacyCustomer);
  assert.equal(legacyCustomerDto.archived, false);
  assert.equal(legacyCustomerDto.email, null);
  assert.equal(legacyCustomerDto.licenceCategories, null);
  assert.equal(legacyCustomerDto.createdAt, new Date(0).toISOString());
});

test('filterAndSortBikes and filterAndSortCustomers match search filters and sort numerically', () => {
  const t1 = Timestamp.fromMillis(1_700_000_000_000);
  const t2 = Timestamp.fromMillis(1_700_000_010_000);
  const bikes = [
    bikeRecordFrom('b1', {
      registrationNumber: 'B-10-AAA',
      vin: 'VIN10001',
      make: 'Honda',
      model: 'CB500X',
      manufactureYear: 2020,
      currentOdometer: '100.00',
      serviceIntervalDays: 60,
      nextServiceDueDate: null,
      status: 'AVAILABLE',
      isArchived: false,
      createdAt: t1,
      updatedAt: t1,
    }),
    bikeRecordFrom('b2', {
      registrationNumber: 'B-20-BBB',
      vin: 'VIN20002',
      make: 'Yamaha',
      model: 'MT-07',
      manufactureYear: 2024,
      currentOdometer: '9.50',
      serviceIntervalDays: 30,
      nextServiceDueDate: '2026-12-01',
      status: 'RENTED',
      isArchived: false,
      createdAt: t2,
      updatedAt: t2,
    }),
    bikeRecordFrom('b3', {
      registrationNumber: 'B-30-ARC',
      vin: 'VIN30003',
      make: 'Honda',
      model: 'CBR',
      manufactureYear: 2019,
      currentOdometer: '50.00',
      status: 'INACTIVE',
      isArchived: true,
      createdAt: t2,
      updatedAt: t2,
    }),
  ];

  const byOdoAsc = filterAndSortBikes(
    bikes,
    { includeArchived: false },
    parsePage({ sort: 'currentOdometer,ASC' }, 'createdAt', ['currentOdometer'], 'ASC'),
  );
  assert.deepEqual(byOdoAsc.map((b) => b.id), ['b2', 'b1']);

  const searchHondaWithArchived = filterAndSortBikes(
    bikes,
    { search: 'honda', includeArchived: true },
    parsePage({ sort: 'manufactureYear,DESC' }, 'createdAt', ['manufactureYear'], 'DESC'),
  );
  assert.deepEqual(searchHondaWithArchived.map((b) => b.id), ['b1', 'b3']);

  const byNullableDue = filterAndSortBikes(
    bikes,
    { includeArchived: false },
    parsePage({ sort: 'nextServiceDueDate,ASC' }, 'createdAt', ['nextServiceDueDate'], 'ASC'),
  );
  assert.equal(byNullableDue.length, 2);

  const customers = [
    customerRecordFrom('c1', {
      fullName: 'Elena Popa',
      phone: '+40722000111',
      email: 'elena@moto.ro',
      cnpOrTaxId: 'RO998877',
      isArchived: false,
      createdAt: t1,
      updatedAt: t1,
    }),
    customerRecordFrom('c2', {
      fullName: 'Bogdan Marin',
      phone: '+40733999000',
      email: null,
      cnpOrTaxId: '1900101001122',
      isArchived: true,
      createdAt: t2,
      updatedAt: t2,
    }),
  ];

  assert.deepEqual(
    filterAndSortCustomers(
      customers,
      { search: 'ro9988', includeArchived: false },
      parsePage({}, 'createdAt', ['createdAt'], 'DESC'),
    ).map((c) => c.id),
    ['c1'],
  );

  assert.deepEqual(
    filterAndSortCustomers(
      customers,
      { includeArchived: true },
      parsePage({ sort: 'email,ASC' }, 'createdAt', ['email'], 'ASC'),
    ).map((c) => c.id),
    ['c2', 'c1'],
  );
});

test('ReferenceRepository rejects unbounded scans exceeding MAX_SEARCH_SCAN_DOCS with 422', async () => {
  assert.equal(MAX_SEARCH_SCAN_DOCS, 1000);

  const createOverflowMockFirestore = () => {
    const query = {
      where: () => query,
      limit: () => query,
      get: async () => ({
        docs: [
          { id: '1', data: () => ({}) },
          { id: '2', data: () => ({}) },
          { id: '3', data: () => ({}) },
        ],
      }),
    };
    return {
      collection: () => query,
    } as unknown as Firestore;
  };

  const repo = new ReferenceRepository(createOverflowMockFirestore(), 2);

  await assert.rejects(
    () => repo.pageBikes({ includeArchived: false }, parsePage({}, 'createdAt', ['createdAt'], 'DESC')),
    (error: unknown) => {
      assert.ok(error instanceof UnprocessableEntityError);
      assert.equal(error.status, 422);
      return true;
    },
  );

  await assert.rejects(
    () => repo.pageCustomers({ includeArchived: false }, parsePage({}, 'createdAt', ['createdAt'], 'DESC')),
    (error: unknown) => {
      assert.ok(error instanceof UnprocessableEntityError);
      assert.equal(error.status, 422);
      return true;
    },
  );
});
