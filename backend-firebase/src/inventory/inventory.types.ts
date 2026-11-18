import type { Timestamp } from 'firebase-admin/firestore';
import type { Currency, StockMovementType } from '../domain/types.js';

export const MAX_SEARCH_SCAN_DOCS = 1000;
export const MAX_SERVICE_PARTS_ITEMS = 50;
export const MAX_UNIQUE_SERVICE_PARTS = 50;
export const MAX_TRANSACTION_WRITES = 500;
export const MAX_COMMIT_PAYLOAD_BYTES = 10 * 1024 * 1024;
export const COMMIT_OVERHEAD_MULTIPLIER = 1.5;
export const COMMIT_PER_DOC_OVERHEAD_BYTES = 1024;

// PostgreSQL DECIMAL(10, 2) max for quantities and DECIMAL(14, 2) max for costs.
export const MAX_QUANTITY_MINOR = 9_999_999_999n;
export const MAX_COST_MINOR = 99_999_999_999_999n;

export interface PartDto {
  id: string;
  partCode: string;
  name: string;
  category: string;
  description: string | null;
  unitOfMeasure: string;
  currentQuantity: number;
  minReorderLevel: number;
  defaultUnitCost: number;
  costCurrency: Currency;
  defaultSupplierId: string | null;
  defaultSupplierName: string | null;
  lowStock: boolean;
  isLowStock: boolean;
  active: boolean;
  createdAt: string;
}

export interface StockMovementDto {
  id: string;
  partId: string;
  partCode: string;
  partName: string;
  quantityDelta: number;
  movementType: StockMovementType;
  referenceType: string | null;
  referenceId: string | null;
  unitCost: number;
  currency: Currency;
  reason: string | null;
  recordedByUserName: string;
  createdAt: string;
}

export interface SupplierDto {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  taxCui: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
}

export interface CreatePartInput {
  partCode: string;
  name: string;
  category: string;
  description: string | null;
  unitOfMeasure: string;
  initialQuantity: string;
  initialQuantityMinor: bigint;
  minReorderLevel: string;
  minReorderLevelMinor: bigint;
  defaultUnitCost: string;
  costCurrency: Currency;
  defaultSupplierId: string | null;
}

export interface UpdatePartInput {
  name: string;
  category: string;
  description: string | null;
  unitOfMeasure: string;
  minReorderLevel: string;
  minReorderLevelMinor: bigint;
  defaultUnitCost: string;
  defaultSupplierId: string | null;
}

export interface RecordStockMovementInput {
  partId: string;
  quantity: string;
  quantityMinor: bigint;
  movementType: StockMovementType;
  referenceType: string | null;
  referenceId: string | null;
  unitCost: string | null;
  currency: Currency | null;
  reason: string | null;
}

export interface CreateSupplierInput {
  name: string;
  nameNormalized: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  taxCui: string | null;
  address: string | null;
  notes: string | null;
}

export interface PartSearchFilters {
  search?: string;
  category?: string;
  lowStockOnly: boolean;
  includeArchived: boolean;
  active?: boolean;
}

export interface StockMovementSearchFilters {
  partId?: string;
  type?: StockMovementType;
  startDate?: Timestamp;
  endDate?: Timestamp;
}

export interface SupplierSearchFilters {
  search?: string;
  includeArchived: boolean;
  active?: boolean;
}

export interface ServicePartUsageInputItem {
  partId: string;
  quantity: string;
  quantityMinor: bigint;
  unitCost: string | null;
  currency: Currency | null;
}

export interface PreparedServicePartMovement {
  partId: string;
  partCode: string;
  partName: string;
  quantity: string;
  unitCost: string;
  currency: Currency;
  movementId: string;
  quantityDelta: string;
}
