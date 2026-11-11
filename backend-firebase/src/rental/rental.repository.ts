import { randomUUID } from 'node:crypto';
import {
  FieldValue,
  FieldPath,
  Timestamp,
  type Firestore,
  type Query,
} from 'firebase-admin/firestore';
import { addDays } from '../shared/dates.js';
import { BusinessError, ConflictError, NotFoundError } from '../shared/errors.js';
import { normalizeAllocation } from '../shared/money.js';
import type { PageRequest } from '../shared/pagination.js';
import { emailLockHash } from '../auth/jwt.service.js';
import type {
  BikeDocument,
  ChargeDocument,
  CustomerDocument,
  RentalDocument,
} from '../domain/types.js';

const bikes = 'bikes';
const customers = 'customers';
const rentals = 'rentals';
const charges = 'rental_charges';
const activeLocks = 'active_rental_locks';
const cursors = 'rental_charge_cursors';
const allocations = 'payment_allocations';

function bikeFrom(id: string, data: FirebaseFirestore.DocumentData): BikeDocument {
  return {
    id,
    registrationNumber: String(data.registrationNumber),
    vin: String(data.vin ?? ''),
    make: String(data.make ?? ''),
    model: String(data.model ?? ''),
    status: data.status as BikeDocument['status'],
    isArchived: data.isArchived === true || data.archived === true,
  };
}

function customerFrom(id: string, data: FirebaseFirestore.DocumentData): CustomerDocument {
  return {
    id,
    fullName: String(data.fullName),
    phone: String(data.phone ?? ''),
    isArchived: data.isArchived === true || data.archived === true,
  };
}

function rentalFrom(id: string, data: FirebaseFirestore.DocumentData): RentalDocument {
  return {
    id,
    customerId: String(data.customerId),
    customerName: String(data.customerName),
    customerPhone: String(data.customerPhone ?? ''),
    bikeId: String(data.bikeId),
    bikeRegistrationNumber: String(data.bikeRegistrationNumber),
    bikeMakeModel: String(data.bikeMakeModel),
    startDate: String(data.startDate),
    plannedEndDate: data.plannedEndDate ?? null,
    actualClosedDate: data.actualClosedDate ?? null,
    weeklyRate: String(data.weeklyRate),
    currency: data.currency,
    depositAmount: String(data.depositAmount),
    depositCurrency: data.depositCurrency,
    paymentFrequency: 'WEEKLY',
    scheduleAnchorDay: String(data.scheduleAnchorDay ?? 'START_DAY'),
    status: data.status,
    termsAndNotes: data.termsAndNotes ?? null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

function chargeFrom(id: string, data: FirebaseFirestore.DocumentData): ChargeDocument {
  return {
    id,
    rentalId: String(data.rentalId),
    customerId: String(data.customerId),
    bikeId: String(data.bikeId),
    chargeSequence: Number(data.chargeSequence),
    periodStartDate: String(data.periodStartDate),
    periodEndDate: String(data.periodEndDate),
    dueDate: String(data.dueDate),
    amount: String(data.amount),
    currency: data.currency,
    status: data.status,
    paidAmount: String(data.paidAmount ?? '0.00'),
    remainingAmount: String(data.remainingAmount ?? data.amount),
    notes: String(data.notes ?? ''),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export class RentalRepository {
  constructor(private readonly firestore: Firestore) {}

  bikeReference(id: string) {
    return this.firestore.collection(bikes).doc(id);
  }

  customerReference(id: string) {
    return this.firestore.collection(customers).doc(id);
  }

  rentalReference(id: string) {
    return this.firestore.collection(rentals).doc(id);
  }

  chargeReference(rentalId: string, sequence: number) {
    return this.firestore.collection(charges).doc(`${rentalId}_${sequence}`);
  }

  activeLockReference(bikeId: string) {
    return this.firestore.collection(activeLocks).doc(bikeId);
  }

  cursorReference(rentalId: string) {
    return this.firestore.collection(cursors).doc(rentalId);
  }

  readBike(snapshot: FirebaseFirestore.DocumentSnapshot): BikeDocument {
    if (!snapshot.exists) throw new NotFoundError('Motorbike', snapshot.id);
    return bikeFrom(snapshot.id, snapshot.data() ?? {});
  }

  readCustomer(snapshot: FirebaseFirestore.DocumentSnapshot): CustomerDocument {
    if (!snapshot.exists) throw new NotFoundError('Customer', snapshot.id);
    return customerFrom(snapshot.id, snapshot.data() ?? {});
  }

  readRental(snapshot: FirebaseFirestore.DocumentSnapshot): RentalDocument {
    if (!snapshot.exists) throw new NotFoundError('Rental agreement', snapshot.id);
    return rentalFrom(snapshot.id, snapshot.data() ?? {});
  }

  readCharge(snapshot: FirebaseFirestore.DocumentSnapshot): ChargeDocument {
    if (!snapshot.exists) throw new NotFoundError('Rental charge', snapshot.id);
    return chargeFrom(snapshot.id, snapshot.data() ?? {});
  }

  async pageRentals(
    filters: { status?: string; customerId?: string; bikeId?: string },
    page: PageRequest,
  ): Promise<{ items: RentalDocument[]; totalElements: number }> {
    let query: Query = this.firestore.collection(rentals);
    if (filters.status) query = query.where('status', '==', filters.status);
    if (filters.customerId) query = query.where('customerId', '==', filters.customerId);
    if (filters.bikeId) query = query.where('bikeId', '==', filters.bikeId);
    return this.pageQuery(query, page, (document) => rentalFrom(document.id, document.data()));
  }

  async pageCharges(
    filters: { status?: string; currency?: string; customerId?: string; rentalId?: string },
    page: PageRequest,
  ): Promise<{ items: ChargeDocument[]; totalElements: number }> {
    let query: Query = this.firestore.collection(charges);
    if (filters.status) query = query.where('status', '==', filters.status);
    if (filters.currency) query = query.where('currency', '==', filters.currency);
    if (filters.customerId) query = query.where('customerId', '==', filters.customerId);
    if (filters.rentalId) query = query.where('rentalId', '==', filters.rentalId);
    return this.pageQuery(query, page, (document) => chargeFrom(document.id, document.data()));
  }

  async dueCharges(asOfDate: string): Promise<ChargeDocument[]> {
    const snapshot = await this.firestore.collection(charges)
      .where('status', 'in', ['UNPAID', 'PARTIALLY_PAID'])
      .where('dueDate', '<=', asOfDate)
      .orderBy('dueDate', 'asc')
      .orderBy(FieldPath.documentId(), 'asc')
      .limit(1001)
      .get();
    return snapshot.docs.map((document) => chargeFrom(document.id, document.data()));
  }

  async chargesForRental(rentalId: string): Promise<ChargeDocument[]> {
    const snapshot = await this.firestore.collection(charges)
      .where('rentalId', '==', rentalId)
      .orderBy('chargeSequence', 'asc')
      .orderBy(FieldPath.documentId(), 'asc')
      .limit(1001)
      .get();
    return snapshot.docs.map((document) => chargeFrom(document.id, document.data()));
  }

  private async pageQuery<T>(
    baseQuery: Query,
    page: PageRequest,
    map: (document: FirebaseFirestore.QueryDocumentSnapshot) => T,
  ): Promise<{ items: T[]; totalElements: number }> {
    const countSnapshot = await baseQuery.count().get();
    let query = baseQuery
      .orderBy(page.sortField, page.direction.toLowerCase() as 'asc' | 'desc')
      .orderBy(FieldPath.documentId(), page.direction.toLowerCase() as 'asc' | 'desc');
    let snapshot: FirebaseFirestore.QuerySnapshot;
    for (let currentPage = 0; currentPage <= page.page; currentPage += 1) {
      snapshot = await query.limit(page.size).get();
      if (currentPage === page.page) {
        return {
          items: snapshot.docs.map(map),
          totalElements: countSnapshot.data().count,
        };
      }
      const last = snapshot.docs[snapshot.docs.length - 1];
      if (!last) return { items: [], totalElements: countSnapshot.data().count };
      query = query.startAfter(last);
    }
    return { items: [], totalElements: countSnapshot.data().count };
  }

  async paidAmountsForCharges(chargeIds: string[]): Promise<Map<string, string>> {
    if (chargeIds.length === 0) return new Map();
    const totals = new Map<string, bigint>();
    for (let offset = 0; offset < chargeIds.length; offset += 30) {
      const snapshot = await this.firestore.collection(allocations)
        .where('rentalChargeId', 'in', chargeIds.slice(offset, offset + 30))
        .get();
      for (const document of snapshot.docs) {
        const data = document.data();
        const chargeId = String(data.rentalChargeId);
        const amount = normalizeAllocation(data.allocatedAmount);
        const [whole, fraction] = amount.split('.');
        const minor = BigInt(whole!) * 100n + BigInt(fraction!);
        totals.set(chargeId, (totals.get(chargeId) ?? 0n) + minor);
      }
    }
    return new Map([...totals.entries()].map(([id, minor]) => [
      id,
      `${minor / 100n}.${String(minor % 100n).padStart(2, '0')}`,
    ]));
  }

  static newId(): string {
    return randomUUID();
  }

  static timestamp(): Timestamp {
    return Timestamp.now();
  }

  static increment(value: number): FieldValue {
    return FieldValue.increment(value);
  }

  static nextPeriod(start: string): { end: string; next: string } {
    const end = addDays(start, 6);
    return { end, next: addDays(end, 1) };
  }

  static ensureAvailableBike(bike: BikeDocument): void {
    if (bike.isArchived) throw new BusinessError('Cannot rent an archived motorbike');
    if (bike.status !== 'AVAILABLE') {
      throw new ConflictError(
        `Motorbike ${bike.registrationNumber} is not available (current status: ${bike.status})`,
      );
    }
  }

  static ensureOwnerLock(
    lock: FirebaseFirestore.DocumentSnapshot,
    rentalId: string,
    bike: BikeDocument,
  ): void {
    if (lock.exists) {
      const lockRentalId = String(lock.data()?.rentalId);
      if (lockRentalId !== rentalId) {
        throw new ConflictError(`Motorbike ${bike.registrationNumber} is not available for this rental`);
      }
    }
  }
}
