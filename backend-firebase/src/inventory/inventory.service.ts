import { randomUUID } from 'node:crypto';
import { Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';
import type { AuthenticatedUser } from '../auth/types.js';
import {
  documentData,
  type Currency,
  type PartDocument,
  type StockMovementDocument,
  type SupplierDocument,
} from '../domain/types.js';
import { BusinessError, ConflictError } from '../shared/errors.js';
import { fromMinorUnits, toMinorUnits } from '../shared/money.js';
import { toPage, type PageResponse } from '../shared/pagination.js';
import {
  APP_USERS,
  InventoryRepository,
  PARTS,
  partCodeLockId,
  STOCK_MOVEMENTS,
  SUPPLIERS,
  supplierNameLockId,
  toPartDto,
  toStockMovementDto,
  toSupplierDto,
  UNIQUE_KEYS,
} from './inventory.repository.js';
import {
  MAX_QUANTITY_MINOR,
  type PartDto,
  type PreparedServicePartMovement,
  type StockMovementDto,
  type SupplierDto,
} from './inventory.types.js';
import {
  assertTransactionBudget,
  computeSignedDeltaMinor,
  isPartLowStock,
  parseCreatePartInput,
  parseCreateSupplierInput,
  parsePartSearchQuery,
  parseRecordStockMovementInput,
  parseServicePartsUsed,
  parseStockMovementSearchQuery,
  parseSupplierSearchQuery,
  parseUpdatePartInput,
  type PlannedWriteEntry,
} from './inventory.validation.js';

export interface ServicePartDeductionPlan {
  movements: PreparedServicePartMovement[];
  applyWrites: () => void;
  plannedWrites: PlannedWriteEntry[];
}

export class InventoryService {
  private readonly repository: InventoryRepository;

  constructor(private readonly firestore: Firestore) {
    this.repository = new InventoryRepository(firestore);
  }

  async createPart(rawBody: unknown, authUser: AuthenticatedUser): Promise<PartDto> {
    const input = parseCreatePartInput(rawBody);
    const lockId = partCodeLockId(input.partCode);

    return this.firestore.runTransaction(async (tx) => {
      const now = Timestamp.now();
      const lockRef = this.repository.uniqueKeyRef(lockId);
      const userRef = this.repository.appUserRef(authUser.id);
      const supplierRef = input.defaultSupplierId
        ? this.repository.supplierRef(input.defaultSupplierId)
        : null;

      const [lockSnap, userSnap, supplierSnap] = await Promise.all([
        tx.get(lockRef),
        tx.get(userRef),
        supplierRef ? tx.get(supplierRef) : Promise.resolve(null),
      ]);

      const auditUser = this.repository.readAuditUser(userSnap);
      if (lockSnap.exists) {
        throw new ConflictError(`Part with code '${input.partCode}' already exists`);
      }

      let defaultSupplierName: string | null = null;
      if (supplierSnap !== null) {
        const supplier = this.repository.readSupplier(supplierSnap);
        defaultSupplierName = supplier.name;
      }

      const partId = randomUUID();
      const partRef = this.repository.partRef(partId);
      const lowStock = isPartLowStock(input.initialQuantityMinor, input.minReorderLevelMinor);

      const partDoc: PartDocument = {
        id: partId,
        partCode: input.partCode,
        name: input.name,
        category: input.category,
        description: input.description,
        unitOfMeasure: input.unitOfMeasure,
        currentQuantity: input.initialQuantity,
        currentQuantityMinor: Number(input.initialQuantityMinor),
        minReorderLevel: input.minReorderLevel,
        defaultUnitCost: input.defaultUnitCost,
        costCurrency: input.costCurrency,
        defaultSupplierId: input.defaultSupplierId,
        defaultSupplierName,
        isLowStock: lowStock,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };

      const lockDoc = {
        id: lockId,
        fieldType: 'part_code',
        normalizedValue: input.partCode,
        entityId: partId,
        createdAt: now,
      };

      const plannedWrites: PlannedWriteEntry[] = [
        { path: `${UNIQUE_KEYS}/${lockId}`, data: lockDoc },
        { path: `${PARTS}/${partId}`, data: partDoc as unknown as Record<string, unknown> },
      ];

      let movementRef: FirebaseFirestore.DocumentReference | null = null;
      let movementDoc: StockMovementDocument | null = null;

      if (input.initialQuantityMinor > 0n) {
        const movementId = randomUUID();
        movementRef = this.repository.stockMovementRef(movementId);
        movementDoc = {
          id: movementId,
          partId,
          partCode: partDoc.partCode,
          partName: partDoc.name,
          quantityDelta: input.initialQuantity,
          movementType: 'STOCK_IN',
          referenceType: 'INITIAL_SETUP',
          referenceId: null,
          unitCost: partDoc.defaultUnitCost,
          currency: partDoc.costCurrency,
          reason: 'Initial stock on part creation',
          recordedByUserId: auditUser.id,
          recordedByUserName: auditUser.fullName,
          createdAt: now,
        };
        plannedWrites.push({
          path: `${STOCK_MOVEMENTS}/${movementId}`,
          data: movementDoc as unknown as Record<string, unknown>,
        });
      }

      assertTransactionBudget(plannedWrites);

      tx.set(lockRef, documentData(lockDoc));
      tx.set(partRef, documentData(partDoc));
      if (movementRef && movementDoc) {
        tx.set(movementRef, documentData(movementDoc));
      }

      return toPartDto(partDoc);
    });
  }

  async updatePart(partId: string, rawBody: unknown): Promise<PartDto> {
    const input = parseUpdatePartInput(rawBody);

    return this.firestore.runTransaction(async (tx) => {
      const now = Timestamp.now();
      const partRef = this.repository.partRef(partId);
      const supplierRef = input.defaultSupplierId
        ? this.repository.supplierRef(input.defaultSupplierId)
        : null;

      const [partSnap, supplierSnap] = await Promise.all([
        tx.get(partRef),
        supplierRef ? tx.get(supplierRef) : Promise.resolve(null),
      ]);

      const existing = this.repository.readPart(partSnap);
      let defaultSupplierName: string | null = null;
      if (supplierSnap !== null) {
        defaultSupplierName = this.repository.readSupplier(supplierSnap).name;
      }

      const lowStock = isPartLowStock(
        toMinorUnits(existing.currentQuantity),
        input.minReorderLevelMinor,
      );

      const updates: Partial<PartDocument> = {
        name: input.name,
        category: input.category,
        description: input.description,
        unitOfMeasure: input.unitOfMeasure,
        minReorderLevel: input.minReorderLevel,
        defaultUnitCost: input.defaultUnitCost,
        defaultSupplierId: input.defaultSupplierId,
        defaultSupplierName,
        isLowStock: lowStock,
        updatedAt: now,
      };

      assertTransactionBudget([
        { path: `${PARTS}/${partId}`, data: updates as unknown as Record<string, unknown> },
      ]);

      tx.update(partRef, updates);

      return toPartDto({
        ...existing,
        ...updates,
      });
    });
  }

  async getPartById(partId: string): Promise<PartDto> {
    return toPartDto(await this.repository.getPartById(partId));
  }

  async listParts(query: Record<string, unknown>): Promise<PageResponse<PartDto>> {
    const { filters, page } = parsePartSearchQuery(query);
    const { items, totalElements } = await this.repository.pageParts(filters, page);
    return toPage(items.map(toPartDto), page, totalElements);
  }

  async getLowStockParts(): Promise<PartDto[]> {
    const parts = await this.repository.getLowStockParts();
    return parts.map(toPartDto);
  }

  async archivePart(partId: string): Promise<PartDto> {
    return this.setPartActive(partId, false);
  }

  async unarchivePart(partId: string): Promise<PartDto> {
    return this.setPartActive(partId, true);
  }

  private async setPartActive(partId: string, isActive: boolean): Promise<PartDto> {
    return this.firestore.runTransaction(async (tx) => {
      const now = Timestamp.now();
      const partRef = this.repository.partRef(partId);
      const existing = this.repository.readPart(await tx.get(partRef));
      const updates: Partial<PartDocument> = {
        isActive,
        updatedAt: now,
      };
      assertTransactionBudget([
        { path: `${PARTS}/${partId}`, data: updates as unknown as Record<string, unknown> },
      ]);
      tx.update(partRef, updates);
      return toPartDto({
        ...existing,
        ...updates,
      });
    });
  }

  async recordStockMovement(rawBody: unknown, authUser: AuthenticatedUser): Promise<StockMovementDto> {
    const input = parseRecordStockMovementInput(rawBody);

    return this.firestore.runTransaction(async (tx) => {
      const now = Timestamp.now();
      const partRef = this.repository.partRef(input.partId);
      const userRef = this.repository.appUserRef(authUser.id);

      const [partSnap, userSnap] = await Promise.all([
        tx.get(partRef),
        tx.get(userRef),
      ]);

      const auditUser = this.repository.readAuditUser(userSnap);
      const part = this.repository.readPart(partSnap);

      if (!part.isActive) {
        throw new BusinessError(`Cannot record stock movement for archived part: ${part.partCode}`);
      }

      const deltaMinor = computeSignedDeltaMinor(input.movementType, input.quantityMinor);
      const currentMinor = toMinorUnits(part.currentQuantity);
      const newQuantityMinor = currentMinor + deltaMinor;

      if (newQuantityMinor < 0n) {
        throw new BusinessError(
          `Insufficient stock for part '${part.partCode}'. Current: ${part.currentQuantity}, Requested delta: ${fromMinorUnits(deltaMinor)}`,
        );
      }
      if (newQuantityMinor > MAX_QUANTITY_MINOR) {
        throw new BusinessError(
          `Resulting stock quantity for part '${part.partCode}' exceeds maximum allowed precision`,
        );
      }

      const appliedUnitCost = input.unitCost ?? part.defaultUnitCost;
      const appliedCurrency: Currency = input.currency ?? part.costCurrency;
      const newQuantity = fromMinorUnits(newQuantityMinor);
      const newLowStock = isPartLowStock(newQuantityMinor, toMinorUnits(part.minReorderLevel));

      const movementId = randomUUID();
      const movementRef = this.repository.stockMovementRef(movementId);
      const movementDoc: StockMovementDocument = {
        id: movementId,
        partId: part.id,
        partCode: part.partCode,
        partName: part.name,
        quantityDelta: fromMinorUnits(deltaMinor),
        movementType: input.movementType,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        unitCost: appliedUnitCost,
        currency: appliedCurrency,
        reason: input.reason,
        recordedByUserId: auditUser.id,
        recordedByUserName: auditUser.fullName,
        createdAt: now,
      };

      const partUpdates: Partial<PartDocument> = {
        currentQuantity: newQuantity,
        currentQuantityMinor: Number(newQuantityMinor),
        isLowStock: newLowStock,
        updatedAt: now,
      };

      assertTransactionBudget([
        { path: `${PARTS}/${part.id}`, data: partUpdates as unknown as Record<string, unknown> },
        { path: `${STOCK_MOVEMENTS}/${movementId}`, data: movementDoc as unknown as Record<string, unknown> },
      ]);

      tx.update(partRef, partUpdates);
      tx.set(movementRef, documentData(movementDoc));

      return toStockMovementDto(movementDoc);
    });
  }

  async getMovementsForPart(partId: string): Promise<StockMovementDto[]> {
    const movements = await this.repository.getMovementsForPart(partId);
    return movements.map(toStockMovementDto);
  }

  async searchStockMovements(
    query: Record<string, unknown>,
  ): Promise<PageResponse<StockMovementDto>> {
    const { filters, page } = parseStockMovementSearchQuery(query);
    const { items, totalElements } = await this.repository.pageStockMovements(filters, page);
    return toPage(items.map(toStockMovementDto), page, totalElements);
  }

  async createSupplier(rawBody: unknown): Promise<SupplierDto> {
    const input = parseCreateSupplierInput(rawBody);
    const lockId = supplierNameLockId(input.nameNormalized);

    return this.firestore.runTransaction(async (tx) => {
      const now = Timestamp.now();
      const lockRef = this.repository.uniqueKeyRef(lockId);
      const lockSnap = await tx.get(lockRef);

      if (lockSnap.exists) {
        throw new ConflictError(`Supplier with name '${input.name}' already exists`);
      }

      const supplierId = randomUUID();
      const supplierRef = this.repository.supplierRef(supplierId);
      const supplierDoc: SupplierDocument = {
        id: supplierId,
        name: input.name,
        nameNormalized: input.nameNormalized,
        contactPerson: input.contactPerson,
        phone: input.phone,
        email: input.email,
        taxCui: input.taxCui,
        address: input.address,
        notes: input.notes,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };

      const lockDoc = {
        id: lockId,
        fieldType: 'supplier_name',
        normalizedValue: input.nameNormalized,
        entityId: supplierId,
        createdAt: now,
      };

      assertTransactionBudget([
        { path: `${UNIQUE_KEYS}/${lockId}`, data: lockDoc },
        { path: `${SUPPLIERS}/${supplierId}`, data: supplierDoc as unknown as Record<string, unknown> },
      ]);

      tx.set(lockRef, documentData(lockDoc));
      tx.set(supplierRef, documentData(supplierDoc));

      return toSupplierDto(supplierDoc);
    });
  }

  async listSuppliers(query: Record<string, unknown>): Promise<PageResponse<SupplierDto>> {
    const { filters, page } = parseSupplierSearchQuery(query);
    const { items, totalElements } = await this.repository.pageSuppliers(filters, page);
    return toPage(items.map(toSupplierDto), page, totalElements);
  }

  async getSupplierById(supplierId: string): Promise<SupplierDto> {
    return toSupplierDto(await this.repository.getSupplierById(supplierId));
  }

  async archiveSupplier(supplierId: string): Promise<SupplierDto> {
    return this.setSupplierActive(supplierId, false);
  }

  async unarchiveSupplier(supplierId: string): Promise<SupplierDto> {
    return this.setSupplierActive(supplierId, true);
  }

  private async setSupplierActive(supplierId: string, isActive: boolean): Promise<SupplierDto> {
    return this.firestore.runTransaction(async (tx) => {
      const now = Timestamp.now();
      const supplierRef = this.repository.supplierRef(supplierId);
      const existing = this.repository.readSupplier(await tx.get(supplierRef));
      const updates: Partial<SupplierDocument> = {
        isActive,
        updatedAt: now,
      };
      assertTransactionBudget([
        { path: `${SUPPLIERS}/${supplierId}`, data: updates as unknown as Record<string, unknown> },
      ]);
      tx.update(supplierRef, updates);
      return toSupplierDto({
        ...existing,
        ...updates,
      });
    });
  }

  /**
   * Reusable read-before-write transaction helper for Stage C6 servicing spare-part deductions.
   * Performs all Firestore reads up front (aggregated per unique partId) and returns a closure
   * to apply atomic part updates + SERVICE_USAGE stock movement ledger writes alongside servicing writes.
   */
  async prepareServicePartDeductionsInTx(
    tx: Transaction,
    options: {
      rawPartsUsed: unknown;
      serviceRecordId: string;
      bikeRegistrationNumber: string;
      recordedByUserId: string;
      recordedByUserName: string;
      now: Timestamp;
    },
  ): Promise<ServicePartDeductionPlan> {
    const items = parseServicePartsUsed(options.rawPartsUsed);
    if (items.length === 0) {
      return {
        movements: [],
        plannedWrites: [],
        applyWrites: () => {},
      };
    }

    const totalRequestedMinorByPartId = new Map<string, bigint>();
    for (const item of items) {
      totalRequestedMinorByPartId.set(
        item.partId,
        (totalRequestedMinorByPartId.get(item.partId) ?? 0n) + item.quantityMinor,
      );
    }

    const uniquePartIds = [...totalRequestedMinorByPartId.keys()];
    const snapshots = await this.repository.getManyPartsInTransaction(tx, uniquePartIds);
    const partsById = new Map<string, PartDocument>();

    for (const snapshot of snapshots) {
      const part = this.repository.readPart(snapshot);
      if (!part.isActive) {
        throw new BusinessError(`Cannot record stock movement for archived part: ${part.partCode}`);
      }
      const requestedTotalMinor = totalRequestedMinorByPartId.get(part.id) ?? 0n;
      const currentMinor = toMinorUnits(part.currentQuantity);
      if (currentMinor < requestedTotalMinor) {
        throw new BusinessError(
          `Insufficient stock for part '${part.partCode}'. Current: ${part.currentQuantity}, Requested: ${fromMinorUnits(requestedTotalMinor)}`,
        );
      }
      partsById.set(part.id, part);
    }

    const plannedWrites: PlannedWriteEntry[] = [];
    const partWriteOps: Array<{ ref: FirebaseFirestore.DocumentReference; updates: Partial<PartDocument> }> = [];
    const movementWriteOps: Array<{ ref: FirebaseFirestore.DocumentReference; doc: StockMovementDocument }> = [];
    const preparedMovements: PreparedServicePartMovement[] = [];

    for (const partId of uniquePartIds) {
      const part = partsById.get(partId)!;
      const newQuantityMinor =
        toMinorUnits(part.currentQuantity) - (totalRequestedMinorByPartId.get(partId) ?? 0n);
      const updates: Partial<PartDocument> = {
        currentQuantity: fromMinorUnits(newQuantityMinor),
        currentQuantityMinor: Number(newQuantityMinor),
        isLowStock: isPartLowStock(newQuantityMinor, toMinorUnits(part.minReorderLevel)),
        updatedAt: options.now,
      };
      partWriteOps.push({ ref: this.repository.partRef(partId), updates });
      plannedWrites.push({
        path: `${PARTS}/${partId}`,
        data: updates as unknown as Record<string, unknown>,
      });
    }

    for (const item of items) {
      const part = partsById.get(item.partId)!;
      const movementId = randomUUID();
      const unitCost = item.unitCost ?? part.defaultUnitCost;
      const currency: Currency = item.currency ?? part.costCurrency;
      const deltaMinor = -item.quantityMinor;
      const quantityDelta = fromMinorUnits(deltaMinor);
      const movementDoc: StockMovementDocument = {
        id: movementId,
        partId: part.id,
        partCode: part.partCode,
        partName: part.name,
        quantityDelta,
        movementType: 'SERVICE_USAGE',
        referenceType: 'SERVICE_RECORD',
        referenceId: options.serviceRecordId,
        unitCost,
        currency,
        reason: `Used in service on motorbike ${options.bikeRegistrationNumber}`,
        recordedByUserId: options.recordedByUserId,
        recordedByUserName: options.recordedByUserName,
        createdAt: options.now,
      };
      movementWriteOps.push({ ref: this.repository.stockMovementRef(movementId), doc: movementDoc });
      plannedWrites.push({
        path: `${STOCK_MOVEMENTS}/${movementId}`,
        data: movementDoc as unknown as Record<string, unknown>,
      });
      preparedMovements.push({
        partId: part.id,
        partCode: part.partCode,
        partName: part.name,
        quantity: item.quantity,
        unitCost,
        currency,
        movementId,
        quantityDelta,
      });
    }

    assertTransactionBudget(plannedWrites);

    return {
      movements: preparedMovements,
      plannedWrites,
      applyWrites: () => {
        for (const op of partWriteOps) {
          tx.update(op.ref, op.updates);
        }
        for (const op of movementWriteOps) {
          tx.set(op.ref, documentData(op.doc));
        }
      },
    };
  }
}

export { APP_USERS };
