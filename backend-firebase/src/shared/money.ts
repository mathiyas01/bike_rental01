const MONEY_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function normalizeMoney(value: unknown, field: string, minimum = 0): string {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`${field} must be a decimal number`);
  }
  const raw = String(value).trim();
  if (!MONEY_PATTERN.test(raw)) throw new Error(`${field} must be a decimal number`);
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, fraction = ''] = unsigned.split('.');
  let minor = BigInt(whole!) * 100n;
  const digits = fraction.padEnd(3, '0');
  minor += BigInt(digits.slice(0, 2));
  if (digits[2]! >= '5') minor += 1n;
  if (negative) minor = -minor;
  const minimumMinor = BigInt(Math.round(minimum * 100));
  if (minor < minimumMinor) {
    throw new Error(`${field} must be at least ${minimum.toFixed(2)}`);
  }
  return `${minor < 0n ? '-' : ''}${(minor < 0n ? -minor : minor) / 100n}.${String((minor < 0n ? -minor : minor) % 100n).padStart(2, '0')}`;
}

export function addMoney(left: string, right: string): string {
  const minor = toMinor(left) + toMinor(right);
  return fromMinor(minor);
}

export function subtractMoney(left: string, right: string): string {
  return fromMinor(toMinor(left) - toMinor(right));
}

export function maxZero(value: string): string {
  return toMinor(value) < 0n ? '0.00' : normalizeMoney(value, 'amount');
}

export function moneyToJson(value: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(Math.round(result * 100))) {
    throw new Error('Monetary value exceeds safe JSON serialization range');
  }
  return result;
}

export function normalizeAllocation(value: unknown, field = 'allocatedAmount'): string {
  return normalizeMoney(value, field, 0);
}

function toMinor(value: string): bigint {
  const [whole, fraction] = value.split('.');
  return BigInt(whole!) * 100n + BigInt(fraction!);
}

function fromMinor(minor: bigint): string {
  const sign = minor < 0n ? '-' : '';
  const absolute = minor < 0n ? -minor : minor;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
