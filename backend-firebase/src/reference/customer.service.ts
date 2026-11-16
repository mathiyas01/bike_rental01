import { randomUUID } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { documentData, type CustomerDocument } from '../domain/types.js';
import {
  assertTransactionBudget,
  type PlannedWriteEntry,
} from '../inventory/inventory.validation.js';
import { ConflictError } from '../shared/errors.js';
import { toPage, type PageResponse } from '../shared/pagination.js';
import {
  CUSTOMERS,
  ReferenceRepository,
  UNIQUE_KEYS,
  customerPhoneLockId,
  toCustomerDto,
} from './reference.repository.js';
import type { CustomerDto } from './reference.types.js';
import {
  parseCreateCustomerInput,
  parseCustomerSearchQuery,
  parseUpdateCustomerInput,
} from './reference.validation.js';

export class CustomerService {
  private readonly repository: ReferenceRepository;

  constructor(private readonly firestore: Firestore) {
    this.repository = new ReferenceRepository(firestore);
  }

  async createCustomer(rawBody: unknown): Promise<CustomerDto> {
    const input = parseCreateCustomerInput(rawBody);
    const lockId = customerPhoneLockId(input.phone);

    return this.firestore.runTransaction(async (tx) => {
      const now = Timestamp.now();
      const lockRef = this.repository.uniqueKeyRef(lockId);
      const lockSnap = await tx.get(lockRef);

      if (lockSnap.exists) {
        throw new ConflictError(`Customer with phone number '${input.phone}' already exists`);
      }

      const customerId = randomUUID();
      const customerRef = this.repository.customerRef(customerId);
      const customerDoc: CustomerDocument = {
        id: customerId,
        fullName: input.fullName,
        phone: input.phone,
        email: input.email,
        cnpOrTaxId: input.cnpOrTaxId,
        dateOfBirth: input.dateOfBirth,
        livingCity: input.livingCity,
        drivingLicenceNumber: input.drivingLicenceNumber,
        licenceCategories: input.licenceCategories,
        licenceExpiryDate: input.licenceExpiryDate,
        address: input.address,
        gdprConsentDate: input.gdprConsentDate,
        notes: input.notes,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      };

      const lockDoc = {
        id: lockId,
        fieldType: 'customer_phone',
        normalizedValue: input.phone,
        entityId: customerId,
        createdAt: now,
      };

      assertTransactionBudget([
        { path: `${UNIQUE_KEYS}/${lockId}`, data: lockDoc },
        { path: `${CUSTOMERS}/${customerId}`, data: customerDoc as unknown as Record<string, unknown> },
      ]);

      tx.set(lockRef, documentData(lockDoc));
      tx.set(customerRef, documentData(customerDoc));

      return toCustomerDto(customerDoc);
    });
  }

  async listCustomers(query: Record<string, unknown>): Promise<PageResponse<CustomerDto>> {
    const { filters, page } = parseCustomerSearchQuery(query);
    const { items, totalElements } = await this.repository.pageCustomers(filters, page);
    return toPage(items.map(toCustomerDto), page, totalElements);
  }

  async getCustomerById(customerId: string): Promise<CustomerDto> {
    return toCustomerDto(await this.repository.getCustomerById(customerId));
  }

  async updateCustomer(customerId: string, rawBody: unknown): Promise<CustomerDto> {
    const input = parseUpdateCustomerInput(rawBody);
    const newLockId = customerPhoneLockId(input.phone);

    return this.firestore.runTransaction(async (tx) => {
      const now = Timestamp.now();
      const customerRef = this.repository.customerRef(customerId);
      const newLockRef = this.repository.uniqueKeyRef(newLockId);

      // Phase 1a: Customer document and target phone uniqueness lock.
      const [customerSnap, newLockSnap] = await Promise.all([
        tx.get(customerRef),
        tx.get(newLockRef),
      ]);

      const existing = this.repository.readCustomer(customerSnap);
      const phoneChanged = existing.phone !== input.phone;
      const oldLockId = phoneChanged && existing.phone
        ? customerPhoneLockId(existing.phone)
        : null;
      const oldLockRef = oldLockId ? this.repository.uniqueKeyRef(oldLockId) : null;

      // Phase 1b: Previous phone lock (if changed), completed before any write.
      const oldLockSnap = oldLockRef ? await tx.get(oldLockRef) : null;

      // Phase 2: Validation & uniqueness check.
      if (newLockSnap.exists && newLockSnap.data()?.entityId !== customerId) {
        throw new ConflictError(`Another customer already has phone number '${input.phone}'`);
      }

      // Preserve dateOfBirth, livingCity, gdprConsentDate, archived status, and existing licenceCategories if omitted.
      // Historical rentals and payments retain their point-in-time customerName/customerPhone snapshots.
      const updatedDoc: CustomerDocument = {
        id: existing.id,
        fullName: input.fullName,
        phone: input.phone,
        email: input.email,
        cnpOrTaxId: input.cnpOrTaxId,
        dateOfBirth: existing.dateOfBirth ?? null,
        livingCity: existing.livingCity ?? null,
        drivingLicenceNumber: input.drivingLicenceNumber,
        licenceCategories: input.licenceCategories ?? existing.licenceCategories ?? null,
        licenceExpiryDate: input.licenceExpiryDate,
        address: input.address,
        gdprConsentDate: existing.gdprConsentDate ?? null,
        notes: input.notes,
        isArchived: existing.isArchived,
        createdAt: existing.createdAt ?? Timestamp.fromMillis(0),
        updatedAt: now,
      };

      const plannedWrites: PlannedWriteEntry[] = [
        { path: `${CUSTOMERS}/${customerId}`, data: updatedDoc as unknown as Record<string, unknown> },
      ];

      const lockDoc = !newLockSnap.exists
        ? {
          id: newLockId,
          fieldType: 'customer_phone',
          normalizedValue: input.phone,
          entityId: customerId,
          createdAt: now,
        }
        : null;
      if (lockDoc) {
        plannedWrites.push({ path: `${UNIQUE_KEYS}/${newLockId}`, data: lockDoc });
      }

      const shouldDeleteOldLock = Boolean(
        phoneChanged &&
          oldLockSnap &&
          oldLockSnap.exists &&
          oldLockSnap.data()?.entityId === customerId,
      );
      if (shouldDeleteOldLock && oldLockId) {
        plannedWrites.push({ path: `${UNIQUE_KEYS}/${oldLockId}`, data: {} });
      }

      assertTransactionBudget(plannedWrites);

      // Phase 3: Atomic writes.
      if (lockDoc) {
        tx.set(newLockRef, documentData(lockDoc));
      }
      if (shouldDeleteOldLock && oldLockSnap) {
        tx.delete(oldLockSnap.ref);
      }
      tx.set(customerRef, documentData(updatedDoc));

      return toCustomerDto(updatedDoc);
    });
  }

  async archiveCustomer(customerId: string): Promise<CustomerDto> {
    return this.setCustomerArchived(customerId, true);
  }

  async unarchiveCustomer(customerId: string): Promise<CustomerDto> {
    return this.setCustomerArchived(customerId, false);
  }

  private async setCustomerArchived(customerId: string, isArchived: boolean): Promise<CustomerDto> {
    return this.firestore.runTransaction(async (tx) => {
      const now = Timestamp.now();
      const customerRef = this.repository.customerRef(customerId);
      const existing = this.repository.readCustomer(await tx.get(customerRef));

      // Preserve unique_keys customer_phone lock across archive just like SQL unique constraints.
      const updates: Pick<CustomerDocument, 'isArchived' | 'updatedAt'> = {
        isArchived,
        updatedAt: now,
      };
      assertTransactionBudget([
        { path: `${CUSTOMERS}/${customerId}`, data: updates as unknown as Record<string, unknown> },
      ]);
      tx.update(customerRef, updates);

      return toCustomerDto({
        ...existing,
        ...updates,
      });
    });
  }
}
