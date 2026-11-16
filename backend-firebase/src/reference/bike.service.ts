import { randomUUID } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  documentData,
  type BikeDocument,
  type BikeStatus,
} from '../domain/types.js';
import {
  assertTransactionBudget,
  type PlannedWriteEntry,
} from '../inventory/inventory.validation.js';
import { BusinessError, ConflictError } from '../shared/errors.js';
import { toPage, type PageResponse } from '../shared/pagination.js';
import {
  BIKES,
  RENTALS,
  ReferenceRepository,
  UNIQUE_KEYS,
  bikeRegLockId,
  bikeVinLockId,
  toBikeDto,
} from './reference.repository.js';
import type { BikeDto } from './reference.types.js';
import {
  parseBikeSearchQuery,
  parseCreateBikeInput,
  parseUpdateBikeInput,
  parseUpdateBikeStatusInput,
} from './reference.validation.js';

export class BikeService {
  private readonly repository: ReferenceRepository;

  constructor(private readonly firestore: Firestore) {
    this.repository = new ReferenceRepository(firestore);
  }

  async createBike(rawBody: unknown): Promise<BikeDto> {
    const input = parseCreateBikeInput(rawBody);
    const regLockId = bikeRegLockId(input.registrationNumber);
    const vinLockId = bikeVinLockId(input.vin);

    return this.firestore.runTransaction(async (tx) => {
      const now = Timestamp.now();
      const regLockRef = this.repository.uniqueKeyRef(regLockId);
      const vinLockRef = this.repository.uniqueKeyRef(vinLockId);

      const [regLockSnap, vinLockSnap] = await Promise.all([
        tx.get(regLockRef),
        tx.get(vinLockRef),
      ]);

      if (regLockSnap.exists) {
        throw new ConflictError(
          `Motorbike with registration number '${input.registrationNumber}' already exists`,
        );
      }
      if (vinLockSnap.exists) {
        throw new ConflictError(`Motorbike with VIN '${input.vin}' already exists`);
      }

      const bikeId = randomUUID();
      const bikeRef = this.repository.bikeRef(bikeId);
      const bikeDoc: BikeDocument = {
        id: bikeId,
        registrationNumber: input.registrationNumber,
        vin: input.vin,
        make: input.make,
        model: input.model,
        manufactureYear: input.manufactureYear,
        status: input.status,
        isArchived: false,
        currentOdometer: input.currentOdometer,
        itpExpiryDate: input.itpExpiryDate,
        rcaExpiryDate: input.rcaExpiryDate,
        cascoExpiryDate: input.cascoExpiryDate,
        serviceIntervalDays: input.serviceIntervalDays,
        nextServiceDueDate: null,
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
      };

      const regLockDoc = {
        id: regLockId,
        fieldType: 'bike_registration_number',
        normalizedValue: input.registrationNumber,
        entityId: bikeId,
        createdAt: now,
      };
      const vinLockDoc = {
        id: vinLockId,
        fieldType: 'bike_vin',
        normalizedValue: input.vin,
        entityId: bikeId,
        createdAt: now,
      };

      assertTransactionBudget([
        { path: `${UNIQUE_KEYS}/${regLockId}`, data: regLockDoc },
        { path: `${UNIQUE_KEYS}/${vinLockId}`, data: vinLockDoc },
        { path: `${BIKES}/${bikeId}`, data: bikeDoc as unknown as Record<string, unknown> },
      ]);

      tx.set(regLockRef, documentData(regLockDoc));
      tx.set(vinLockRef, documentData(vinLockDoc));
      tx.set(bikeRef, documentData(bikeDoc));

      return toBikeDto(bikeDoc);
    });
  }

  async listBikes(query: Record<string, unknown>): Promise<PageResponse<BikeDto>> {
    const { filters, page } = parseBikeSearchQuery(query);
    const { items, totalElements } = await this.repository.pageBikes(filters, page);
    return toPage(items.map(toBikeDto), page, totalElements);
  }

  async getBikeById(bikeId: string): Promise<BikeDto> {
    return toBikeDto(await this.repository.getBikeById(bikeId));
  }

  async updateBike(bikeId: string, rawBody: unknown): Promise<BikeDto> {
    const input = parseUpdateBikeInput(rawBody);
    const newRegLockId = bikeRegLockId(input.registrationNumber);
    const newVinLockId = bikeVinLockId(input.vin);

    return this.firestore.runTransaction(async (tx) => {
      const now = Timestamp.now();
      const bikeRef = this.repository.bikeRef(bikeId);
      const activeLockRef = this.repository.activeRentalLockRef(bikeId);
      const newRegLockRef = this.repository.uniqueKeyRef(newRegLockId);
      const newVinLockRef = this.repository.uniqueKeyRef(newVinLockId);

      // Phase 1a: Primary bike doc, active rental lock, and target uniqueness locks.
      const [bikeSnap, activeLockSnap, newRegLockSnap, newVinLockSnap] = await Promise.all([
        tx.get(bikeRef),
        tx.get(activeLockRef),
        tx.get(newRegLockRef),
        tx.get(newVinLockRef),
      ]);

      const existing = this.repository.readBike(bikeSnap);
      const regChanged = existing.registrationNumber !== input.registrationNumber;
      const vinChanged = existing.vin !== input.vin;
      const displayChanged =
        regChanged || existing.make !== input.make || existing.model !== input.model;
      const activeRentalId =
        activeLockSnap.exists && typeof activeLockSnap.data()?.rentalId === 'string'
          ? String(activeLockSnap.data()?.rentalId)
          : null;

      // Phase 1b: Old uniqueness locks (if changed) and the single active rental (if display changed).
      // All reads still complete strictly before any Firestore write.
      const oldRegLockId = regChanged && existing.registrationNumber
        ? bikeRegLockId(existing.registrationNumber)
        : null;
      const oldVinLockId = vinChanged && existing.vin
        ? bikeVinLockId(existing.vin)
        : null;
      const oldRegLockRef = oldRegLockId ? this.repository.uniqueKeyRef(oldRegLockId) : null;
      const oldVinLockRef = oldVinLockId ? this.repository.uniqueKeyRef(oldVinLockId) : null;
      const activeRentalRef = displayChanged && activeRentalId
        ? this.repository.rentalRef(activeRentalId)
        : null;

      const [oldRegLockSnap, oldVinLockSnap, activeRentalSnap] = await Promise.all([
        oldRegLockRef ? tx.get(oldRegLockRef) : Promise.resolve(null),
        oldVinLockRef ? tx.get(oldVinLockRef) : Promise.resolve(null),
        activeRentalRef ? tx.get(activeRentalRef) : Promise.resolve(null),
      ]);

      // Phase 2: Validation & domain invariants.
      if (newRegLockSnap.exists && newRegLockSnap.data()?.entityId !== bikeId) {
        throw new ConflictError(
          `Another motorbike with registration number '${input.registrationNumber}' already exists`,
        );
      }
      if (newVinLockSnap.exists && newVinLockSnap.data()?.entityId !== bikeId) {
        throw new ConflictError(
          `Another motorbike with VIN '${input.vin}' already exists`,
        );
      }

      const isCurrentlyRented = existing.status === 'RENTED' || activeLockSnap.exists;
      if (isCurrentlyRented && input.status !== null && input.status !== 'RENTED') {
        throw new BusinessError(
          'Cannot directly change status of a currently rented bike. Please close the active rental agreement first.',
        );
      }

      const nextStatus: BikeStatus = isCurrentlyRented
        ? 'RENTED'
        : (input.status ?? existing.status);
      const nextServiceIntervalDays =
        input.serviceIntervalDays ?? existing.serviceIntervalDays ?? 30;

      const updatedDoc: BikeDocument = {
        id: existing.id,
        registrationNumber: input.registrationNumber,
        vin: input.vin,
        make: input.make,
        model: input.model,
        manufactureYear: input.manufactureYear,
        status: nextStatus,
        isArchived: existing.isArchived,
        currentOdometer: input.currentOdometer,
        itpExpiryDate: input.itpExpiryDate,
        rcaExpiryDate: input.rcaExpiryDate,
        cascoExpiryDate: input.cascoExpiryDate,
        serviceIntervalDays: nextServiceIntervalDays,
        nextServiceDueDate: existing.nextServiceDueDate ?? null,
        notes: input.notes,
        createdAt: existing.createdAt ?? Timestamp.fromMillis(0),
        updatedAt: now,
      };

      const plannedWrites: PlannedWriteEntry[] = [
        { path: `${BIKES}/${bikeId}`, data: updatedDoc as unknown as Record<string, unknown> },
      ];

      const regLockDoc = !newRegLockSnap.exists
        ? {
          id: newRegLockId,
          fieldType: 'bike_registration_number',
          normalizedValue: input.registrationNumber,
          entityId: bikeId,
          createdAt: now,
        }
        : null;
      if (regLockDoc) {
        plannedWrites.push({ path: `${UNIQUE_KEYS}/${newRegLockId}`, data: regLockDoc });
      }

      const shouldDeleteOldRegLock = Boolean(
        regChanged &&
          oldRegLockSnap &&
          oldRegLockSnap.exists &&
          oldRegLockSnap.data()?.entityId === bikeId,
      );
      if (shouldDeleteOldRegLock && oldRegLockId) {
        plannedWrites.push({ path: `${UNIQUE_KEYS}/${oldRegLockId}`, data: {} });
      }

      const vinLockDoc = !newVinLockSnap.exists
        ? {
          id: newVinLockId,
          fieldType: 'bike_vin',
          normalizedValue: input.vin,
          entityId: bikeId,
          createdAt: now,
        }
        : null;
      if (vinLockDoc) {
        plannedWrites.push({ path: `${UNIQUE_KEYS}/${newVinLockId}`, data: vinLockDoc });
      }

      const shouldDeleteOldVinLock = Boolean(
        vinChanged &&
          oldVinLockSnap &&
          oldVinLockSnap.exists &&
          oldVinLockSnap.data()?.entityId === bikeId,
      );
      if (shouldDeleteOldVinLock && oldVinLockId) {
        plannedWrites.push({ path: `${UNIQUE_KEYS}/${oldVinLockId}`, data: {} });
      }

      const activeRentalUpdates =
        displayChanged &&
        activeRentalId &&
        activeRentalSnap &&
        activeRentalSnap.exists &&
        activeRentalSnap.data()?.status === 'ACTIVE'
          ? {
            bikeRegistrationNumber: updatedDoc.registrationNumber,
            bikeMakeModel: `${updatedDoc.make} ${updatedDoc.model}`,
            updatedAt: now,
          }
          : null;
      if (activeRentalUpdates && activeRentalId) {
        plannedWrites.push({ path: `${RENTALS}/${activeRentalId}`, data: activeRentalUpdates });
      }

      assertTransactionBudget(plannedWrites);

      // Phase 3: Atomic writes.
      if (regLockDoc) {
        tx.set(newRegLockRef, documentData(regLockDoc));
      }
      if (shouldDeleteOldRegLock && oldRegLockSnap) {
        tx.delete(oldRegLockSnap.ref);
      }
      if (vinLockDoc) {
        tx.set(newVinLockRef, documentData(vinLockDoc));
      }
      if (shouldDeleteOldVinLock && oldVinLockSnap) {
        tx.delete(oldVinLockSnap.ref);
      }
      tx.set(bikeRef, documentData(updatedDoc));
      if (activeRentalUpdates && activeRentalSnap) {
        tx.update(activeRentalSnap.ref, activeRentalUpdates);
      }

      return toBikeDto(updatedDoc);
    });
  }

  async updateBikeStatus(bikeId: string, rawBody: unknown): Promise<BikeDto> {
    const input = parseUpdateBikeStatusInput(rawBody);

    return this.firestore.runTransaction(async (tx) => {
      const now = Timestamp.now();
      const bikeRef = this.repository.bikeRef(bikeId);
      const activeLockRef = this.repository.activeRentalLockRef(bikeId);

      const [bikeSnap, activeLockSnap] = await Promise.all([
        tx.get(bikeRef),
        tx.get(activeLockRef),
      ]);

      const existing = this.repository.readBike(bikeSnap);
      const isCurrentlyRented = existing.status === 'RENTED' || activeLockSnap.exists;

      if (isCurrentlyRented && input.status !== 'RENTED') {
        throw new BusinessError(
          'Cannot directly change status of a currently rented bike. Please close the active rental agreement first.',
        );
      }

      const updates = {
        status: input.status,
        updatedAt: now,
      };
      assertTransactionBudget([
        { path: `${BIKES}/${bikeId}`, data: updates },
      ]);
      tx.update(bikeRef, updates);

      return toBikeDto({
        ...existing,
        ...updates,
      });
    });
  }

  async archiveBike(bikeId: string): Promise<BikeDto> {
    return this.firestore.runTransaction(async (tx) => {
      const now = Timestamp.now();
      const bikeRef = this.repository.bikeRef(bikeId);
      const activeLockRef = this.repository.activeRentalLockRef(bikeId);

      const [bikeSnap, activeLockSnap] = await Promise.all([
        tx.get(bikeRef),
        tx.get(activeLockRef),
      ]);

      const existing = this.repository.readBike(bikeSnap);
      if (existing.status === 'RENTED' || activeLockSnap.exists) {
        throw new BusinessError('Cannot archive a motorbike with an active rental');
      }

      // Preserve unique_keys registration/VIN locks across archive just like SQL unique constraints.
      const updates: Pick<BikeDocument, 'isArchived' | 'status' | 'updatedAt'> = {
        isArchived: true,
        status: 'INACTIVE',
        updatedAt: now,
      };
      assertTransactionBudget([
        { path: `${BIKES}/${bikeId}`, data: updates as unknown as Record<string, unknown> },
      ]);
      tx.update(bikeRef, updates);

      return toBikeDto({
        ...existing,
        ...updates,
      });
    });
  }

  async unarchiveBike(bikeId: string): Promise<BikeDto> {
    return this.firestore.runTransaction(async (tx) => {
      const now = Timestamp.now();
      const bikeRef = this.repository.bikeRef(bikeId);
      const activeLockRef = this.repository.activeRentalLockRef(bikeId);

      const [bikeSnap, activeLockSnap] = await Promise.all([
        tx.get(bikeRef),
        tx.get(activeLockRef),
      ]);

      const existing = this.repository.readBike(bikeSnap);
      if (activeLockSnap.exists) {
        throw new ConflictError('Cannot unarchive a motorbike with an active rental lock');
      }

      const updates: Pick<BikeDocument, 'isArchived' | 'status' | 'updatedAt'> = {
        isArchived: false,
        status: 'AVAILABLE',
        updatedAt: now,
      };
      assertTransactionBudget([
        { path: `${BIKES}/${bikeId}`, data: updates as unknown as Record<string, unknown> },
      ]);
      tx.update(bikeRef, updates);

      return toBikeDto({
        ...existing,
        ...updates,
      });
    });
  }
}
