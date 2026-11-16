import { ValidationError } from './errors.js';

const MONEY_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const STRICT_MONEY_PATTERN = /^(0|[1-9]\d*)(?:\.\d{1,2})?$/;

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
  return minorUnitsToJson(toMinorUnits(value));
}

export function parseStrictMoney(value: unknown, field: string, minimum = 0.01): string {
  let text: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ValidationError([{
        field,
        rejectedValue: value,
        message: `${field} must be a finite decimal number with at most 2 fractional digits`,
      }]);
    }
    text = String(value);
  } else if (typeof value === 'string') {
    text = value.trim();
  } else {
    throw new ValidationError([{
      field,
      rejectedValue: value ?? null,
      message: `${field} must be a decimal number or numeric string with at most 2 fractional digits`,
    }]);
  }

  if (!STRICT_MONEY_PATTERN.test(text)) {
    throw new ValidationError([{
      field,
      rejectedValue: value,
      message: `${field} must be a non-negative decimal with at most 2 fractional digits`,
    }]);
  }

  const [whole, fraction = ''] = text.split('.');
  const minor = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  const minimumMinor = BigInt(Math.round(minimum * 100));
  if (minor < minimumMinor) {
    throw new ValidationError([{
      field,
      rejectedValue: value,
      message: `${field} must be at least ${minimum.toFixed(2)}`,
    }]);
  }
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ValidationError([{
      field,
      rejectedValue: value,
      message: `${field} exceeds maximum supported monetary precision`,
    }]);
  }

  return fromMinorUnits(minor);
}

export function normalizeAllocation(value: unknown, field = 'allocatedAmount'): string {
  return normalizeMoney(value, field, 0);
}

const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function parsePlainDecimalToScaledBigInt(text: string, decimals: 2 | 4): bigint | null {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!match) return null;
  const [, sign, whole, frac = ''] = match;
  if (frac.length > decimals) return null;
  const factor = decimals === 2 ? 100n : 10_000n;
  const scaled = BigInt(whole!) * factor + BigInt(frac.padEnd(decimals, '0'));
  return sign === '-' ? -scaled : scaled;
}

export function toMinorUnits(value: string): bigint {
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const minor = BigInt(whole || '0') * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
  return negative ? -minor : minor;
}

export function fromMinorUnits(minor: bigint): string {
  const sign = minor < 0n ? '-' : '';
  const absolute = minor < 0n ? -minor : minor;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

export function minorUnitsToJson(minorUnits: bigint): number {
  const absolute = minorUnits < 0n ? -minorUnits : minorUnits;
  if (absolute > MAX_SAFE_INTEGER_BIGINT) {
    throw new Error('Monetary value exceeds safe JSON serialization range');
  }
  const canonical = fromMinorUnits(minorUnits);
  const result = Number(canonical);
  const roundTripped = Number.isFinite(result)
    ? parsePlainDecimalToScaledBigInt(result.toString(), 2)
    : null;
  if (roundTripped === null || roundTripped !== minorUnits) {
    throw new Error('Monetary value exceeds safe JSON serialization range');
  }
  return result;
}

export function toScale4Units(value: string): bigint {
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const scaled = BigInt(whole || '0') * 10_000n + BigInt(fraction.padEnd(4, '0').slice(0, 4));
  return negative ? -scaled : scaled;
}

export function fromScale4Units(units: bigint): string {
  const sign = units < 0n ? '-' : '';
  const absolute = units < 0n ? -units : units;
  const whole = absolute / 10_000n;
  const frac = String(absolute % 10_000n).padStart(4, '0');
  const trimmedFrac = frac.replace(/0+$/, '');
  const paddedFrac = trimmedFrac.length <= 2 ? trimmedFrac.padEnd(2, '0') : trimmedFrac;
  return `${sign}${whole}.${paddedFrac}`;
}

export function minorToScale4Units(minorUnits: bigint): bigint {
  return minorUnits * 100n;
}

export function multiplyMinorToScale4Units(leftMinor: bigint, rightMinor: bigint): bigint {
  return leftMinor * rightMinor;
}

export function scale4UnitsToJson(units: bigint): number {
  const absolute = units < 0n ? -units : units;
  if (absolute > MAX_SAFE_INTEGER_BIGINT) {
    throw new Error('Monetary value exceeds safe JSON serialization range');
  }
  const canonical = fromScale4Units(units);
  const result = Number(canonical);
  const roundTripped = Number.isFinite(result)
    ? parsePlainDecimalToScaledBigInt(result.toString(), 4)
    : null;
  if (roundTripped === null || roundTripped !== units) {
    throw new Error('Monetary value exceeds safe JSON serialization range');
  }
  return result;
}

export function scale4ToJson(value: string): number {
  return scale4UnitsToJson(toScale4Units(value));
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
