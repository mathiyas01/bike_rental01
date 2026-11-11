const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw new Error(`${field} must be a valid ISO date`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${field} must be a valid ISO date`);
  }
  return value;
}

export function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isBefore(left: string, right: string): boolean {
  return left < right;
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
