import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { UnprocessableEntityError, ValidationError } from '../src/shared/errors.js';
import { fromMinorUnits, parseStrictMoney, toMinorUnits } from '../src/shared/money.js';
import {
  assertTransactionBudget,
  estimateCommitPayloadBytes,
  normalizeAllocationMode,
  parseRecordPaymentInput,
  parseReversePaymentInput,
  parseSearchPaymentsQuery,
} from '../src/payment/payment.validation.js';
import {
  MAX_AFFECTED_CHARGES,
  MAX_ALLOCATION_HISTORY_READS_CREATE,
  MAX_ALLOCATION_HISTORY_READS_REVERSE,
  MAX_ALLOCATIONS_PER_CHARGE,
  MAX_COMMIT_PAYLOAD_BYTES,
  MAX_PARENT_PAYMENTS_READ,
  MAX_TRANSACTION_WRITES,
} from '../src/payment/payment.types.js';

test('parseStrictMoney enforces Rule N and Rule S without silent rounding', () => {
  // Accepted inputs
  assert.equal(parseStrictMoney(250.5, 'amount'), '250.50');
  assert.equal(parseStrictMoney(250.50, 'amount'), '250.50');
  assert.equal(parseStrictMoney('250.50', 'amount'), '250.50');
  assert.equal(parseStrictMoney(' 250.5 ', 'amount'), '250.50');
  assert.equal(parseStrictMoney(1, 'amount'), '1.00');
  assert.equal(parseStrictMoney(1.000, 'amount'), '1.00'); // Rule N: parsed JSON number 1.000 -> 1
  assert.equal(parseStrictMoney('1.00', 'amount'), '1.00');
  assert.equal(parseStrictMoney(0.01, 'amount'), '0.01');
  assert.equal(parseStrictMoney('0.01', 'amount'), '0.01');

  // Rejected inputs
  const rejectedValues: unknown[] = [
    '1.000', // Rule S: 3 written fractional digits rejected
    1.005,
    '1.005',
    1.001,
    '1.001',
    0.005,
    '0.005',
    0,
    '0.00',
    -10,
    '-10.00',
    1e-7,
    1e21,
    '1e2',
    'invalid',
    '01.00',
    '1.',
    '.50',
    true,
    {},
    null,
    undefined,
  ];

  for (const invalid of rejectedValues) {
    assert.throws(
      () => parseStrictMoney(invalid, 'amount'),
      (err) => err instanceof ValidationError,
      `Expected ValidationError for input: ${String(invalid)}`,
    );
  }
});

test('minor unit helpers round-trip cleanly', () => {
  assert.equal(toMinorUnits('250.50'), 25050n);
  assert.equal(fromMinorUnits(25050n), '250.50');
  assert.equal(fromMinorUnits(0n), '0.00');
});

test('normalizeAllocationMode mirrors Java case-insensitive MANUAL dispatch', () => {
  assert.equal(normalizeAllocationMode('MANUAL'), 'MANUAL');
  assert.equal(normalizeAllocationMode('manual'), 'MANUAL');
  assert.equal(normalizeAllocationMode(' manual '), 'MANUAL');
  assert.equal(normalizeAllocationMode('AUTO_FIFO'), 'AUTO_FIFO');
  assert.equal(normalizeAllocationMode('ANYTHING_ELSE'), 'AUTO_FIFO');
  assert.equal(normalizeAllocationMode(null), 'AUTO_FIFO');
  assert.equal(normalizeAllocationMode(undefined), 'AUTO_FIFO');
  assert.throws(() => normalizeAllocationMode(42), ValidationError);
});

test('parseRecordPaymentInput validates currency, paymentMethod, and manualAllocations', () => {
  const customerId = randomUUID();
  const basePayload = {
    customerId,
    paymentDate: '2026-11-10',
    amount: 250.5,
    currency: 'RON',
    paymentMethod: 'CASH',
  };

  // Absent, null, and empty manualAllocations in MANUAL mode are valid with zero allocations
  for (const manualAllocations of [undefined, null, []]) {
    const parsed = parseRecordPaymentInput({
      ...basePayload,
      allocationMode: 'MANUAL',
      ...(manualAllocations !== undefined ? { manualAllocations } : {}),
    });
    assert.equal(parsed.allocationMode, 'MANUAL');
    assert.deepEqual(parsed.manualAllocations, []);
  }

  // Lowercase/padded currency rejected with 400 ValidationError
  for (const currency of ['ron', ' RON ', 'GBP']) {
    assert.throws(() => parseRecordPaymentInput({ ...basePayload, currency }), ValidationError);
  }

  // Unsupported payment method (e.g. CREDIT_CARD) rejected with 400 ValidationError
  assert.throws(
    () => parseRecordPaymentInput({ ...basePayload, paymentMethod: 'CREDIT_CARD' }),
    ValidationError,
  );

  // Non-array manualAllocations rejected
  assert.throws(
    () => parseRecordPaymentInput({ ...basePayload, allocationMode: 'MANUAL', manualAllocations: {} }),
    ValidationError,
  );

  // Unsafe Firestore doc ID rejected
  assert.throws(
    () => parseRecordPaymentInput({
      ...basePayload,
      allocationMode: 'MANUAL',
      manualAllocations: [{ rentalChargeId: 'bad/path', amount: 10 }],
    }),
    ValidationError,
  );
});

test('parseReversePaymentInput enforces 5..500 character reason and accepts reversalReason alias', () => {
  assert.equal(parseReversePaymentInput({ reason: 'Customer bounced check' }).reason, 'Customer bounced check');
  assert.equal(parseReversePaymentInput({ reversalReason: 'Flutter reversal alias' }).reason, 'Flutter reversal alias');
  assert.throws(() => parseReversePaymentInput({ reason: '    ' }), ValidationError);
  assert.throws(() => parseReversePaymentInput({ reversalReason: 'abcd' }), ValidationError);
  assert.throws(() => parseReversePaymentInput({ reason: 'abcd' }), ValidationError);
  assert.throws(() => parseReversePaymentInput({ reason: 'a'.repeat(501) }), ValidationError);
});

test('parseSearchPaymentsQuery enforces filter enums, method param, and sort allow-list', () => {
  const defaults = parseSearchPaymentsQuery({});
  assert.equal(defaults.page.sortField, 'paymentDate');
  assert.equal(defaults.page.direction, 'DESC');
  assert.equal(defaults.page.page, 0);
  assert.equal(defaults.page.size, 20);

  assert.equal(parseSearchPaymentsQuery({ sort: 'paymentDate,asc' }).page.direction, 'ASC');
  assert.equal(parseSearchPaymentsQuery({ sort: 'paymentDate,DESC' }).page.direction, 'DESC');

  assert.throws(() => parseSearchPaymentsQuery({ sort: 'amount,DESC' }), ValidationError);
  assert.throws(() => parseSearchPaymentsQuery({ sort: 'paymentDate,sideways' }), ValidationError);
  assert.throws(() => parseSearchPaymentsQuery({ method: 'CREDIT_CARD' }), ValidationError);
  assert.throws(() => parseSearchPaymentsQuery({ currency: 'ron' }), ValidationError);
  assert.throws(() => parseSearchPaymentsQuery({ status: 'PENDING' }), ValidationError);
  assert.throws(() => parseSearchPaymentsQuery({ size: '101' }), ValidationError);
});

test('transaction safeguard constants and budget validator enforce 422 limits', () => {
  assert.equal(MAX_AFFECTED_CHARGES, 200);
  assert.equal(MAX_TRANSACTION_WRITES, 500);
  assert.equal(MAX_COMMIT_PAYLOAD_BYTES, 10 * 1024 * 1024);
  assert.equal(MAX_ALLOCATIONS_PER_CHARGE, 200);
  assert.equal(MAX_PARENT_PAYMENTS_READ, 500);
  assert.equal(MAX_ALLOCATION_HISTORY_READS_CREATE, 1000);
  assert.equal(MAX_ALLOCATION_HISTORY_READS_REVERSE, 1000);

  // Within limits
  assert.doesNotThrow(() =>
    assertTransactionBudget({
      affectedCharges: 200,
      writeEntries: [{ path: 'payments/p1', data: { amount: '100.00' } }],
    }),
  );

  // Exceeds affected charges cap (201 > 200)
  assert.throws(
    () =>
      assertTransactionBudget({
        affectedCharges: 201,
        writeEntries: [{ path: 'payments/p1', data: { amount: '100.00' } }],
      }),
    UnprocessableEntityError,
  );

  // Exceeds 500 write operations
  const tooManyWrites = Array.from({ length: 501 }, (_, idx) => ({
    path: `payment_allocations/a${idx}`,
    data: { i: idx },
  }));
  assert.throws(
    () =>
      assertTransactionBudget({
        affectedCharges: 1,
        writeEntries: tooManyWrites,
      }),
    UnprocessableEntityError,
  );

  // Exceeds 10 MiB payload estimate
  const oversizedDoc = { path: 'payments/big', data: { blob: 'x'.repeat(7 * 1024 * 1024) } };
  assert.throws(
    () =>
      assertTransactionBudget({
        affectedCharges: 1,
        writeEntries: [oversizedDoc],
      }),
    UnprocessableEntityError,
  );

  // Circular unmeasurable payload rejected as oversized (Infinity)
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.equal(estimateCommitPayloadBytes([{ path: 'payments/c', data: circular }]), Number.POSITIVE_INFINITY);
  assert.throws(
    () =>
      assertTransactionBudget({
        affectedCharges: 1,
        writeEntries: [{ path: 'payments/c', data: circular }],
      }),
    UnprocessableEntityError,
  );
});
