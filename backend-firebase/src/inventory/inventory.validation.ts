import { Timestamp } from 'firebase-admin/firestore';
import type { Currency, StockMovementType } from '../domain/types.js';
import { UnprocessableEntityError, ValidationError } from '../shared/errors.js';
import { requireUuid } from '../shared/ids.js';
import { parseStrictMoney, toMinorUnits } from '../shared/money.js';
import { parsePage, type PageRequest } from '../shared/pagination.js';
import {
  COMMIT_OVERHEAD_MULTIPLIER,
  COMMIT_PER_DOC_OVERHEAD_BYTES,
  MAX_COMMIT_PAYLOAD_BYTES,
  MAX_COST_MINOR,
  MAX_QUANTITY_MINOR,
  MAX_SERVICE_PARTS_ITEMS,
  MAX_TRANSACTION_WRITES,
  MAX_UNIQUE_SERVICE_PARTS,
  type CreatePartInput,
  type CreateSupplierInput,
  type PartSearchFilters,
  type RecordStockMovementInput,
  type ServicePartUsageInputItem,
  type StockMovementSearchFilters,
  type SupplierSearchFilters,
  type UpdatePartInput,
} from './inventory.types.js';

const CURRENCIES = new Set<Currency>(['RON', 'EUR', 'USD']);
const CURRENCY_REGEX = /^(RON|EUR|USD)$/;
const STOCK_MOVEMENT_TYPES = new Set<StockMovementType>([
  'STOCK_IN',
  'STOCK_OUT',
  'SERVICE_USAGE',
  'RETURN',
  'ADJUSTMENT',
  'REVERSAL',
]);
const ISO_INSTANT_REGEX = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;

export interface PlannedWriteEntry {
  path: string;
  data: Record<string, unknown>;
}

function fail(field: string, rejectedValue: unknown, message: string): never {
  throw new ValidationError([{ field, rejectedValue: rejectedValue ?? null, message }]);
}

function requirePlainObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    fail('body', body, 'Request body must be a JSON object');
  }
  return body as Record<string, unknown>;
}

function requireNonBlankString(value: unknown, field: string, maxLength?: number): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(field, value, `${field} must not be blank`);
  }
  if (maxLength !== undefined && value.length > maxLength) {
    fail(field, value, `${field} must not exceed ${maxLength} characters`);
  }
  return value.trim();
}

function parseOptionalString(value: unknown, field: string, maxLength?: number): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    fail(field, value, `${field} must be a string`);
  }
  if (maxLength !== undefined && value.length > maxLength) {
    fail(field, value, `${field} must not exceed ${maxLength} characters`);
  }
  return value;
}

function parseOptionalSupplierString(value: unknown, field: string, maxLength?: number): string | null {
  const raw = parseOptionalString(value, field, maxLength);
  if (raw === null) {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function validateCurrency(value: unknown, field = 'currency'): Currency {
  if (typeof value !== 'string' || !CURRENCY_REGEX.test(value) || !CURRENCIES.has(value as Currency)) {
    fail(field, value, 'Currency must be one of: RON, EUR, USD');
  }
  return value as Currency;
}

const STOCK_MOVEMENT_ALIASES: Record<string, StockMovementType> = {
  PURCHASE: 'STOCK_IN',
  USAGE_NON_SERVICE: 'STOCK_OUT',
};

export function validateStockMovementType(value: unknown, field = 'movementType'): StockMovementType {
  const normalized = typeof value === 'string'
    ? (STOCK_MOVEMENT_ALIASES[value] ?? value)
    : value;
  if (typeof normalized !== 'string' || !STOCK_MOVEMENT_TYPES.has(normalized as StockMovementType)) {
    fail(
      field,
      value,
      'movementType must be one of: STOCK_IN, STOCK_OUT, SERVICE_USAGE, RETURN, ADJUSTMENT, REVERSAL',
    );
  }
  return normalized as StockMovementType;
}

export function parseBoundedDecimal(
  value: unknown,
  field: string,
  minimum: number,
  maxMinor: bigint,
): { canonical: string; minor: bigint } {
  const canonical = parseStrictMoney(value, field, minimum);
  const minor = toMinorUnits(canonical);
  if (minor > maxMinor) {
    fail(field, value, `${field} exceeds maximum supported column precision`);
  }
  return { canonical, minor };
}

export function computeSignedDeltaMinor(movementType: StockMovementType, quantityMinor: bigint): bigint {
  const absMinor = quantityMinor < 0n ? -quantityMinor : quantityMinor;
  switch (movementType) {
    case 'STOCK_IN':
    case 'RETURN':
      return absMinor;
    case 'STOCK_OUT':
    case 'SERVICE_USAGE':
      return -absMinor;
    case 'ADJUSTMENT':
    case 'REVERSAL':
      return quantityMinor;
  }
}

export function isPartLowStock(currentQuantityMinor: bigint, minReorderLevelMinor: bigint): boolean {
  return currentQuantityMinor <= minReorderLevelMinor;
}

export function parseCreatePartInput(body: unknown): CreatePartInput {
  const data = requirePlainObject(body);

  const partCode = requireNonBlankString(data.partCode, 'partCode', 50).toUpperCase();
  const name = requireNonBlankString(data.name, 'name', 150);
  const category = requireNonBlankString(data.category, 'category', 50).toUpperCase();
  const description = parseOptionalString(data.description, 'description');

  const unitOfMeasure = data.unitOfMeasure === undefined
    ? 'PCS'
    : requireNonBlankString(data.unitOfMeasure, 'unitOfMeasure', 20).toUpperCase();

  let initialQuantity = '0.00';
  let initialQuantityMinor = 0n;
  if (data.initialQuantity !== undefined) {
    const parsed = parseBoundedDecimal(data.initialQuantity, 'initialQuantity', 0, MAX_QUANTITY_MINOR);
    initialQuantity = parsed.canonical;
    initialQuantityMinor = parsed.minor;
  }

  let minReorderLevel = '2.00';
  let minReorderLevelMinor = 200n;
  if (data.minReorderLevel !== undefined) {
    const parsed = parseBoundedDecimal(data.minReorderLevel, 'minReorderLevel', 0, MAX_QUANTITY_MINOR);
    minReorderLevel = parsed.canonical;
    minReorderLevelMinor = parsed.minor;
  }

  let defaultUnitCost = '0.00';
  if (data.defaultUnitCost !== undefined) {
    defaultUnitCost = parseBoundedDecimal(data.defaultUnitCost, 'defaultUnitCost', 0, MAX_COST_MINOR).canonical;
  }

  const costCurrency = data.costCurrency === undefined
    ? 'RON'
    : validateCurrency(data.costCurrency, 'costCurrency');

  const defaultSupplierId = data.defaultSupplierId === undefined || data.defaultSupplierId === null
    ? null
    : requireUuid(
      typeof data.defaultSupplierId === 'string' ? data.defaultSupplierId : undefined,
      'defaultSupplierId',
    );

  return {
    partCode,
    name,
    category,
    description,
    unitOfMeasure,
    initialQuantity,
    initialQuantityMinor,
    minReorderLevel,
    minReorderLevelMinor,
    defaultUnitCost,
    costCurrency,
    defaultSupplierId,
  };
}

export function parseUpdatePartInput(body: unknown): UpdatePartInput {
  const data = requirePlainObject(body);

  const name = requireNonBlankString(data.name, 'name', 150);
  const category = requireNonBlankString(data.category, 'category', 50).toUpperCase();
  const description = parseOptionalString(data.description, 'description');

  if (typeof data.unitOfMeasure !== 'string' || data.unitOfMeasure.trim().length === 0) {
    fail('unitOfMeasure', data.unitOfMeasure, 'unitOfMeasure must not be blank');
  }
  if (data.unitOfMeasure.length > 20) {
    fail('unitOfMeasure', data.unitOfMeasure, 'unitOfMeasure must not exceed 20 characters');
  }
  const unitOfMeasure = data.unitOfMeasure;

  const reorder = parseBoundedDecimal(data.minReorderLevel, 'minReorderLevel', 0, MAX_QUANTITY_MINOR);
  const unitCost = parseBoundedDecimal(data.defaultUnitCost, 'defaultUnitCost', 0, MAX_COST_MINOR);

  const defaultSupplierId = data.defaultSupplierId === undefined || data.defaultSupplierId === null
    ? null
    : requireUuid(
      typeof data.defaultSupplierId === 'string' ? data.defaultSupplierId : undefined,
      'defaultSupplierId',
    );

  return {
    name,
    category,
    description,
    unitOfMeasure,
    minReorderLevel: reorder.canonical,
    minReorderLevelMinor: reorder.minor,
    defaultUnitCost: unitCost.canonical,
    defaultSupplierId,
  };
}

export function parseRecordStockMovementInput(body: unknown): RecordStockMovementInput {
  const data = requirePlainObject(body);

  const partId = requireUuid(typeof data.partId === 'string' ? data.partId : undefined, 'partId');
  const quantity = parseBoundedDecimal(data.quantity, 'quantity', 0.01, MAX_QUANTITY_MINOR);
  const movementType = validateStockMovementType(data.movementType, 'movementType');

  const referenceType = parseOptionalString(data.referenceType, 'referenceType', 50);
  const referenceId = data.referenceId === undefined || data.referenceId === null
    ? null
    : requireUuid(typeof data.referenceId === 'string' ? data.referenceId : undefined, 'referenceId');

  const unitCost =
    data.unitCost === undefined ||
    data.unitCost === null ||
    (typeof data.unitCost === 'string' && data.unitCost.trim() === '')
      ? null
      : parseBoundedDecimal(data.unitCost, 'unitCost', 0, MAX_COST_MINOR).canonical;

  let currency: Currency | null;
  if (!Object.prototype.hasOwnProperty.call(data, 'currency') || data.currency === undefined) {
    currency = 'RON';
  } else if (data.currency === null) {
    currency = null;
  } else {
    currency = validateCurrency(data.currency, 'currency');
  }

  const reason = parseOptionalString(data.reason, 'reason');

  return {
    partId,
    quantity: quantity.canonical,
    quantityMinor: quantity.minor,
    movementType,
    referenceType,
    referenceId,
    unitCost,
    currency,
    reason,
  };
}

export function parseCreateSupplierInput(body: unknown): CreateSupplierInput {
  const data = requirePlainObject(body);

  const name = requireNonBlankString(data.name, 'name', 150);
  return {
    name,
    nameNormalized: name.toLowerCase(),
    contactPerson: parseOptionalSupplierString(data.contactPerson, 'contactPerson', 100),
    phone: parseOptionalSupplierString(data.phone, 'phone', 30),
    email: parseOptionalSupplierString(data.email, 'email', 150),
    taxCui: parseOptionalSupplierString(data.taxCui, 'taxCui', 50),
    address: parseOptionalSupplierString(data.address, 'address'),
    notes: parseOptionalSupplierString(data.notes, 'notes'),
  };
}

export function parseServicePartsUsed(partsUsed: unknown): ServicePartUsageInputItem[] {
  if (partsUsed === undefined || partsUsed === null) {
    return [];
  }
  if (!Array.isArray(partsUsed)) {
    fail('partsUsed', partsUsed, 'partsUsed must be an array');
  }
  if (partsUsed.length > MAX_SERVICE_PARTS_ITEMS) {
    throw new UnprocessableEntityError(
      `partsUsed contains ${partsUsed.length} items, exceeding the atomic transaction limit of ${MAX_SERVICE_PARTS_ITEMS}`,
    );
  }

  const uniqueParts = new Set<string>();
  const items: ServicePartUsageInputItem[] = [];

  for (let index = 0; index < partsUsed.length; index += 1) {
    const rawItem = partsUsed[index];
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
      fail(`partsUsed[${index}]`, rawItem, `partsUsed[${index}] must be an object`);
    }
    const item = rawItem as Record<string, unknown>;
    const partId = requireUuid(
      typeof item.partId === 'string' ? item.partId : undefined,
      `partsUsed[${index}].partId`,
    );
    const quantity = parseBoundedDecimal(
      item.quantity,
      `partsUsed[${index}].quantity`,
      0.01,
      MAX_QUANTITY_MINOR,
    );
    const unitCost = item.unitCost === undefined || item.unitCost === null
      ? null
      : parseBoundedDecimal(item.unitCost, `partsUsed[${index}].unitCost`, 0, MAX_COST_MINOR).canonical;
    let currency: Currency | null;
    if (!Object.prototype.hasOwnProperty.call(item, 'currency') || item.currency === undefined) {
      currency = 'RON';
    } else if (item.currency === null) {
      currency = null;
    } else {
      currency = validateCurrency(item.currency, `partsUsed[${index}].currency`);
    }

    uniqueParts.add(partId);
    items.push({
      partId,
      quantity: quantity.canonical,
      quantityMinor: quantity.minor,
      unitCost,
      currency,
    });
  }

  if (uniqueParts.size > MAX_UNIQUE_SERVICE_PARTS) {
    throw new UnprocessableEntityError(
      `partsUsed references ${uniqueParts.size} unique parts, exceeding the limit of ${MAX_UNIQUE_SERVICE_PARTS}`,
    );
  }

  return items;
}

function nonEmptyQueryString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseOptionalBooleanQuery(value: unknown, field: string, defaultValue: boolean): boolean {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  fail(field, value, `${field} must be a boolean`);
}

function parseIsoInstantQuery(value: string, field: string): Timestamp {
  const match = ISO_INSTANT_REGEX.exec(value);
  if (!match) {
    fail(field, value, `${field} must be a valid ISO-8601 date-time with timezone offset`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fraction = match[7] ?? '';
  const offset = match[8]!;

  const utcCheck = new Date(Date.UTC(year, month - 1, day));
  if (
    utcCheck.getUTCFullYear() !== year ||
    utcCheck.getUTCMonth() !== month - 1 ||
    utcCheck.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    fail(field, value, `${field} contains an invalid calendar date or time`);
  }

  if (offset !== 'Z') {
    const offsetHour = Number(offset.slice(1, 3));
    const offsetMin = Number(offset.slice(4, 6));
    if (offsetHour > 18 || offsetMin > 59) {
      fail(field, value, `${field} contains an invalid timezone offset`);
    }
  }

  const wholeIso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${offset}`;
  const wholeMs = Date.parse(wholeIso);
  if (!Number.isFinite(wholeMs)) {
    fail(field, value, `${field} could not be parsed as an ISO-8601 timestamp`);
  }
  const nanos = fraction.length === 0 ? 0 : Number(fraction.padEnd(9, '0').slice(0, 9));
  return new Timestamp(Math.floor(wholeMs / 1000), nanos);
}

export function parsePartSearchQuery(
  query: Record<string, unknown>,
): { filters: PartSearchFilters; page: PageRequest } {
  const page = parsePage(
    query,
    'partCode',
    ['partCode', 'name', 'category', 'currentQuantity', 'minReorderLevel', 'defaultUnitCost', 'createdAt', 'isActive', 'active'],
    'ASC',
  );
  const filters: PartSearchFilters = {
    includeArchived: parseOptionalBooleanQuery(query.includeArchived, 'includeArchived', false),
    lowStockOnly: parseOptionalBooleanQuery(query.lowStockOnly, 'lowStockOnly', false),
  };
  if (query.active !== undefined && query.active !== null && query.active !== '') {
    filters.active = parseOptionalBooleanQuery(query.active, 'active', true);
  }

  const searchRaw = nonEmptyQueryString(query.search);
  if (searchRaw !== undefined) {
    filters.search = searchRaw.toLowerCase();
  }
  const categoryRaw = nonEmptyQueryString(query.category);
  if (categoryRaw !== undefined) {
    filters.category = categoryRaw.toUpperCase();
  }

  return { filters, page };
}

export function parseStockMovementSearchQuery(
  query: Record<string, unknown>,
): { filters: StockMovementSearchFilters; page: PageRequest } {
  const page = parsePage(
    query,
    'createdAt',
    ['createdAt', 'movementType', 'partCode', 'quantityDelta', 'unitCost'],
    'DESC',
  );
  const filters: StockMovementSearchFilters = {};

  const partIdRaw = nonEmptyQueryString(query.partId);
  if (partIdRaw !== undefined) {
    filters.partId = requireUuid(partIdRaw, 'partId');
  }

  const typeRaw = nonEmptyQueryString(query.type);
  if (typeRaw !== undefined) {
    filters.type = validateStockMovementType(typeRaw, 'type');
  }

  const startDateRaw = nonEmptyQueryString(query.startDate);
  if (startDateRaw !== undefined) {
    filters.startDate = parseIsoInstantQuery(startDateRaw, 'startDate');
  }

  const endDateRaw = nonEmptyQueryString(query.endDate);
  if (endDateRaw !== undefined) {
    filters.endDate = parseIsoInstantQuery(endDateRaw, 'endDate');
  }

  return { filters, page };
}

export function parseSupplierSearchQuery(
  query: Record<string, unknown>,
): { filters: SupplierSearchFilters; page: PageRequest } {
  const page = parsePage(query, 'name', ['name', 'createdAt', 'isActive', 'active'], 'ASC');
  const filters: SupplierSearchFilters = {
    includeArchived: parseOptionalBooleanQuery(query.includeArchived, 'includeArchived', false),
  };
  if (query.active !== undefined && query.active !== null && query.active !== '') {
    filters.active = parseOptionalBooleanQuery(query.active, 'active', true);
  }

  const searchRaw = nonEmptyQueryString(query.search);
  if (searchRaw !== undefined) {
    filters.search = searchRaw.toLowerCase();
  }

  return { filters, page };
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

export function assertTransactionBudget(writeEntries: PlannedWriteEntry[]): void {
  if (writeEntries.length > MAX_TRANSACTION_WRITES) {
    throw new UnprocessableEntityError(
      `Operation requires ${writeEntries.length} Firestore writes, exceeding the atomic transaction limit of ${MAX_TRANSACTION_WRITES}`,
    );
  }
  const estimatedBytes = estimateCommitPayloadBytes(writeEntries);
  if (!Number.isFinite(estimatedBytes) || estimatedBytes > MAX_COMMIT_PAYLOAD_BYTES) {
    throw new UnprocessableEntityError(
      `Estimated atomic Commit payload (${estimatedBytes} bytes) exceeds the ${MAX_COMMIT_PAYLOAD_BYTES}-byte limit`,
    );
  }
}
