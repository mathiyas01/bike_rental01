import type { AllocationMode, Currency, PaymentMethod, PaymentStatus } from '../domain/types.js';

export const MAX_AFFECTED_CHARGES = 200;
export const MAX_TRANSACTION_WRITES = 500;
export const MAX_COMMIT_PAYLOAD_BYTES = 10 * 1024 * 1024;
export const COMMIT_OVERHEAD_MULTIPLIER = 1.5;
export const COMMIT_PER_DOC_OVERHEAD_BYTES = 1024;
export const MAX_ALLOCATIONS_PER_CHARGE = 200;
export const MAX_PARENT_PAYMENTS_READ = 500;
export const MAX_ALLOCATION_HISTORY_READS_CREATE = 1000;
export const MAX_ALLOCATION_HISTORY_READS_REVERSE = 1000;

export interface PaymentAllocationDto {
  id: string;
  paymentId: string;
  rentalChargeId: string;
  chargeSequence: number;
  chargeDueDate: string;
  allocatedAmount: number;
  currency: Currency;
  allocatedAt: string;
}

export interface PaymentDto {
  id: string;
  customerId: string;
  customerName: string;
  rentalId: string | null;
  paymentDate: string;
  amount: number;
  currency: Currency;
  paymentMethod: PaymentMethod;
  referenceNumber: string | null;
  notes: string | null;
  status: PaymentStatus;
  recordedByUserName: string;
  allocations: PaymentAllocationDto[];
  reversalReason: string | null;
  reversedAt: string | null;
  createdAt: string;
}

export interface CurrencyBalanceDto {
  currency: Currency;
  totalBilled: number;
  totalPaid: number;
  totalOutstanding: number;
}

export interface CustomerBalanceSummaryDto {
  customerId: string;
  customerName: string;
  balances: Record<Currency, CurrencyBalanceDto>;
}

export interface ManualAllocationInput {
  rentalChargeId: string;
  amount: string;
  amountMinor: bigint;
}

export interface RecordPaymentInput {
  customerId: string;
  rentalId: string | null;
  paymentDate: string;
  amount: string;
  amountMinor: bigint;
  currency: Currency;
  paymentMethod: PaymentMethod;
  referenceNumber: string | null;
  notes: string | null;
  allocationMode: AllocationMode;
  manualAllocations: ManualAllocationInput[];
}

export interface ReversePaymentInput {
  reason: string;
}

export interface PaymentSearchFilters {
  status?: PaymentStatus;
  currency?: Currency;
  method?: PaymentMethod;
  customerId?: string;
  startDate?: string;
  endDate?: string;
}
