import { ValidationError } from './errors.js';

export function requireUuid(value: string | string[] | undefined, field: string): string {
  if (typeof value !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ValidationError([{
      field,
      rejectedValue: value ?? null,
      message: `${field} must be a valid UUID`,
    }]);
  }
  return value;
}
