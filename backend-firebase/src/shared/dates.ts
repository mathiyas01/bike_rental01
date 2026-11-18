const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const BUSINESS_TIME_ZONE = 'Europe/Bucharest';

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

export function todayInTimeZone(
  referenceDate: Date = new Date(),
  timeZone: string = BUSINESS_TIME_ZONE,
): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(referenceDate);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) {
    throw new Error(`Unable to format date for timezone: ${timeZone}`);
  }
  return `${year}-${month}-${day}`;
}

export function todayBucharest(referenceDate: Date = new Date()): string {
  return todayInTimeZone(referenceDate, BUSINESS_TIME_ZONE);
}
