import { createHash } from 'node:crypto';
import {
  FieldPath,
  Timestamp,
  type Firestore,
  type Query,
  type Transaction,
} from 'firebase-admin/firestore';
import { AuthError } from '../auth/errors.js';
import type {
  PartDocument,
  StockMovementDocument,
  SupplierDocument,
} from '../domain/types.js';
import { NotFoundError, UnprocessableEntityError } from '../shared/errors.js';
import { moneyToJson, toMinorUnits } from '../shared/money.js';
import type { PageRequest } from '../shared/pagination.js';
import {
  MAX_SEARCH_SCAN_DOCS,
  type PartDto,
  type PartSearchFilters,
  type StockMovementDto,
  type StockMovementSearchFilters,
  type SupplierDto,
  type SupplierSearchFilters,
} from './inventory.types.js';
import { isPartLowStock } from './inventory.validation.js';

export const APP_USERS = 'app_users';
export const PARTS = 'parts';
export const STOCK_MOVEMENTS = 'stock_movements';
export const SUPPLIERS = 'suppliers';
export const UNIQUE_KEYS = 'unique_keys';

export function partCodeLockId(normalizedCode: string): string {
  const hash = createHash('sha256').update(normalizedCode, 'utf8').digest('hex');
  return `part_code_${hash}`;
}

export function supplierNameLockId(normalizedName: string): string {
  const hash = createHash('sha256').update(normalizedName, 'utf8').digest('hex');
  return `supplier_name_${hash}`;
}

function timestampToIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return new Date(0).toISOString();
}

function compareTimestamps(left: Timestamp, right: Timestamp): number {
  if (left.seconds !== right.seconds) {
    return left.seconds - right.seconds;
  }
  return left.nanoseconds - right.nanoseconds;
}

function compareBigInt(left: bigint, right: bigint): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function partFrom(id: string, data: FirebaseFirestore.DocumentData): PartDocument {
  const currentQuantity = String(data.currentQuantity ?? '0.00');
  const minReorderLevel = String(data.minReorderLevel ?? '0.00');
  const currentMinor = toMinorUnits(currentQuantity);
  const reorderMinor = toMinorUnits(minReorderLevel);
  return {
    id,
    partCode: String(data.partCode ?? ''),
    name: String(data.name ?? ''),
    category: String(data.category ?? ''),
    description: data.description !== undefined && data.description !== null
      ? String(data.description)
      : null,
    unitOfMeasure: String(data.unitOfMeasure ?? 'PCS'),
    currentQuantity,
    currentQuantityMinor: typeof data.currentQuantityMinor === 'number'
      ? data.currentQuantityMinor
      : Number(currentMinor),
    minReorderLevel,
    defaultUnitCost: String(data.defaultUnitCost ?? '0.00'),
    costCurrency: data.costCurrency,
    defaultSupplierId: data.defaultSupplierId !== undefined && data.defaultSupplierId !== null
      ? String(data.defaultSupplierId)
      : null,
    defaultSupplierName: data.defaultSupplierName !== undefined && data.defaultSupplierName !== null
      ? String(data.defaultSupplierName)
      : null,
    isLowStock: typeof data.isLowStock === 'boolean'
      ? data.isLowStock
      : isPartLowStock(currentMinor, reorderMinor),
    isActive: data.isActive !== false,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export function stockMovementFrom(
  id: string,
  data: FirebaseFirestore.DocumentData,
): StockMovementDocument {
  return {
    id,
    partId: String(data.partId),
    partCode: String(data.partCode ?? ''),
    partName: String(data.partName ?? ''),
    quantityDelta: String(data.quantityDelta ?? '0.00'),
    movementType: data.movementType,
    referenceType: data.referenceType !== undefined && data.referenceType !== null
      ? String(data.referenceType)
      : null,
    referenceId: data.referenceId !== undefined && data.referenceId !== null
      ? String(data.referenceId)
      : null,
    unitCost: String(data.unitCost ?? '0.00'),
    currency: data.currency,
    reason: data.reason !== undefined && data.reason !== null ? String(data.reason) : null,
    recordedByUserId: String(data.recordedByUserId ?? ''),
    recordedByUserName: String(data.recordedByUserName ?? ''),
    createdAt: data.createdAt,
  };
}

export function supplierFrom(id: string, data: FirebaseFirestore.DocumentData): SupplierDocument {
  const name = String(data.name ?? '');
  return {
    id,
    name,
    nameNormalized: typeof data.nameNormalized === 'string'
      ? data.nameNormalized
      : name.trim().toLowerCase(),
    contactPerson: data.contactPerson !== undefined && data.contactPerson !== null
      ? String(data.contactPerson)
      : null,
    phone: data.phone !== undefined && data.phone !== null ? String(data.phone) : null,
    email: data.email !== undefined && data.email !== null ? String(data.email) : null,
    taxCui: data.taxCui !== undefined && data.taxCui !== null ? String(data.taxCui) : null,
    address: data.address !== undefined && data.address !== null ? String(data.address) : null,
    notes: data.notes !== undefined && data.notes !== null ? String(data.notes) : null,
    isActive: data.isActive !== false,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export function toPartDto(part: PartDocument): PartDto {
  return {
    id: part.id,
    partCode: part.partCode,
    name: part.name,
    category: part.category,
    description: part.description,
    unitOfMeasure: part.unitOfMeasure,
    currentQuantity: moneyToJson(part.currentQuantity),
    minReorderLevel: moneyToJson(part.minReorderLevel),
    defaultUnitCost: moneyToJson(part.defaultUnitCost),
    costCurrency: part.costCurrency,
    defaultSupplierId: part.defaultSupplierId,
    defaultSupplierName: part.defaultSupplierName,
    lowStock: part.isLowStock,
    isLowStock: part.isLowStock,
    active: part.isActive,
    createdAt: timestampToIso(part.createdAt),
  };
}

export function toStockMovementDto(movement: StockMovementDocument): StockMovementDto {
  return {
    id: movement.id,
    partId: movement.partId,
    partCode: movement.partCode,
    partName: movement.partName,
    quantityDelta: moneyToJson(movement.quantityDelta),
    movementType: movement.movementType,
    referenceType: movement.referenceType,
    referenceId: movement.referenceId,
    unitCost: moneyToJson(movement.unitCost),
    currency: movement.currency,
    reason: movement.reason,
    recordedByUserName: movement.recordedByUserName,
    createdAt: timestampToIso(movement.createdAt),
  };
}

export function toSupplierDto(supplier: SupplierDocument): SupplierDto {
  return {
    id: supplier.id,
    name: supplier.name,
    contactPerson: supplier.contactPerson,
    phone: supplier.phone,
    email: supplier.email,
    taxCui: supplier.taxCui,
    address: supplier.address,
    notes: supplier.notes,
    active: supplier.isActive,
    createdAt: timestampToIso(supplier.createdAt),
  };
}

function sortWithDirection<T extends { id: string }>(
  items: T[],
  direction: 'ASC' | 'DESC',
  compareBase: (left: T, right: T) => number,
): T[] {
  const factor = direction === 'ASC' ? 1 : -1;
  return [...items].sort((left, right) => {
    const primary = compareBase(left, right);
    if (primary !== 0) {
      return primary * factor;
    }
    return left.id.localeCompare(right.id) * factor;
  });
}

function sortParts(items: PartDocument[], page: PageRequest): PartDocument[] {
  return sortWithDirection(items, page.direction, (left, right) => {
    switch (page.sortField) {
      case 'partCode':
        return left.partCode.localeCompare(right.partCode);
      case 'name':
        return left.name.localeCompare(right.name);
      case 'category':
        return left.category.localeCompare(right.category);
      case 'currentQuantity':
        return compareBigInt(toMinorUnits(left.currentQuantity), toMinorUnits(right.currentQuantity));
      case 'minReorderLevel':
        return compareBigInt(toMinorUnits(left.minReorderLevel), toMinorUnits(right.minReorderLevel));
      case 'defaultUnitCost':
        return compareBigInt(toMinorUnits(left.defaultUnitCost), toMinorUnits(right.defaultUnitCost));
      case 'createdAt':
        return compareTimestamps(left.createdAt, right.createdAt);
      case 'isActive':
        return Number(left.isActive) - Number(right.isActive);
      default:
        return left.partCode.localeCompare(right.partCode);
    }
  });
}

function sortStockMovements(
  items: StockMovementDocument[],
  page: PageRequest,
): StockMovementDocument[] {
  return sortWithDirection(items, page.direction, (left, right) => {
    switch (page.sortField) {
      case 'createdAt':
        return compareTimestamps(left.createdAt, right.createdAt);
      case 'movementType':
        return left.movementType.localeCompare(right.movementType);
      case 'partCode':
        return left.partCode.localeCompare(right.partCode);
      case 'quantityDelta':
        return compareBigInt(toMinorUnits(left.quantityDelta), toMinorUnits(right.quantityDelta));
      case 'unitCost':
        return compareBigInt(toMinorUnits(left.unitCost), toMinorUnits(right.unitCost));
      default:
        return compareTimestamps(left.createdAt, right.createdAt);
    }
  });
}

function sortSuppliers(items: SupplierDocument[], page: PageRequest): SupplierDocument[] {
  return sortWithDirection(items, page.direction, (left, right) => {
    switch (page.sortField) {
      case 'name':
        return left.name.localeCompare(right.name);
      case 'createdAt':
        return compareTimestamps(left.createdAt, right.createdAt);
      case 'isActive':
        return Number(left.isActive) - Number(right.isActive);
      default:
        return left.name.localeCompare(right.name);
    }
  });
}

export class InventoryRepository {
  constructor(private readonly firestore: Firestore) {}

  appUserRef(userId: string) {
    return this.firestore.collection(APP_USERS).doc(userId);
  }

  partRef(partId: string) {
    return this.firestore.collection(PARTS).doc(partId);
  }

  stockMovementRef(movementId: string) {
    return this.firestore.collection(STOCK_MOVEMENTS).doc(movementId);
  }

  supplierRef(supplierId: string) {
    return this.firestore.collection(SUPPLIERS).doc(supplierId);
  }

  uniqueKeyRef(lockId: string) {
    return this.firestore.collection(UNIQUE_KEYS).doc(lockId);
  }

  readAuditUser(snapshot: FirebaseFirestore.DocumentSnapshot): { id: string; fullName: string } {
    if (!snapshot.exists) {
      throw new AuthError(401, 'UNAUTHORIZED', 'Authentication required');
    }
    const data = snapshot.data() ?? {};
    if (data.isActive === false) {
      throw new AuthError(401, 'UNAUTHORIZED', 'Authentication required');
    }
    return {
      id: snapshot.id,
      fullName: String(data.fullName ?? ''),
    };
  }

  readPart(snapshot: FirebaseFirestore.DocumentSnapshot): PartDocument {
    if (!snapshot.exists) {
      throw new NotFoundError('Part', snapshot.id);
    }
    return partFrom(snapshot.id, snapshot.data() ?? {});
  }

  readSupplier(snapshot: FirebaseFirestore.DocumentSnapshot): SupplierDocument {
    if (!snapshot.exists) {
      throw new NotFoundError('Supplier', snapshot.id);
    }
    return supplierFrom(snapshot.id, snapshot.data() ?? {});
  }

  async getPartById(partId: string): Promise<PartDocument> {
    const snapshot = await this.partRef(partId).get();
    return this.readPart(snapshot);
  }

  async getSupplierById(supplierId: string): Promise<SupplierDocument> {
    const snapshot = await this.supplierRef(supplierId).get();
    return this.readSupplier(snapshot);
  }

  async getManyPartsInTransaction(
    tx: Transaction,
    partIds: string[],
  ): Promise<FirebaseFirestore.DocumentSnapshot[]> {
    if (partIds.length === 0) return [];
    const refs = partIds.map((partId) => this.partRef(partId));
    return tx.getAll(...refs);
  }

  async getLowStockParts(): Promise<PartDocument[]> {
    const snapshot = await this.firestore
      .collection(PARTS)
      .where('isActive', '==', true)
      .where('isLowStock', '==', true)
      .orderBy('currentQuantityMinor', 'asc')
      .orderBy(FieldPath.documentId(), 'asc')
      .get();
    return snapshot.docs.map((doc) => partFrom(doc.id, doc.data()));
  }

  async getMovementsForPart(partId: string): Promise<StockMovementDocument[]> {
    const snapshot = await this.firestore
      .collection(STOCK_MOVEMENTS)
      .where('partId', '==', partId)
      .orderBy('createdAt', 'desc')
      .orderBy(FieldPath.documentId(), 'desc')
      .get();
    return snapshot.docs.map((doc) => stockMovementFrom(doc.id, doc.data()));
  }

  private async paginateIndexedQuery<T>(
    baseQuery: Query,
    page: PageRequest,
    mapper: (id: string, data: FirebaseFirestore.DocumentData) => T,
  ): Promise<{ items: T[]; totalElements: number }> {
    const countSnapshot = await baseQuery.count().get();
    const totalElements = countSnapshot.data().count;
    if (totalElements === 0 || page.page * page.size >= totalElements) {
      return { items: [], totalElements };
    }

    const direction = page.direction.toLowerCase() as 'asc' | 'desc';
    let query = baseQuery
      .orderBy(page.sortField, direction)
      .orderBy(FieldPath.documentId(), direction);

    for (let currentPage = 0; currentPage <= page.page; currentPage += 1) {
      const snapshot = await query.limit(page.size).get();
      if (currentPage === page.page) {
        return {
          items: snapshot.docs.map((doc) => mapper(doc.id, doc.data())),
          totalElements,
        };
      }
      const last = snapshot.docs[snapshot.docs.length - 1];
      if (!last) {
        return { items: [], totalElements };
      }
      query = query.startAfter(last);
    }

    return { items: [], totalElements };
  }

  private async fetchBoundedScan<T>(
    baseQuery: Query,
    resourceLabel: string,
    mapper: (id: string, data: FirebaseFirestore.DocumentData) => T,
  ): Promise<T[]> {
    const snapshot = await baseQuery.limit(MAX_SEARCH_SCAN_DOCS + 1).get();
    if (snapshot.size > MAX_SEARCH_SCAN_DOCS) {
      throw new UnprocessableEntityError(
        `${resourceLabel} query scanned more than ${MAX_SEARCH_SCAN_DOCS} candidate documents; refine filters or use indexed default sort without search`,
      );
    }
    return snapshot.docs.map((doc) => mapper(doc.id, doc.data()));
  }

  async pageParts(
    filters: PartSearchFilters,
    page: PageRequest,
  ): Promise<{ items: PartDocument[]; totalElements: number }> {
    let baseQuery: Query = this.firestore.collection(PARTS);
    if (filters.lowStockOnly) {
      baseQuery = baseQuery.where('isActive', '==', true).where('isLowStock', '==', true);
    } else if (!filters.includeArchived) {
      baseQuery = baseQuery.where('isActive', '==', true);
    }
    if (filters.category) {
      baseQuery = baseQuery.where('category', '==', filters.category);
    }

    if (filters.search === undefined && page.sortField === 'partCode') {
      return this.paginateIndexedQuery(baseQuery, page, partFrom);
    }

    const candidates = await this.fetchBoundedScan(baseQuery, 'Parts', partFrom);
    const term = filters.search;
    const matched = term === undefined
      ? candidates
      : candidates.filter((part) => (
        part.partCode.toLowerCase().includes(term) ||
        part.name.toLowerCase().includes(term) ||
        (part.description?.toLowerCase().includes(term) ?? false)
      ));

    const sorted = sortParts(matched, page);
    const offset = page.page * page.size;
    return {
      items: sorted.slice(offset, offset + page.size),
      totalElements: matched.length,
    };
  }

  async pageStockMovements(
    filters: StockMovementSearchFilters,
    page: PageRequest,
  ): Promise<{ items: StockMovementDocument[]; totalElements: number }> {
    let baseQuery: Query = this.firestore.collection(STOCK_MOVEMENTS);
    if (filters.partId) {
      baseQuery = baseQuery.where('partId', '==', filters.partId);
    }
    if (filters.type) {
      baseQuery = baseQuery.where('movementType', '==', filters.type);
    }
    if (filters.startDate) {
      baseQuery = baseQuery.where('createdAt', '>=', filters.startDate);
    }
    if (filters.endDate) {
      baseQuery = baseQuery.where('createdAt', '<=', filters.endDate);
    }

    if (page.sortField === 'createdAt') {
      return this.paginateIndexedQuery(baseQuery, page, stockMovementFrom);
    }

    const candidates = await this.fetchBoundedScan(baseQuery, 'Stock movements', stockMovementFrom);
    const sorted = sortStockMovements(candidates, page);
    const offset = page.page * page.size;
    return {
      items: sorted.slice(offset, offset + page.size),
      totalElements: sorted.length,
    };
  }

  async pageSuppliers(
    filters: SupplierSearchFilters,
    page: PageRequest,
  ): Promise<{ items: SupplierDocument[]; totalElements: number }> {
    let baseQuery: Query = this.firestore.collection(SUPPLIERS);
    if (!filters.includeArchived) {
      baseQuery = baseQuery.where('isActive', '==', true);
    }

    if (filters.search === undefined && page.sortField === 'name') {
      return this.paginateIndexedQuery(baseQuery, page, supplierFrom);
    }

    const candidates = await this.fetchBoundedScan(baseQuery, 'Suppliers', supplierFrom);
    const term = filters.search;
    const matched = term === undefined
      ? candidates
      : candidates.filter((supplier) => (
        supplier.name.toLowerCase().includes(term) ||
        (supplier.contactPerson?.toLowerCase().includes(term) ?? false) ||
        (supplier.phone?.toLowerCase().includes(term) ?? false) ||
        (supplier.email?.toLowerCase().includes(term) ?? false) ||
        (supplier.taxCui?.toLowerCase().includes(term) ?? false)
      ));

    const sorted = sortSuppliers(matched, page);
    const offset = page.page * page.size;
    return {
      items: sorted.slice(offset, offset + page.size),
      totalElements: matched.length,
    };
  }
}
