import type { AllocationMode, Currency, PaymentMethod, PaymentStatus } from '../domain/types.js';
import { parseDate } from '../shared/dates.js';
import { UnprocessableEntityError, ValidationError } from '../shared/errors.js';
import { requireUuid } from '../shared/ids.js';
import { parseStrictMoney, toMinorUnits } from '../shared/money.js';
import { parsePage, type PageRequest } from '../shared/pagination.js';
import {
  COMMIT_OVERHEAD_MULTIPLIER,
  COMMIT_PER_DOC_OVERHEAD_BYTES,
  MAX_AFFECTED_CHARGES,
  MAX_COMMIT_PAYLOAD_BYTES,
  MAX_TRANSACTION_WRITES,
  type ManualAllocationInput,
  type PaymentSearchFilters,
  type RecordPaymentInput,
  type ReversePaymentInput,
} from './payment.types.js';

const CURRENCIES = new Set<Currency>(['RON', 'EUR', 'USD']);
const PAYMENT_METHODS = new Set<PaymentMethod>(['CASH', 'BANK_TRANSFER']);
const PAYMENT_STATUSES = new Set<PaymentStatus>(['CONFIRMED', 'REVERSED']);
const CURRENCY_REGEX = /^(RON|EUR|USD)$/;

export function validateCurrency(value: unknown, field = 'currency'): Currency {
  if (typeof value !== 'string' || !CURRENCY_REGEX.test(value) || !CURRENCIES.has(value as Currency)) {
    throw new ValidationError([{
      field,
      rejectedValue: value ?? null,
      message: 'Currency must be one of: RON, EUR, USD',
    }]);
  }
  return value as Currency;
}

export function validatePaymentMethod(value: unknown, field = 'paymentMethod'): PaymentMethod {
  if (typeof value !== 'string' || !PAYMENT_METHODS.has(value as PaymentMethod)) {
    throw new ValidationError([{
      field,
      rejectedValue: value ?? null,
      message: 'Payment method must be one of: CASH, BANK_TRANSFER',
    }]);
  }
  return value as PaymentMethod;
}

export function validatePaymentStatus(value: unknown, field = 'status'): PaymentStatus {
  if (typeof value !== 'string' || !PAYMENT_STATUSES.has(value as PaymentStatus)) {
    throw new ValidationError([{
      field,
      rejectedValue: value ?? null,
      message: 'Payment status must be one of: CONFIRMED, REVERSED',
    }]);
  }
  return value as PaymentStatus;
}

export function normalizeAllocationMode(value: unknown): AllocationMode {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new ValidationError([{
      field: 'allocationMode',
      rejectedValue: value,
      message: 'allocationMode must be a string',
    }]);
  }
  if (typeof value === 'string' && value.trim().toUpperCase() === 'MANUAL') {
    return 'MANUAL';
  }
  return 'AUTO_FIFO';
}

function requireChargeDocumentId(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError([{
      field,
      rejectedValue: value ?? null,
      message: `${field} must be a non-empty rental charge ID string`,
    }]);
  }
  const trimmed = value.trim();
  if (trimmed === '.' || trimmed === '..' || trimmed.includes('/') || /^__.*__$/.test(trimmed)) {
    throw new ValidationError([{
      field,
      rejectedValue: value,
      message: `${field} contains an invalid Firestore document ID`,
    }]);
  }
  return trimmed;
}

function validateOptionalDate(value: unknown, field: string): string {
  try {
    return parseDate(value, field);
  } catch (error) {
    throw new ValidationError([{
      field,
      rejectedValue: value ?? null,
      message: String(error).replace(/^Error: /, ''),
    }]);
  }
}

export function parseRecordPaymentInput(body: unknown): RecordPaymentInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError([{
      field: 'body',
      rejectedValue: body ?? null,
      message: 'Request body must be a JSON object',
    }]);
  }
  const data = body as Record<string, unknown>;

  const customerId = requireUuid(
    typeof data.customerId === 'string' ? data.customerId : undefined,
    'customerId',
  );
  const rentalId = data.rentalId === undefined || data.rentalId === null
    ? null
    : requireUuid(typeof data.rentalId === 'string' ? data.rentalId : undefined, 'rentalId');
  const paymentDate = validateOptionalDate(data.paymentDate, 'paymentDate');
  const amount = parseStrictMoney(data.amount, 'amount', 0.01);
  const amountMinor = toMinorUnits(amount);
  const currency = validateCurrency(data.currency, 'currency');
  const paymentMethod = validatePaymentMethod(data.paymentMethod, 'paymentMethod');

  let referenceNumber: string | null = null;
  if (data.referenceNumber !== undefined && data.referenceNumber !== null) {
    if (typeof data.referenceNumber !== 'string') {
      throw new ValidationError([{
        field: 'referenceNumber',
        rejectedValue: data.referenceNumber,
        message: 'referenceNumber must be a string',
      }]);
    }
    if (data.referenceNumber.length > 100) {
      throw new ValidationError([{
        field: 'referenceNumber',
        rejectedValue: data.referenceNumber,
        message: 'referenceNumber must not exceed 100 characters',
      }]);
    }
    referenceNumber = data.referenceNumber;
  }

  let notes: string | null = null;
  if (data.notes !== undefined && data.notes !== null) {
    if (typeof data.notes !== 'string') {
      throw new ValidationError([{
        field: 'notes',
        rejectedValue: data.notes,
        message: 'notes must be a string',
      }]);
    }
    notes = data.notes;
  }

  const allocationMode = normalizeAllocationMode(data.allocationMode);

  if (
    data.manualAllocations !== undefined &&
    data.manualAllocations !== null &&
    !Array.isArray(data.manualAllocations)
  ) {
    throw new ValidationError([{
      field: 'manualAllocations',
      rejectedValue: data.manualAllocations,
      message: 'manualAllocations must be an array',
    }]);
  }

  const manualAllocations: ManualAllocationInput[] = [];
  if (allocationMode === 'MANUAL' && Array.isArray(data.manualAllocations)) {
    for (let index = 0; index < data.manualAllocations.length; index += 1) {
      const rawItem = data.manualAllocations[index];
      if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
        throw new ValidationError([{
          field: `manualAllocations[${index}]`,
          rejectedValue: rawItem ?? null,
          message: `manualAllocations[${index}] must be an object`,
        }]);
      }
      const item = rawItem as Record<string, unknown>;
      const rentalChargeId = requireChargeDocumentId(
        item.rentalChargeId,
        `manualAllocations[${index}].rentalChargeId`,
      );
      const itemAmount = parseStrictMoney(
        item.amount,
        `manualAllocations[${index}].amount`,
        0.01,
      );
      manualAllocations.push({
        rentalChargeId,
        amount: itemAmount,
        amountMinor: toMinorUnits(itemAmount),
      });
    }
  }

  return {
    customerId,
    rentalId,
    paymentDate,
    amount,
    amountMinor,
    currency,
    paymentMethod,
    referenceNumber,
    notes,
    allocationMode,
    manualAllocations,
  };
}

export function parseReversePaymentInput(body: unknown): ReversePaymentInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError([{
      field: 'body',
      rejectedValue: body ?? null,
      message: 'Request body must be a JSON object',
    }]);
  }
  const data = body as Record<string, unknown>;
  const reason = data.reason !== undefined ? data.reason : data.reversalReason;
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new ValidationError([{
      field: 'reason',
      rejectedValue: reason ?? null,
      message: 'Reversal reason is mandatory for audit compliance',
    }]);
  }
  const trimmed = reason.trim();
  if (trimmed.length < 5 || reason.length > 500) {
    throw new ValidationError([{
      field: 'reason',
      rejectedValue: reason,
      message: 'Reason must be between 5 and 500 characters',
    }]);
  }
  return { reason: trimmed };
}

function nonEmptyQueryString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value[0] !== undefined ? String(value[0]) : undefined;
  const text = String(value);
  return text === '' ? undefined : text;
}

export function parseSearchPaymentsQuery(
  query: Record<string, unknown>,
): { filters: PaymentSearchFilters; page: PageRequest } {
  const page = parsePage(query, 'paymentDate', ['paymentDate'], 'DESC');
  const filters: PaymentSearchFilters = {};

  const statusRaw = nonEmptyQueryString(query.status);
  if (statusRaw !== undefined) {
    filters.status = validatePaymentStatus(statusRaw, 'status');
  }

  const currencyRaw = nonEmptyQueryString(query.currency);
  if (currencyRaw !== undefined) {
    filters.currency = validateCurrency(currencyRaw, 'currency');
  }

  const methodRaw = nonEmptyQueryString(query.method);
  if (methodRaw !== undefined) {
    filters.method = validatePaymentMethod(methodRaw, 'method');
  }

  const customerIdRaw = nonEmptyQueryString(query.customerId);
  if (customerIdRaw !== undefined) {
    filters.customerId = requireUuid(customerIdRaw, 'customerId');
  }

  const startDateRaw = nonEmptyQueryString(query.startDate);
  if (startDateRaw !== undefined) {
    filters.startDate = validateOptionalDate(startDateRaw, 'startDate');
  }

  const endDateRaw = nonEmptyQueryString(query.endDate);
  if (endDateRaw !== undefined) {
    filters.endDate = validateOptionalDate(endDateRaw, 'endDate');
  }

  return { filters, page };
}

export interface PlannedWriteEntry {
  path: string;
  data: Record<string, unknown>;
}

export function estimateCommitPayloadBytes(entries: PlannedWriteEntry[]): number {
  let estimatedBytes = 0;
  for (const entry of entries) {
    const pathBytes = Buffer.byteLength(entry.path, 'utf8');
    let jsonText: string;
    try {
      jsonText = JSON.stringify(entry.data);
    } catch {
      return Number.POSITIVE_INFINITY;
    }
    if (typeof jsonText !== 'string') {
      return Number.POSITIVE_INFINITY;
    }
    const docBytes = Buffer.byteLength(jsonText, 'utf8');
    estimatedBytes +=
      Math.ceil((pathBytes + docBytes) * COMMIT_OVERHEAD_MULTIPLIER) +
      COMMIT_PER_DOC_OVERHEAD_BYTES;
  }
  return estimatedBytes;
}

export function assertTransactionBudget(options: {
  affectedCharges: number;
  writeEntries: PlannedWriteEntry[];
}): void {
  if (options.affectedCharges > MAX_AFFECTED_CHARGES) {
    throw new UnprocessableEntityError(
      `Operation affects ${options.affectedCharges} charges, exceeding the atomic transaction limit of ${MAX_AFFECTED_CHARGES}`,
    );
  }
  if (options.writeEntries.length > MAX_TRANSACTION_WRITES) {
    throw new UnprocessableEntityError(
      `Operation requires ${options.writeEntries.length} Firestore writes, exceeding the atomic transaction limit of ${MAX_TRANSACTION_WRITES}`,
    );
  }
  const estimatedBytes = estimateCommitPayloadBytes(options.writeEntries);
  if (!Number.isFinite(estimatedBytes) || estimatedBytes > MAX_COMMIT_PAYLOAD_BYTES) {
    throw new UnprocessableEntityError(
      `Estimated atomic Commit payload (${estimatedBytes} bytes) exceeds the ${MAX_COMMIT_PAYLOAD_BYTES}-byte limit`,
    );
  }
}
