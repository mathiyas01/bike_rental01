import type { BikeStatus } from '../domain/types.js';
import { parseBoundedDecimal } from '../inventory/inventory.validation.js';
import { parseDate, todayBucharest } from '../shared/dates.js';
import { ValidationError } from '../shared/errors.js';
import { parsePage, type PageRequest } from '../shared/pagination.js';
import {
  MAX_ODOMETER_MINOR,
  type BikeSearchFilters,
  type CreateBikeInput,
  type CreateCustomerInput,
  type CustomerSearchFilters,
  type UpdateBikeInput,
  type UpdateBikeStatusInput,
  type UpdateCustomerInput,
} from './reference.types.js';

const BIKE_STATUSES = new Set<BikeStatus>([
  'AVAILABLE',
  'RENTED',
  'IN_SERVICE',
  'INACTIVE',
]);

const BIKE_SORT_FIELDS = [
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
];

const CUSTOMER_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'fullName',
  'phone',
  'email',
  'livingCity',
];

const MAX_INT_32 = 2_147_483_647;
const INTEGER_STRING_REGEX = /^-?\d+$/;

function fail(field: string, rejectedValue: unknown, message: string): never {
  throw new ValidationError([{ field, rejectedValue: rejectedValue ?? null, message }]);
}

function hasOwn(object: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function requirePlainObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    fail('body', body, 'Request body must be a JSON object');
  }
  return body as Record<string, unknown>;
}

function requireTrimmedString(
  value: unknown,
  field: string,
  minLength: number,
  maxLength: number,
): string {
  if (typeof value !== 'string') {
    fail(field, value, `${field} must not be blank`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    fail(field, value, `${field} must not be blank`);
  }
  if (trimmed.length < minLength || trimmed.length > maxLength) {
    fail(field, value, `${field} must be between ${minLength} and ${maxLength} characters`);
  }
  return trimmed;
}

function parseOptionalTrimmedString(
  value: unknown,
  field: string,
  maxLength?: number,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    fail(field, value, `${field} must be a string`);
  }
  const trimmed = value.trim();
  // React form inputs submit "" for empty optional fields; normalize blanks to null.
  if (trimmed.length === 0) {
    return null;
  }
  if (maxLength !== undefined && trimmed.length > maxLength) {
    fail(field, value, `${field} must not exceed ${maxLength} characters`);
  }
  return trimmed;
}

function parseOptionalEmail(value: unknown, field = 'email'): string | null {
  const normalized = parseOptionalTrimmedString(value, field, 150);
  if (normalized === null) {
    return null;
  }
  const lower = normalized.toLowerCase();
  if (/\s/.test(lower)) {
    fail(field, value, `${field} must be a valid email address`);
  }
  const parts = lower.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1] || !parts[1].includes('.')) {
    fail(field, value, `${field} must be a valid email address`);
  }
  if (parts[1].split('.').some((segment) => segment.length === 0)) {
    fail(field, value, `${field} must be a valid email address`);
  }
  return lower;
}

function parseValidDate(value: unknown, field: string): string {
  try {
    return parseDate(value, field);
  } catch {
    fail(field, value, `${field} must be a valid YYYY-MM-DD date`);
  }
}

function parseOptionalDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    fail(field, value, `${field} must be a YYYY-MM-DD date string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return parseValidDate(trimmed, field);
}

function parseRequiredInteger(
  value: unknown,
  field: string,
  min: number,
  max = MAX_INT_32,
): number {
  let parsed: number;
  if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string' && INTEGER_STRING_REGEX.test(value.trim())) {
    parsed = Number(value.trim());
  } else {
    fail(field, value, `${field} must be an integer between ${min} and ${max}`);
  }
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    fail(field, value, `${field} must be an integer between ${min} and ${max}`);
  }
  return parsed;
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

export function validateBikeStatus(value: unknown, field = 'status'): BikeStatus {
  if (typeof value !== 'string' || !BIKE_STATUSES.has(value as BikeStatus)) {
    fail(field, value, 'status must be one of: AVAILABLE, RENTED, IN_SERVICE, INACTIVE');
  }
  return value as BikeStatus;
}

export function parseCreateBikeInput(body: unknown): CreateBikeInput {
  const data = requirePlainObject(body);

  const registrationNumber = requireTrimmedString(data.registrationNumber, 'registrationNumber', 3, 20).toUpperCase();
  const vin = requireTrimmedString(data.vin, 'vin', 5, 30).toUpperCase();
  const make = requireTrimmedString(data.make, 'make', 1, 50);
  const model = requireTrimmedString(data.model, 'model', 1, 50);
  const rawManufactureYear = data.manufactureYear !== undefined ? data.manufactureYear : data.yearOfManufacture;
  const manufactureYear = parseRequiredInteger(rawManufactureYear, 'manufactureYear', 1990, 2050);

  let currentOdometer = '0.00';
  if (hasOwn(data, 'currentOdometer') && data.currentOdometer !== undefined) {
    if (data.currentOdometer === null) {
      fail('currentOdometer', null, 'currentOdometer must not be null');
    }
    currentOdometer = parseBoundedDecimal(data.currentOdometer, 'currentOdometer', 0, MAX_ODOMETER_MINOR).canonical;
  }

  let serviceIntervalDays = 30;
  if (hasOwn(data, 'serviceIntervalDays') && data.serviceIntervalDays !== undefined) {
    if (data.serviceIntervalDays === null) {
      fail('serviceIntervalDays', null, 'serviceIntervalDays must not be null');
    }
    serviceIntervalDays = parseRequiredInteger(data.serviceIntervalDays, 'serviceIntervalDays', 1);
  }

  const status: BikeStatus = data.status === undefined || data.status === null
    ? 'AVAILABLE'
    : validateBikeStatus(data.status, 'status');

  return {
    registrationNumber,
    vin,
    make,
    model,
    manufactureYear,
    currentOdometer,
    itpExpiryDate: parseOptionalDate(data.itpExpiryDate, 'itpExpiryDate'),
    rcaExpiryDate: parseOptionalDate(data.rcaExpiryDate, 'rcaExpiryDate'),
    cascoExpiryDate: parseOptionalDate(data.cascoExpiryDate, 'cascoExpiryDate'),
    serviceIntervalDays,
    status,
    notes: parseOptionalTrimmedString(data.notes, 'notes'),
  };
}

export function parseUpdateBikeInput(body: unknown): UpdateBikeInput {
  const data = requirePlainObject(body);

  const registrationNumber = requireTrimmedString(data.registrationNumber, 'registrationNumber', 3, 20).toUpperCase();
  const vin = requireTrimmedString(data.vin, 'vin', 5, 30).toUpperCase();
  const make = requireTrimmedString(data.make, 'make', 1, 50);
  const model = requireTrimmedString(data.model, 'model', 1, 50);
  const rawManufactureYear = data.manufactureYear !== undefined ? data.manufactureYear : data.yearOfManufacture;
  const manufactureYear = parseRequiredInteger(rawManufactureYear, 'manufactureYear', 1990, 2050);
  const currentOdometer = parseBoundedDecimal(data.currentOdometer, 'currentOdometer', 0, MAX_ODOMETER_MINOR).canonical;

  const serviceIntervalDays = data.serviceIntervalDays === undefined || data.serviceIntervalDays === null
    ? null
    : parseRequiredInteger(data.serviceIntervalDays, 'serviceIntervalDays', 1);

  const status = data.status === undefined || data.status === null
    ? null
    : validateBikeStatus(data.status, 'status');

  return {
    registrationNumber,
    vin,
    make,
    model,
    manufactureYear,
    currentOdometer,
    itpExpiryDate: parseOptionalDate(data.itpExpiryDate, 'itpExpiryDate'),
    rcaExpiryDate: parseOptionalDate(data.rcaExpiryDate, 'rcaExpiryDate'),
    cascoExpiryDate: parseOptionalDate(data.cascoExpiryDate, 'cascoExpiryDate'),
    serviceIntervalDays,
    status,
    notes: parseOptionalTrimmedString(data.notes, 'notes'),
  };
}

export function parseUpdateBikeStatusInput(body: unknown): UpdateBikeStatusInput {
  const data = requirePlainObject(body);
  return {
    status: validateBikeStatus(data.status, 'status'),
  };
}

export function parseBikeSearchQuery(
  query: Record<string, unknown>,
): { filters: BikeSearchFilters; page: PageRequest } {
  const page = parsePage(query, 'createdAt', BIKE_SORT_FIELDS, 'DESC');
  const filters: BikeSearchFilters = {
    includeArchived: parseOptionalBooleanQuery(query.includeArchived, 'includeArchived', false),
  };

  const searchRaw = nonEmptyQueryString(query.search);
  if (searchRaw !== undefined) {
    filters.search = searchRaw.toLowerCase();
  }

  const statusRaw = nonEmptyQueryString(query.status);
  if (statusRaw !== undefined) {
    filters.status = validateBikeStatus(statusRaw, 'status');
  }

  return { filters, page };
}

export function parseCreateCustomerInput(body: unknown): CreateCustomerInput {
  const data = requirePlainObject(body);

  return {
    fullName: requireTrimmedString(data.fullName, 'fullName', 1, 150),
    phone: requireTrimmedString(data.phone, 'phone', 8, 30),
    email: parseOptionalEmail(data.email, 'email'),
    cnpOrTaxId: parseOptionalTrimmedString(data.cnpOrTaxId, 'cnpOrTaxId', 50),
    dateOfBirth: parseOptionalDate(data.dateOfBirth, 'dateOfBirth'),
    livingCity: parseOptionalTrimmedString(data.livingCity, 'livingCity', 100),
    drivingLicenceNumber: parseOptionalTrimmedString(data.drivingLicenceNumber, 'drivingLicenceNumber', 50),
    licenceCategories: parseOptionalTrimmedString(data.licenceCategories, 'licenceCategories', 50) ?? 'A,A2',
    licenceExpiryDate: parseOptionalDate(data.licenceExpiryDate, 'licenceExpiryDate'),
    address: parseOptionalTrimmedString(data.address, 'address'),
    gdprConsentDate: parseOptionalDate(data.gdprConsentDate, 'gdprConsentDate') ?? todayBucharest(),
    notes: parseOptionalTrimmedString(data.notes, 'notes'),
  };
}

export function parseUpdateCustomerInput(body: unknown): UpdateCustomerInput {
  const data = requirePlainObject(body);

  return {
    fullName: requireTrimmedString(data.fullName, 'fullName', 1, 150),
    phone: requireTrimmedString(data.phone, 'phone', 8, 30),
    email: parseOptionalEmail(data.email, 'email'),
    cnpOrTaxId: parseOptionalTrimmedString(data.cnpOrTaxId, 'cnpOrTaxId', 50),
    drivingLicenceNumber: parseOptionalTrimmedString(data.drivingLicenceNumber, 'drivingLicenceNumber', 50),
    licenceCategories: parseOptionalTrimmedString(data.licenceCategories, 'licenceCategories', 50),
    licenceExpiryDate: parseOptionalDate(data.licenceExpiryDate, 'licenceExpiryDate'),
    address: parseOptionalTrimmedString(data.address, 'address'),
    notes: parseOptionalTrimmedString(data.notes, 'notes'),
  };
}

export function parseCustomerSearchQuery(
  query: Record<string, unknown>,
): { filters: CustomerSearchFilters; page: PageRequest } {
  const page = parsePage(query, 'createdAt', CUSTOMER_SORT_FIELDS, 'DESC');
  const filters: CustomerSearchFilters = {
    includeArchived: parseOptionalBooleanQuery(query.includeArchived, 'includeArchived', false),
  };

  const searchRaw = nonEmptyQueryString(query.search);
  if (searchRaw !== undefined) {
    filters.search = searchRaw.toLowerCase();
  }

  return { filters, page };
}
