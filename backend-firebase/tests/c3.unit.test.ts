import test from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  MAX_RENTAL_CHARGE_SCAN_DOCS,
  RentalRepository,
  compareChargeTimestamps,
  compareCodePoint,
  filterAndSortRentalCharges,
} from '../src/rental/rental.repository.js';
import type { ChargeDocument } from '../src/domain/types.js';
import { UnprocessableEntityError } from '../src/shared/errors.js';
import { addDays, parseDate } from '../src/shared/dates.js';
import { normalizeAllocation, normalizeMoney, moneyToJson } from '../src/shared/money.js';
import { parsePage } from '../src/shared/pagination.js';

test('money normalization rounds to two decimal places without floating arithmetic', () => {
  assert.equal(normalizeMoney('12.345', 'amount'), '12.35');
  assert.equal(normalizeMoney('12.344', 'amount'), '12.34');
  assert.equal(normalizeMoney('-12.345', 'amount', -100), '-12.35');
  assert.equal(normalizeMoney('90071992547409.91', 'amount'), '90071992547409.91');
  assert.throws(() => normalizeMoney('-0.01', 'amount', 0));
  assert.throws(() => moneyToJson('90071992547409.92'));
  assert.throws(() => normalizeAllocation('not-a-number'));
});

test('date-only handling covers leap years and invalid boundaries', () => {
  assert.equal(parseDate('2028-02-29', 'date'), '2028-02-29');
  assert.equal(addDays('2028-02-29', 1), '2028-03-01');
  assert.throws(() => parseDate('2027-02-29', 'date'));
  assert.throws(() => parseDate('2028-2-29', 'date'));
});

test('pagination validates sort and preserves Java defaults', () => {
  assert.equal(parsePage({}, 'startDate', ['startDate']).direction, 'DESC');
  assert.equal(parsePage({}, 'dueDate', ['dueDate'], 'ASC').direction, 'ASC');
  assert.throws(() => parsePage({ sort: 'chargeSequence,sideways' }, 'dueDate', ['dueDate', 'chargeSequence']));
  assert.throws(() => parsePage({ size: '101' }, 'dueDate', ['dueDate']));
});

test('Strategy 2A sorting helpers enforce code-point, numeric, nanosecond, and ID tie-breaker order', () => {
  // Code-point ordering: uppercase 'B' (66) < lowercase 'a' (97), unlike localeCompare.
  assert.equal(compareCodePoint('B', 'a'), -1);
  assert.equal(compareCodePoint('a', 'B'), 1);
  assert.equal(compareCodePoint('RON', 'RON'), 0);

  // Nanosecond timestamp ordering when seconds match.
  assert.ok(
    compareChargeTimestamps(new Timestamp(100, 5), new Timestamp(100, 20)) < 0,
  );

  const rentalId = 'r-1';
  const base: Omit<ChargeDocument, 'id' | 'chargeSequence' | 'dueDate' | 'status' | 'createdAt'> = {
    rentalId,
    customerId: 'c-1',
    bikeId: 'b-1',
    periodStartDate: '2026-01-01',
    periodEndDate: '2026-01-07',
    amount: '100.00',
    currency: 'RON',
    paidAmount: '0.00',
    remainingAmount: '100.00',
    notes: '',
    updatedAt: new Timestamp(100, 0),
  };

  const charges: ChargeDocument[] = [
    {
      ...base,
      id: 'id-b',
      chargeSequence: 10,
      dueDate: '2026-01-08',
      status: 'UNPAID',
      createdAt: new Timestamp(100, 20),
    },
    {
      ...base,
      id: 'id-a',
      chargeSequence: 2,
      dueDate: '2026-01-08',
      status: 'PAID',
      createdAt: new Timestamp(100, 5),
    },
    {
      ...base,
      id: 'id-c',
      chargeSequence: 3,
      dueDate: '2026-01-01',
      status: 'UNPAID',
      createdAt: new Timestamp(100, 5),
    },
    {
      ...base,
      id: 'id-usd',
      currency: 'USD',
      chargeSequence: 1,
      dueDate: '2026-01-01',
      status: 'UNPAID',
      createdAt: new Timestamp(100, 1),
    },
  ];

  // Filter combination + numeric chargeSequence ASC (2 < 3 < 10)
  const seqAsc = filterAndSortRentalCharges(
    charges,
    { rentalId, currency: 'RON', customerId: 'c-1' },
    parsePage({ sort: 'chargeSequence,ASC' }, 'dueDate', ['chargeSequence'], 'ASC'),
  );
  assert.deepEqual(seqAsc.map((c) => c.chargeSequence), [2, 3, 10]);

  // Nanosecond createdAt ASC + document ID tie-breaking ('id-a' < 'id-c' at Timestamp(100, 5))
  const createdAsc = filterAndSortRentalCharges(
    charges,
    { rentalId, currency: 'RON' },
    parsePage({ sort: 'createdAt,ASC' }, 'dueDate', ['createdAt'], 'ASC'),
  );
  assert.deepEqual(createdAsc.map((c) => c.id), ['id-a', 'id-c', 'id-b']);

  // Document ID tie-breaking in DESC reverses tie-breaker order too
  const createdDesc = filterAndSortRentalCharges(
    charges,
    { rentalId, currency: 'RON' },
    parsePage({ sort: 'createdAt,DESC' }, 'dueDate', ['createdAt'], 'DESC'),
  );
  assert.deepEqual(createdDesc.map((c) => c.id), ['id-b', 'id-c', 'id-a']);

  // Status code-point sorting ('PAID' < 'UNPAID')
  const statusAsc = filterAndSortRentalCharges(
    charges,
    { rentalId, currency: 'RON' },
    parsePage({ sort: 'status,ASC' }, 'dueDate', ['status'], 'ASC'),
  );
  assert.deepEqual(statusAsc.map((c) => c.id), ['id-a', 'id-b', 'id-c']);
});

test('RentalRepository.pageCharges enforces 1,000-doc limit with rentalId and preserves unbounded non-rentalId path', async () => {
  assert.equal(MAX_RENTAL_CHARGE_SCAN_DOCS, 1000);

  const makeMockFirestore = (docCount: number) => {
    const docs = Array.from({ length: docCount }, (_, i) => ({
      id: `r-1_${String(i + 1).padStart(4, '0')}`,
      data: () => ({
        rentalId: 'r-1',
        customerId: 'c-1',
        bikeId: 'b-1',
        chargeSequence: i + 1,
        periodStartDate: '2026-01-01',
        periodEndDate: '2026-01-07',
        dueDate: '2026-01-01',
        amount: '100.00',
        currency: 'RON',
        status: 'UNPAID',
        paidAmount: '0.00',
        remainingAmount: '100.00',
        notes: '',
        createdAt: new Timestamp(100, i),
      }),
    }));
    let sawCountCall = false;
    const query: Record<string, unknown> = {
      where: () => query,
      orderBy: () => query,
      limit: () => query,
      startAfter: () => query,
      count: () => ({
        get: async () => {
          sawCountCall = true;
          return { data: () => ({ count: docCount }) };
        },
      }),
      get: async () => ({ docs }),
    };
    return {
      firestore: { collection: () => query } as unknown as Firestore,
      didCallCount: () => sawCountCall,
    };
  };

  // Exactly 1,000 matching charges succeeds and paginates accurately
  const exact1000 = makeMockFirestore(1000);
  const repo1000 = new RentalRepository(exact1000.firestore);
  const pageResult = await repo1000.pageCharges(
    { rentalId: 'r-1' },
    parsePage({ page: '1', size: '10', sort: 'chargeSequence,DESC' }, 'dueDate', ['chargeSequence'], 'ASC'),
  );
  assert.equal(pageResult.totalElements, 1000);
  assert.equal(pageResult.items.length, 10);
  assert.equal(pageResult.items[0]?.chargeSequence, 990);
  assert.equal(exact1000.didCallCount(), false);

  // 1,001 matching charges throws UnprocessableEntityError (422) without silent truncation
  const over1000 = makeMockFirestore(1001);
  const repo1001 = new RentalRepository(over1000.firestore);
  await assert.rejects(
    () => repo1001.pageCharges(
      { rentalId: 'r-1' },
      parsePage({}, 'dueDate', ['dueDate'], 'ASC'),
    ),
    (error: unknown) => error instanceof UnprocessableEntityError && error.status === 422,
  );

  // Without rentalId, existing count()+orderBy path runs even above 1,000
  const nonRental = makeMockFirestore(2);
  const repoNonRental = new RentalRepository(nonRental.firestore);
  const nonRentalRes = await repoNonRental.pageCharges(
    { status: 'UNPAID' },
    parsePage({}, 'dueDate', ['dueDate'], 'ASC'),
  );
  assert.equal(nonRental.didCallCount(), true);
  assert.equal(nonRentalRes.totalElements, 2);
});
