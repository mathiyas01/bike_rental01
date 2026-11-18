import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type {
  BikeDocument,
  PaymentAllocationDocument,
  PaymentDocument,
  RentalDocument,
  ServiceRecordDocument,
  StockMovementDocument,
} from '../domain/types.js';
import { stockMovementFrom } from '../inventory/inventory.repository.js';
import { allocationFrom, paymentFrom, rentalFrom } from '../payment/payment.repository.js';
import { serviceRecordFrom, servicingBikeFrom } from '../servicing/servicing.repository.js';
import { addDays } from '../shared/dates.js';
import { NotFoundError, UnprocessableEntityError } from '../shared/errors.js';
import { MAX_REPORT_SCAN_DOCS } from './reports.types.js';

export const BIKES = 'bikes';
export const RENTALS = 'rentals';
export const RENTAL_CHARGES = 'rental_charges';
export const PARTS = 'parts';
export const PAYMENTS = 'payments';
export const PAYMENT_ALLOCATIONS = 'payment_allocations';
export const SERVICE_RECORDS = 'service_records';
export const STOCK_MOVEMENTS = 'stock_movements';

export class ReportsRepository {
  constructor(
    private readonly firestore: Firestore,
    private readonly maxScanDocs = MAX_REPORT_SCAN_DOCS,
  ) {}

  private assertScanWithinBudget(docCount: number, source: string): void {
    if (docCount > this.maxScanDocs) {
      throw new UnprocessableEntityError(
        `Report query on ${source} exceeded maximum scan limit of ${this.maxScanDocs} documents; narrow the query scope`,
      );
    }
  }

  async listActiveBikes(): Promise<BikeDocument[]> {
    const snapshot = await this.firestore
      .collection(BIKES)
      .where('isArchived', '==', false)
      .limit(this.maxScanDocs + 1)
      .get();
    this.assertScanWithinBudget(snapshot.docs.length, BIKES);
    return snapshot.docs
      .map((doc) => servicingBikeFrom(doc.id, doc.data()))
      .filter((bike) => !bike.isArchived);
  }

  async countOverdueOrDueCharges(asOfDate: string): Promise<number> {
    // Two parallel queries reuse the existing [status ASC, dueDate ASC] composite index.
    const [unpaidSnap, partialSnap] = await Promise.all([
      this.firestore
        .collection(RENTAL_CHARGES)
        .where('status', '==', 'UNPAID')
        .where('dueDate', '<=', asOfDate)
        .limit(this.maxScanDocs + 1)
        .get(),
      this.firestore
        .collection(RENTAL_CHARGES)
        .where('status', '==', 'PARTIALLY_PAID')
        .where('dueDate', '<=', asOfDate)
        .limit(this.maxScanDocs + 1)
        .get(),
    ]);
    this.assertScanWithinBudget(unpaidSnap.docs.length, `${RENTAL_CHARGES}(UNPAID)`);
    this.assertScanWithinBudget(partialSnap.docs.length, `${RENTAL_CHARGES}(PARTIALLY_PAID)`);
    return unpaidSnap.docs.length + partialSnap.docs.length;
  }

  async countLowStockParts(): Promise<number> {
    // Reuses the existing [isActive ASC, isLowStock ASC, partCode ASC] composite index prefix.
    const snapshot = await this.firestore
      .collection(PARTS)
      .where('isActive', '==', true)
      .where('isLowStock', '==', true)
      .limit(this.maxScanDocs + 1)
      .get();
    this.assertScanWithinBudget(snapshot.docs.length, PARTS);
    return snapshot.docs.length;
  }

  async listConfirmedPaymentsInDateRange(
    fromDate: string,
    toDate: string,
  ): Promise<PaymentDocument[]> {
    // Reuses the existing [status ASC, paymentDate ASC] composite index.
    const snapshot = await this.firestore
      .collection(PAYMENTS)
      .where('status', '==', 'CONFIRMED')
      .where('paymentDate', '>=', fromDate)
      .where('paymentDate', '<=', toDate)
      .orderBy('paymentDate', 'asc')
      .limit(this.maxScanDocs + 1)
      .get();
    this.assertScanWithinBudget(snapshot.docs.length, PAYMENTS);
    return snapshot.docs.map((doc) => paymentFrom(doc.id, doc.data()));
  }

  async listRentalsInDateRange(fromDate: string, toDate: string): Promise<RentalDocument[]> {
    const snapshot = await this.firestore
      .collection(RENTALS)
      .where('startDate', '>=', fromDate)
      .where('startDate', '<=', toDate)
      .orderBy('startDate', 'asc')
      .limit(this.maxScanDocs + 1)
      .get();
    this.assertScanWithinBudget(snapshot.docs.length, RENTALS);
    return snapshot.docs.map((doc) => rentalFrom(doc.id, doc.data()));
  }

  async listServicesInDateRange(
    fromDate: string,
    toDate: string,
  ): Promise<ServiceRecordDocument[]> {
    const snapshot = await this.firestore
      .collection(SERVICE_RECORDS)
      .where('serviceDate', '>=', fromDate)
      .where('serviceDate', '<=', toDate)
      .orderBy('serviceDate', 'asc')
      .limit(this.maxScanDocs + 1)
      .get();
    this.assertScanWithinBudget(snapshot.docs.length, SERVICE_RECORDS);
    return snapshot.docs.map((doc) => serviceRecordFrom(doc.id, doc.data()));
  }

  async listStockMovementsInDateRange(
    fromDate: string,
    toDate: string,
  ): Promise<StockMovementDocument[]> {
    const startTs = Timestamp.fromDate(new Date(`${fromDate}T00:00:00.000Z`));
    const nextDayStartTs = Timestamp.fromDate(new Date(`${addDays(toDate, 1)}T00:00:00.000Z`));
    const snapshot = await this.firestore
      .collection(STOCK_MOVEMENTS)
      .where('createdAt', '>=', startTs)
      .where('createdAt', '<', nextDayStartTs)
      .orderBy('createdAt', 'asc')
      .limit(this.maxScanDocs + 1)
      .get();
    this.assertScanWithinBudget(snapshot.docs.length, STOCK_MOVEMENTS);
    return snapshot.docs.map((doc) => stockMovementFrom(doc.id, doc.data()));
  }

  async getBikeOrThrow(bikeId: string): Promise<BikeDocument> {
    const snap = await this.firestore.collection(BIKES).doc(bikeId).get();
    if (!snap.exists || !snap.data()) {
      throw new NotFoundError('Motorbike', bikeId);
    }
    return servicingBikeFrom(snap.id, snap.data()!);
  }

  async listServicesForBike(bikeId: string): Promise<ServiceRecordDocument[]> {
    // Reuses the existing [bikeId ASC, serviceDate DESC] composite index.
    const snapshot = await this.firestore
      .collection(SERVICE_RECORDS)
      .where('bikeId', '==', bikeId)
      .orderBy('serviceDate', 'desc')
      .limit(this.maxScanDocs + 1)
      .get();
    this.assertScanWithinBudget(snapshot.docs.length, SERVICE_RECORDS);
    return snapshot.docs.map((doc) => serviceRecordFrom(doc.id, doc.data()));
  }

  /**
   * Preserves literal Java ReportService.getBikeRoi behavior (Stage C7.0.1 Decision 1):
   * queries `payments` with `rentalId === bikeId`, ordered by `paymentDate` descending,
   * including all payment statuses (no CONFIRMED filter, no resolution via `rentals`).
   *
   * Reuses the existing [rentalId ASC, paymentDate DESC] composite index.
   * Any future fix to aggregate CONFIRMED payments via `rentals.bikeId === bikeId`
   * requires explicit business-rule approval (see specification Section 5.5.2).
   */
  async listPaymentsForBikeRoiLiteralParity(bikeId: string): Promise<PaymentDocument[]> {
    const snapshot = await this.firestore
      .collection(PAYMENTS)
      .where('rentalId', '==', bikeId)
      .orderBy('paymentDate', 'desc')
      .limit(this.maxScanDocs + 1)
      .get();
    this.assertScanWithinBudget(snapshot.docs.length, PAYMENTS);
    return snapshot.docs.map((doc) => paymentFrom(doc.id, doc.data()));
  }

  async listRentalIdsForBike(bikeId: string): Promise<string[]> {
    const snapshot = await this.firestore
      .collection(RENTALS)
      .where('bikeId', '==', bikeId)
      .limit(this.maxScanDocs + 1)
      .get();
    this.assertScanWithinBudget(snapshot.docs.length, RENTALS);
    return snapshot.docs.map((doc) => doc.id);
  }

  async listDirectPaymentsForRentals(rentalIds: string[]): Promise<PaymentDocument[]> {
    const uniqueRentalIds = [...new Set(rentalIds)];
    if (uniqueRentalIds.length === 0) return [];

    const collected: PaymentDocument[] = [];
    for (let offset = 0; offset < uniqueRentalIds.length; offset += 30) {
      const chunk = uniqueRentalIds.slice(offset, offset + 30);
      const remainingBudget = this.maxScanDocs - collected.length;
      const snapshot = await this.firestore
        .collection(PAYMENTS)
        .where('rentalId', 'in', chunk)
        .limit(remainingBudget + 1)
        .get();
      this.assertScanWithinBudget(collected.length + snapshot.docs.length, PAYMENTS);
      for (const doc of snapshot.docs) {
        collected.push(paymentFrom(doc.id, doc.data()));
      }
    }
    return collected;
  }

  async listChargeIdsForBike(bikeId: string): Promise<string[]> {
    const snapshot = await this.firestore
      .collection(RENTAL_CHARGES)
      .where('bikeId', '==', bikeId)
      .limit(this.maxScanDocs + 1)
      .get();
    this.assertScanWithinBudget(snapshot.docs.length, RENTAL_CHARGES);
    return snapshot.docs.map((doc) => doc.id);
  }

  async listAllocationsForCharges(chargeIds: string[]): Promise<PaymentAllocationDocument[]> {
    const uniqueChargeIds = [...new Set(chargeIds)];
    if (uniqueChargeIds.length === 0) return [];

    const collected: PaymentAllocationDocument[] = [];
    for (let offset = 0; offset < uniqueChargeIds.length; offset += 30) {
      const chunk = uniqueChargeIds.slice(offset, offset + 30);
      const remainingBudget = this.maxScanDocs - collected.length;
      const snapshot = await this.firestore
        .collection(PAYMENT_ALLOCATIONS)
        .where('rentalChargeId', 'in', chunk)
        .limit(remainingBudget + 1)
        .get();
      this.assertScanWithinBudget(collected.length + snapshot.docs.length, PAYMENT_ALLOCATIONS);
      for (const doc of snapshot.docs) {
        collected.push(allocationFrom(doc.id, doc.data()));
      }
    }
    return collected;
  }

  async getPaymentsByIds(paymentIds: string[]): Promise<Map<string, PaymentDocument>> {
    const uniqueIds = [...new Set(paymentIds)];
    this.assertScanWithinBudget(uniqueIds.length, PAYMENTS);
    const result = new Map<string, PaymentDocument>();
    if (uniqueIds.length === 0) return result;

    for (let offset = 0; offset < uniqueIds.length; offset += 100) {
      const refs = uniqueIds
        .slice(offset, offset + 100)
        .map((id) => this.firestore.collection(PAYMENTS).doc(id));
      const snaps = await this.firestore.getAll(...refs);
      for (const snap of snaps) {
        if (snap.exists && snap.data()) {
          result.set(snap.id, paymentFrom(snap.id, snap.data()!));
        }
      }
    }
    return result;
  }
}
