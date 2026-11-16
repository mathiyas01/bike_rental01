import type { Currency, ServiceStatus } from '../domain/types.js';
import {
  MAX_COST_MINOR,
} from '../inventory/inventory.types.js';
import {
  parseBoundedDecimal,
  parseServicePartsUsed,
  validateCurrency,
} from '../inventory/inventory.validation.js';
import { parseDate, todayUtc } from '../shared/dates.js';
import { ValidationError } from '../shared/errors.js';
import { requireUuid } from '../shared/ids.js';
import {
  fromScale4Units,
  minorToScale4Units,
  multiplyMinorToScale4Units,
  scale4ToJson,
  toMinorUnits,
  toScale4Units,
} from '../shared/money.js';
export { fromScale4Units, scale4ToJson, toScale4Units };
import { parsePage, type PageRequest } from '../shared/pagination.js';
import {
  MAX_ODOMETER_MINOR,
  type LogServiceInput,
  type ServiceSearchFilters,
} from './servicing.types.js';

const SERVICE_STATUSES = new Set<ServiceStatus>([
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
]);

const SERVICE_SORT_FIELDS = [
  'serviceDate',
  'odometerReading',
  'labourCost',
  'totalCost',
  'status',
  'nextServiceDueDate',
  'createdAt',
];

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

function parseOptionalNotes(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    fail('notes', value, 'notes must be a string');
  }
  return value;
}

function nonEmptyQueryString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function validateServiceStatus(value: unknown, field = 'status'): ServiceStatus {
  if (typeof value !== 'string' || !SERVICE_STATUSES.has(value as ServiceStatus)) {
    fail(field, value, 'status must be one of: PLANNED, IN_PROGRESS, COMPLETED, CANCELLED');
  }
  return value as ServiceStatus;
}

export function parseValidDate(value: unknown, field: string): string {
  try {
    return parseDate(value, field);
  } catch {
    fail(field, value, `${field} must be a valid YYYY-MM-DD date`);
  }
}

export function computePartUsageTotalCost(
  quantity: string,
  unitCost: string,
): { totalCost: string; totalCostScale4: bigint } {
  // Quantity and unitCost are both canonical scale-2 decimals, so their product is exact in scale-4 units.
  const totalCostScale4 = multiplyMinorToScale4Units(toMinorUnits(quantity), toMinorUnits(unitCost));
  return {
    totalCost: fromScale4Units(totalCostScale4),
    totalCostScale4,
  };
}

export function computeServiceCostTotals(
  labourCost: string,
  labourCurrency: Currency,
  partsUsed: ReadonlyArray<{ currency: Currency; totalCost: string }>,
): { partsCost: string; totalCost: string } {
  const targetCurrency = labourCurrency.toUpperCase();
  let partsScale4 = 0n;
  for (const usage of partsUsed) {
    if (usage.currency.toUpperCase() === targetCurrency) {
      partsScale4 += toScale4Units(usage.totalCost);
    }
  }
  const labourScale4 = minorToScale4Units(toMinorUnits(labourCost));
  return {
    partsCost: fromScale4Units(partsScale4),
    totalCost: fromScale4Units(labourScale4 + partsScale4),
  };
}

export function parseLogServiceInput(body: unknown): LogServiceInput {
  const data = requirePlainObject(body);

  const motorbikeId = requireUuid(
    typeof data.motorbikeId === 'string' ? data.motorbikeId : undefined,
    'motorbikeId',
  );
  const serviceDate = parseValidDate(data.serviceDate, 'serviceDate');
  const odometer = parseBoundedDecimal(
    data.odometerReading,
    'odometerReading',
    0,
    MAX_ODOMETER_MINOR,
  );
  const serviceProvider = requireNonBlankString(data.serviceProvider, 'serviceProvider', 150);
  const workPerformed = requireNonBlankString(data.workPerformed, 'workPerformed');

  let labourCost = '0.00';
  if (data.labourCost !== undefined) {
    labourCost = parseBoundedDecimal(data.labourCost, 'labourCost', 0, MAX_COST_MINOR).canonical;
  }

  const labourCurrency = data.labourCurrency === undefined
    ? 'RON'
    : validateCurrency(data.labourCurrency, 'labourCurrency');

  const status = data.status === undefined || data.status === null
    ? 'COMPLETED'
    : validateServiceStatus(data.status, 'status');

  const nextServiceDueDate =
    data.nextServiceDueDate === undefined || data.nextServiceDueDate === null
      ? null
      : parseValidDate(data.nextServiceDueDate, 'nextServiceDueDate');

  const nextServiceDueOdometer =
    data.nextServiceDueOdometer === undefined || data.nextServiceDueOdometer === null
      ? null
      : parseBoundedDecimal(
        data.nextServiceDueOdometer,
        'nextServiceDueOdometer',
        0,
        MAX_ODOMETER_MINOR,
      ).canonical;

  const notes = parseOptionalNotes(data.notes);
  const partsUsed = parseServicePartsUsed(data.partsUsed);

  return {
    motorbikeId,
    serviceDate,
    odometerReading: odometer.canonical,
    odometerReadingMinor: odometer.minor,
    serviceProvider,
    workPerformed,
    labourCost,
    labourCurrency,
    status,
    nextServiceDueDate,
    nextServiceDueOdometer,
    notes,
    partsUsed,
    rawPartsUsed: data.partsUsed,
  };
}

export function parseServiceSearchQuery(
  query: Record<string, unknown>,
): { filters: ServiceSearchFilters; page: PageRequest } {
  const page = parsePage(query, 'serviceDate', SERVICE_SORT_FIELDS, 'DESC');
  const filters: ServiceSearchFilters = {};

  const bikeIdRaw = nonEmptyQueryString(query.bikeId);
  if (bikeIdRaw !== undefined) {
    filters.bikeId = requireUuid(bikeIdRaw, 'bikeId');
  }

  const statusRaw = nonEmptyQueryString(query.status);
  if (statusRaw !== undefined) {
    filters.status = validateServiceStatus(statusRaw, 'status');
  }

  const startDateRaw = nonEmptyQueryString(query.startDate);
  if (startDateRaw !== undefined) {
    filters.startDate = parseValidDate(startDateRaw, 'startDate');
  }

  const endDateRaw = nonEmptyQueryString(query.endDate);
  if (endDateRaw !== undefined) {
    filters.endDate = parseValidDate(endDateRaw, 'endDate');
  }

  return { filters, page };
}

export function parseDueServicesQuery(query: Record<string, unknown>): string {
  const asOfDateRaw = nonEmptyQueryString(query.asOfDate);
  if (asOfDateRaw !== undefined) {
    return parseValidDate(asOfDateRaw, 'asOfDate');
  }
  return todayUtc();
}
