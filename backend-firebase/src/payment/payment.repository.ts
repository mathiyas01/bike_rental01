import { randomUUID } from 'node:crypto';
import {
  FieldPath,
  Timestamp,
  type Firestore,
  type Query,
  type Transaction,
} from 'firebase-admin/firestore';
import type {
  ChargeDocument,
  CustomerDocument,
  PaymentAllocationDocument,
  PaymentDocument,
  PaymentReversalDocument,
  RentalDocument,
} from '../domain/types.js';
import { AuthError } from '../auth/errors.js';
import { NotFoundError } from '../shared/errors.js';
import { moneyToJson } from '../shared/money.js';
import type { PageRequest } from '../shared/pagination.js';
import type {
  PaymentAllocationDto,
  PaymentDto,
  PaymentSearchFilters,
} from './payment.types.js';

const APP_USERS = 'app_users';
const CUSTOMERS = 'customers';
const RENTALS = 'rentals';
const RENTAL_CHARGES = 'rental_charges';
const PAYMENTS = 'payments';
const PAYMENT_ALLOCATIONS = 'payment_allocations';
const PAYMENT_REVERSALS = 'payment_reversals';

function timestampToIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return new Date(0).toISOString();
}

export function customerFrom(id: string, data: FirebaseFirestore.DocumentData): CustomerDocument {
  return {
    id,
    fullName: String(data.fullName ?? ''),
    phone: String(data.phone ?? ''),
    isArchived: data.isArchived === true || data.archived === true,
  };
}

export function rentalFrom(id: string, data: FirebaseFirestore.DocumentData): RentalDocument {
  return {
    id,
    customerId: String(data.customerId),
    customerName: String(data.customerName ?? ''),
    customerPhone: String(data.customerPhone ?? ''),
    bikeId: String(data.bikeId),
    bikeRegistrationNumber: String(data.bikeRegistrationNumber ?? ''),
    bikeMakeModel: String(data.bikeMakeModel ?? ''),
    startDate: String(data.startDate),
    plannedEndDate: data.plannedEndDate ?? null,
    actualClosedDate: data.actualClosedDate ?? null,
    weeklyRate: String(data.weeklyRate),
    currency: data.currency,
    depositAmount: String(data.depositAmount ?? '0.00'),
    depositCurrency: data.depositCurrency ?? data.currency,
    paymentFrequency: 'WEEKLY',
    scheduleAnchorDay: String(data.scheduleAnchorDay ?? 'START_DAY'),
    status: data.status,
    termsAndNotes: data.termsAndNotes ?? null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export function chargeFrom(id: string, data: FirebaseFirestore.DocumentData): ChargeDocument {
  return {
    id,
    rentalId: String(data.rentalId),
    customerId: String(data.customerId),
    bikeId: String(data.bikeId ?? ''),
    chargeSequence: Number(data.chargeSequence),
    periodStartDate: String(data.periodStartDate ?? ''),
    periodEndDate: String(data.periodEndDate ?? ''),
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

export function paymentFrom(id: string, data: FirebaseFirestore.DocumentData): PaymentDocument {
  return {
    id,
    customerId: String(data.customerId),
    customerName: String(data.customerName ?? ''),
    rentalId: data.rentalId ? String(data.rentalId) : null,
    paymentDate: String(data.paymentDate),
    amount: String(data.amount),
    currency: data.currency,
    paymentMethod: data.paymentMethod,
    referenceNumber: data.referenceNumber !== undefined && data.referenceNumber !== null
      ? String(data.referenceNumber)
      : null,
    notes: data.notes !== undefined && data.notes !== null ? String(data.notes) : null,
    status: data.status,
    recordedByUserId: String(data.recordedByUserId ?? ''),
    recordedByUserName: String(data.recordedByUserName ?? ''),
    allocationMode: data.allocationMode === 'MANUAL' ? 'MANUAL' : 'AUTO_FIFO',
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export function allocationFrom(id: string, data: FirebaseFirestore.DocumentData): PaymentAllocationDocument {
  return {
    id,
    paymentId: String(data.paymentId),
    rentalChargeId: String(data.rentalChargeId),
    chargeSequence: Number(data.chargeSequence),
    chargeDueDate: String(data.chargeDueDate),
    allocatedAmount: String(data.allocatedAmount),
    currency: data.currency,
    allocatedAt: data.allocatedAt,
  };
}

export function reversalFrom(id: string, data: FirebaseFirestore.DocumentData): PaymentReversalDocument {
  return {
    id,
    paymentId: String(data.paymentId),
    reason: String(data.reason),
    reversedByUserId: String(data.reversedByUserId),
    reversedAt: data.reversedAt,
    createdAt: data.createdAt ?? data.reversedAt,
  };
}

export function sortAllocationsDeterministically(
  items: PaymentAllocationDocument[],
): PaymentAllocationDocument[] {
  return [...items].sort((left, right) => {
    if (left.chargeSequence !== right.chargeSequence) {
      return left.chargeSequence - right.chargeSequence;
    }
    const leftAt = timestampToIso(left.allocatedAt);
    const rightAt = timestampToIso(right.allocatedAt);
    if (leftAt !== rightAt) {
      return leftAt.localeCompare(rightAt);
    }
    return left.id.localeCompare(right.id);
  });
}

export function toAllocationDto(allocation: PaymentAllocationDocument): PaymentAllocationDto {
  return {
    id: allocation.id,
    paymentId: allocation.paymentId,
    rentalChargeId: allocation.rentalChargeId,
    chargeSequence: allocation.chargeSequence,
    chargeDueDate: allocation.chargeDueDate,
    allocatedAmount: moneyToJson(allocation.allocatedAmount),
    currency: allocation.currency,
    allocatedAt: timestampToIso(allocation.allocatedAt),
  };
}

export function toPaymentDto(
  payment: PaymentDocument,
  allocations: PaymentAllocationDocument[],
  reversal: PaymentReversalDocument | null,
): PaymentDto {
  return {
    id: payment.id,
    customerId: payment.customerId,
    customerName: payment.customerName,
    rentalId: payment.rentalId,
    paymentDate: payment.paymentDate,
    amount: moneyToJson(payment.amount),
    currency: payment.currency,
    paymentMethod: payment.paymentMethod,
    referenceNumber: payment.referenceNumber,
    notes: payment.notes,
    status: payment.status,
    recordedByUserName: payment.recordedByUserName,
    allocations: sortAllocationsDeterministically(allocations).map(toAllocationDto),
    reversalReason: reversal ? reversal.reason : null,
    reversedAt: reversal ? timestampToIso(reversal.reversedAt) : null,
    createdAt: timestampToIso(payment.createdAt),
  };
}

export class PaymentRepository {
  constructor(private readonly firestore: Firestore) {}

  userReference(id: string) {
    return this.firestore.collection(APP_USERS).doc(id);
  }

  customerReference(id: string) {
    return this.firestore.collection(CUSTOMERS).doc(id);
  }

  rentalReference(id: string) {
    return this.firestore.collection(RENTALS).doc(id);
  }

  chargeReference(id: string) {
    return this.firestore.collection(RENTAL_CHARGES).doc(id);
  }

  paymentReference(id: string) {
    return this.firestore.collection(PAYMENTS).doc(id);
  }

  allocationReference(id: string) {
    return this.firestore.collection(PAYMENT_ALLOCATIONS).doc(id);
  }

  reversalReference(id: string) {
    return this.firestore.collection(PAYMENT_REVERSALS).doc(id);
  }

  eligibleChargesForAutoFifoQuery(options: {
    customerId: string;
    rentalId: string | null;
    currency: string;
  }): Query {
    const base = this.firestore.collection(RENTAL_CHARGES);
    if (options.rentalId !== null) {
      return base
        .where('rentalId', '==', options.rentalId)
        .where('currency', '==', options.currency)
        .where('status', 'in', ['UNPAID', 'PARTIALLY_PAID'])
        .orderBy('dueDate', 'asc')
        .orderBy(FieldPath.documentId(), 'asc');
    }
    return base
      .where('customerId', '==', options.customerId)
      .where('currency', '==', options.currency)
      .where('status', 'in', ['UNPAID', 'PARTIALLY_PAID'])
      .orderBy('dueDate', 'asc')
      .orderBy(FieldPath.documentId(), 'asc');
  }

  allocationsForChargeQuery(chargeId: string): Query {
    return this.firestore
      .collection(PAYMENT_ALLOCATIONS)
      .where('rentalChargeId', '==', chargeId);
  }

  allocationsForPaymentQuery(paymentId: string): Query {
    return this.firestore
      .collection(PAYMENT_ALLOCATIONS)
      .where('paymentId', '==', paymentId);
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

  readCustomer(snapshot: FirebaseFirestore.DocumentSnapshot): CustomerDocument {
    if (!snapshot.exists) {
      throw new NotFoundError('Customer', snapshot.id);
    }
    return customerFrom(snapshot.id, snapshot.data() ?? {});
  }

  readRental(snapshot: FirebaseFirestore.DocumentSnapshot): RentalDocument {
    if (!snapshot.exists) {
      throw new NotFoundError('Rental agreement', snapshot.id);
    }
    return rentalFrom(snapshot.id, snapshot.data() ?? {});
  }

  readCharge(snapshot: FirebaseFirestore.DocumentSnapshot): ChargeDocument {
    if (!snapshot.exists) {
      throw new NotFoundError('Rental charge', snapshot.id);
    }
    return chargeFrom(snapshot.id, snapshot.data() ?? {});
  }

  readPayment(snapshot: FirebaseFirestore.DocumentSnapshot): PaymentDocument {
    if (!snapshot.exists) {
      throw new NotFoundError('Payment', snapshot.id);
    }
    return paymentFrom(snapshot.id, snapshot.data() ?? {});
  }

  async getManyInTransaction(
    tx: Transaction,
    refs: FirebaseFirestore.DocumentReference[],
  ): Promise<FirebaseFirestore.DocumentSnapshot[]> {
    if (refs.length === 0) return [];
    const results: FirebaseFirestore.DocumentSnapshot[] = [];
    for (let offset = 0; offset < refs.length; offset += 100) {
      const chunk = refs.slice(offset, offset + 100);
      const snaps = await tx.getAll(...chunk);
      results.push(...snaps);
    }
    return results;
  }

  async pagePayments(
    filters: PaymentSearchFilters,
    page: PageRequest,
  ): Promise<{ items: PaymentDocument[]; totalElements: number }> {
    let baseQuery: Query = this.firestore.collection(PAYMENTS);
    if (filters.status) baseQuery = baseQuery.where('status', '==', filters.status);
    if (filters.currency) baseQuery = baseQuery.where('currency', '==', filters.currency);
    if (filters.method) baseQuery = baseQuery.where('paymentMethod', '==', filters.method);
    if (filters.customerId) baseQuery = baseQuery.where('customerId', '==', filters.customerId);
    if (filters.startDate) baseQuery = baseQuery.where('paymentDate', '>=', filters.startDate);
    if (filters.endDate) baseQuery = baseQuery.where('paymentDate', '<=', filters.endDate);

    const countSnapshot = await baseQuery.count().get();
    const totalElements = countSnapshot.data().count;
    const direction = page.direction.toLowerCase() as 'asc' | 'desc';

    let query = baseQuery
      .orderBy(page.sortField, direction)
      .orderBy(FieldPath.documentId(), direction);

    for (let currentPage = 0; currentPage <= page.page; currentPage += 1) {
      const snapshot = await query.limit(page.size).get();
      if (currentPage === page.page) {
        return {
          items: snapshot.docs.map((doc) => paymentFrom(doc.id, doc.data())),
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

  async findPaymentsByCustomerId(customerId: string): Promise<PaymentDocument[]> {
    const snapshot = await this.firestore
      .collection(PAYMENTS)
      .where('customerId', '==', customerId)
      .orderBy('paymentDate', 'desc')
      .orderBy(FieldPath.documentId(), 'desc')
      .get();
    return snapshot.docs.map((doc) => paymentFrom(doc.id, doc.data()));
  }

  async findPaymentsByRentalId(rentalId: string): Promise<PaymentDocument[]> {
    const snapshot = await this.firestore
      .collection(PAYMENTS)
      .where('rentalId', '==', rentalId)
      .orderBy('paymentDate', 'desc')
      .orderBy(FieldPath.documentId(), 'desc')
      .get();
    return snapshot.docs.map((doc) => paymentFrom(doc.id, doc.data()));
  }

  async findAllocationsByPaymentIds(
    paymentIds: string[],
  ): Promise<Map<string, PaymentAllocationDocument[]>> {
    const byPayment = new Map<string, PaymentAllocationDocument[]>();
    if (paymentIds.length === 0) return byPayment;

    const uniqueIds = [...new Set(paymentIds)];
    for (let offset = 0; offset < uniqueIds.length; offset += 30) {
      const snapshot = await this.firestore
        .collection(PAYMENT_ALLOCATIONS)
        .where('paymentId', 'in', uniqueIds.slice(offset, offset + 30))
        .get();
      for (const doc of snapshot.docs) {
        const alloc = allocationFrom(doc.id, doc.data());
        const existing = byPayment.get(alloc.paymentId);
        if (existing) {
          existing.push(alloc);
        } else {
          byPayment.set(alloc.paymentId, [alloc]);
        }
      }
    }

    for (const [paymentId, list] of byPayment.entries()) {
      byPayment.set(paymentId, sortAllocationsDeterministically(list));
    }

    return byPayment;
  }

  async findReversalsByPaymentIds(
    paymentIds: string[],
  ): Promise<Map<string, PaymentReversalDocument>> {
    const byPayment = new Map<string, PaymentReversalDocument>();
    if (paymentIds.length === 0) return byPayment;

    const uniqueIds = [...new Set(paymentIds)];
    for (let offset = 0; offset < uniqueIds.length; offset += 30) {
      const snapshot = await this.firestore
        .collection(PAYMENT_REVERSALS)
        .where('paymentId', 'in', uniqueIds.slice(offset, offset + 30))
        .get();
      for (const doc of snapshot.docs) {
        const reversal = reversalFrom(doc.id, doc.data());
        byPayment.set(reversal.paymentId, reversal);
      }
    }

    return byPayment;
  }

  async findChargesForCustomer(customerId: string): Promise<ChargeDocument[]> {
    const snapshot = await this.firestore
      .collection(RENTAL_CHARGES)
      .where('customerId', '==', customerId)
      .get();
    return snapshot.docs.map((doc) => chargeFrom(doc.id, doc.data()));
  }

  async findConfirmedPaymentsForCustomer(customerId: string): Promise<PaymentDocument[]> {
    const snapshot = await this.firestore
      .collection(PAYMENTS)
      .where('customerId', '==', customerId)
      .where('status', '==', 'CONFIRMED')
      .get();
    return snapshot.docs.map((doc) => paymentFrom(doc.id, doc.data()));
  }

  static newId(): string {
    return randomUUID();
  }
}
