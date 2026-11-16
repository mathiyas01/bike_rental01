import { isBefore, parseDate } from '../shared/dates.js';
import { BusinessError, ValidationError } from '../shared/errors.js';
import { requireUuid } from '../shared/ids.js';
import type { DateRangeQuery } from './reports.types.js';

function validateIsoDateParam(
  value: unknown,
  field: string,
  errors: Array<{ field: string; rejectedValue: unknown; message: string }>,
): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push({
      field,
      rejectedValue: value ?? null,
      message: `${field} is required and must be a valid YYYY-MM-DD date`,
    });
    return null;
  }
  const trimmed = value.trim();
  try {
    return parseDate(trimmed, field);
  } catch {
    errors.push({
      field,
      rejectedValue: value,
      message: `${field} must be a valid YYYY-MM-DD date`,
    });
    return null;
  }
}

/**
 * Validates required `fromDate` and `toDate` ISO date parameters.
 *
 * Intentional compatibility deviation from Java: returns HTTP 400 (instead of Java's
 * unhandled IllegalArgumentException / MissingServletRequestParameterException 500)
 * when parameters are missing, malformed, or `fromDate > toDate`. Equal dates are allowed.
 */
export function parseDateRangeQuery(query: Record<string, unknown>): DateRangeQuery {
  const errors: Array<{ field: string; rejectedValue: unknown; message: string }> = [];
  const fromDate = validateIsoDateParam(query.fromDate, 'fromDate', errors);
  const toDate = validateIsoDateParam(query.toDate, 'toDate', errors);

  if (errors.length > 0 || fromDate === null || toDate === null) {
    throw new ValidationError(errors);
  }

  if (isBefore(toDate, fromDate)) {
    throw new BusinessError('fromDate cannot be after toDate');
  }

  return { fromDate, toDate };
}

export function parseBikeRoiIdParam(bikeId: unknown): string {
  const normalized = typeof bikeId === 'string' || Array.isArray(bikeId) ? bikeId : undefined;
  return requireUuid(normalized, 'bikeId');
}
