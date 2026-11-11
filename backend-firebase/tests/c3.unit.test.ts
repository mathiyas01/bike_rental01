import test from 'node:test';
import assert from 'node:assert/strict';
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
