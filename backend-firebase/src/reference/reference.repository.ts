import { createHash } from 'node:crypto';
import { Timestamp, type Firestore, type Query } from 'firebase-admin/firestore';
import type { BikeDocument, BikeStatus, CustomerDocument } from '../domain/types.js';
import { NotFoundError, UnprocessableEntityError } from '../shared/errors.js';
import { moneyToJson, normalizeMoney, toMinorUnits } from '../shared/money.js';
import type { PageRequest } from '../shared/pagination.js';
import {
  MAX_SEARCH_SCAN_DOCS,
  type BikeDto,
  type BikeSearchFilters,
  type CustomerDto,
  type CustomerSearchFilters,
} from './reference.types.js';

export const BIKES = 'bikes';
export const CUSTOMERS = 'customers';
export const UNIQUE_KEYS = 'unique_keys';
export const ACTIVE_RENTAL_LOCKS = 'active_rental_locks';
export const RENTALS = 'rentals';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function bikeRegLockId(registrationNumberUpper: string): string {
  return `bike_reg_${sha256(registrationNumberUpper)}`;
}

export function bikeVinLockId(vinUpper: string): string {
  return `bike_vin_${sha256(vinUpper)}`;
}

export function customerPhoneLockId(phoneTrimmed: string): string {
  return `customer_phone_${sha256(phoneTrimmed)}`;
}

function toTimestampOrEpoch(value: unknown): Timestamp {
  if (value instanceof Timestamp) {
    return value;
  }
  if (
    value &&
    typeof value === 'object' &&
    'seconds' in value &&
    'nanoseconds' in value &&
    typeof (value as { seconds: unknown }).seconds === 'number' &&
    typeof (value as { nanoseconds: unknown }).nanoseconds === 'number'
  ) {
    const raw = value as { seconds: number; nanoseconds: number };
    return new Timestamp(raw.seconds, raw.nanoseconds);
  }
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return Timestamp.fromDate((value as { toDate: () => Date }).toDate());
  }
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) {
      return Timestamp.fromMillis(ms);
    }
  }
  return Timestamp.fromMillis(0);
}

function timestampToIso(value: unknown): string {
  return toTimestampOrEpoch(value).toDate().toISOString();
}

function compareTimestamps(left: unknown, right: unknown): number {
  const leftTs = toTimestampOrEpoch(left);
  const rightTs = toTimestampOrEpoch(right);
  if (leftTs.seconds !== rightTs.seconds) {
    return leftTs.seconds - rightTs.seconds;
  }
  return leftTs.nanoseconds - rightTs.nanoseconds;
}

function compareBigInt(left: bigint, right: bigint): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function optionalNullableString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return String(value);
}

export function bikeRecordFrom(id: string, data: FirebaseFirestore.DocumentData): BikeDocument {
  let currentOdometer = '0.00';
  if (data.currentOdometer !== undefined && data.currentOdometer !== null) {
    currentOdometer = normalizeMoney(data.currentOdometer, 'currentOdometer', 0);
  }
  const rawInterval = Number(data.serviceIntervalDays);
  const serviceIntervalDays = Number.isInteger(rawInterval) && rawInterval > 0 ? rawInterval : 30;

  const rawYear = data.manufactureYear ?? data.yearOfManufacture;
  const parsedYear = Number(rawYear);
  const manufactureYear = Number.isInteger(parsedYear) && parsedYear > 0 ? parsedYear : 0;

  return {
    id,
    registrationNumber: String(data.registrationNumber ?? ''),
    vin: String(data.vin ?? ''),
    make: String(data.make ?? ''),
    model: String(data.model ?? ''),
    manufactureYear,
    status: data.status as BikeStatus,
    isArchived: data.isArchived === true || data.archived === true,
    currentOdometer,
    itpExpiryDate: optionalNullableString(data.itpExpiryDate),
    rcaExpiryDate: optionalNullableString(data.rcaExpiryDate),
    cascoExpiryDate: optionalNullableString(data.cascoExpiryDate),
    serviceIntervalDays,
    nextServiceDueDate: optionalNullableString(data.nextServiceDueDate),
    notes: optionalNullableString(data.notes),
    createdAt: toTimestampOrEpoch(data.createdAt),
    updatedAt: toTimestampOrEpoch(data.updatedAt),
  };
}

export function customerRecordFrom(
  id: string,
  data: FirebaseFirestore.DocumentData,
): CustomerDocument {
  return {
    id,
    fullName: String(data.fullName ?? ''),
    phone: String(data.phone ?? ''),
    email: optionalNullableString(data.email),
    cnpOrTaxId: optionalNullableString(data.cnpOrTaxId),
    dateOfBirth: optionalNullableString(data.dateOfBirth),
    livingCity: optionalNullableString(data.livingCity),
    drivingLicenceNumber: optionalNullableString(data.drivingLicenceNumber),
    licenceCategories: optionalNullableString(data.licenceCategories),
    licenceExpiryDate: optionalNullableString(data.licenceExpiryDate),
    address: optionalNullableString(data.address),
    gdprConsentDate: optionalNullableString(data.gdprConsentDate),
    notes: optionalNullableString(data.notes),
    isArchived: data.isArchived === true || data.archived === true,
    createdAt: toTimestampOrEpoch(data.createdAt),
    updatedAt: toTimestampOrEpoch(data.updatedAt),
  };
}

export function toBikeDto(bike: BikeDocument): BikeDto {
  const manufactureYear = bike.manufactureYear ?? 0;
  return {
    id: bike.id,
    registrationNumber: bike.registrationNumber,
    vin: bike.vin,
    make: bike.make,
    model: bike.model,
    manufactureYear,
    yearOfManufacture: manufactureYear,
    currentOdometer: moneyToJson(bike.currentOdometer ?? '0.00'),
    itpExpiryDate: bike.itpExpiryDate ?? null,
    rcaExpiryDate: bike.rcaExpiryDate ?? null,
    cascoExpiryDate: bike.cascoExpiryDate ?? null,
    serviceIntervalDays: bike.serviceIntervalDays ?? 30,
    nextServiceDueDate: bike.nextServiceDueDate ?? null,
    status: bike.status,
    notes: bike.notes ?? null,
    archived: bike.isArchived,
    createdAt: timestampToIso(bike.createdAt),
    updatedAt: timestampToIso(bike.updatedAt),
  };
}

export function toCustomerDto(customer: CustomerDocument): CustomerDto {
  return {
    id: customer.id,
    fullName: customer.fullName,
    phone: customer.phone,
    email: customer.email ?? null,
    cnpOrTaxId: customer.cnpOrTaxId ?? null,
    dateOfBirth: customer.dateOfBirth ?? null,
    livingCity: customer.livingCity ?? null,
    drivingLicenceNumber: customer.drivingLicenceNumber ?? null,
    licenceCategories: customer.licenceCategories ?? null,
    licenceExpiryDate: customer.licenceExpiryDate ?? null,
    address: customer.address ?? null,
    gdprConsentDate: customer.gdprConsentDate ?? null,
    notes: customer.notes ?? null,
    archived: customer.isArchived,
    createdAt: timestampToIso(customer.createdAt),
    updatedAt: timestampToIso(customer.updatedAt),
  };
}

export function filterAndSortBikes(
  bikes: BikeDocument[],
  filters: BikeSearchFilters,
  page: PageRequest,
): BikeDocument[] {
  const term = filters.search?.toLowerCase();
  const filtered = bikes.filter((bike) => {
    if (!filters.includeArchived && bike.isArchived) {
      return false;
    }
    if (filters.status !== undefined && bike.status !== filters.status) {
      return false;
    }
    if (term !== undefined) {
      return (
        bike.registrationNumber.toLowerCase().includes(term) ||
        bike.vin.toLowerCase().includes(term) ||
        bike.make.toLowerCase().includes(term) ||
        bike.model.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const factor = page.direction === 'ASC' ? 1 : -1;
  return [...filtered].sort((left, right) => {
    let primary = 0;
    switch (page.sortField) {
      case 'createdAt':
        primary = compareTimestamps(left.createdAt, right.createdAt);
        break;
      case 'updatedAt':
        primary = compareTimestamps(left.updatedAt, right.updatedAt);
        break;
      case 'registrationNumber':
        primary = left.registrationNumber.localeCompare(right.registrationNumber);
        break;
      case 'vin':
        primary = left.vin.localeCompare(right.vin);
        break;
      case 'make':
        primary = left.make.localeCompare(right.make);
        break;
      case 'model':
        primary = left.model.localeCompare(right.model);
        break;
      case 'manufactureYear':
        primary = (left.manufactureYear ?? 0) - (right.manufactureYear ?? 0);
        break;
      case 'currentOdometer':
        primary = compareBigInt(
          toMinorUnits(left.currentOdometer ?? '0.00'),
          toMinorUnits(right.currentOdometer ?? '0.00'),
        );
        break;
      case 'serviceIntervalDays':
        primary = (left.serviceIntervalDays ?? 30) - (right.serviceIntervalDays ?? 30);
        break;
      case 'nextServiceDueDate':
        primary = (left.nextServiceDueDate ?? '').localeCompare(right.nextServiceDueDate ?? '');
        break;
      case 'status':
        primary = left.status.localeCompare(right.status);
        break;
      default:
        primary = compareTimestamps(left.createdAt, right.createdAt);
        break;
    }
    if (primary !== 0) {
      return primary * factor;
    }
    return left.id.localeCompare(right.id) * factor;
  });
}

export function filterAndSortCustomers(
  customers: CustomerDocument[],
  filters: CustomerSearchFilters,
  page: PageRequest,
): CustomerDocument[] {
  const term = filters.search?.toLowerCase();
  const filtered = customers.filter((customer) => {
    if (!filters.includeArchived && customer.isArchived) {
      return false;
    }
    if (term !== undefined) {
      return (
        customer.fullName.toLowerCase().includes(term) ||
        customer.phone.toLowerCase().includes(term) ||
        (customer.email ?? '').toLowerCase().includes(term) ||
        (customer.cnpOrTaxId ?? '').toLowerCase().includes(term)
      );
    }
    return true;
  });

  const factor = page.direction === 'ASC' ? 1 : -1;
  return [...filtered].sort((left, right) => {
    let primary = 0;
    switch (page.sortField) {
      case 'createdAt':
        primary = compareTimestamps(left.createdAt, right.createdAt);
        break;
      case 'updatedAt':
        primary = compareTimestamps(left.updatedAt, right.updatedAt);
        break;
      case 'fullName':
        primary = left.fullName.localeCompare(right.fullName);
        break;
      case 'phone':
        primary = left.phone.localeCompare(right.phone);
        break;
      case 'email':
        primary = (left.email ?? '').localeCompare(right.email ?? '');
        break;
      case 'livingCity':
        primary = (left.livingCity ?? '').localeCompare(right.livingCity ?? '');
        break;
      default:
        primary = compareTimestamps(left.createdAt, right.createdAt);
        break;
    }
    if (primary !== 0) {
      return primary * factor;
    }
    return left.id.localeCompare(right.id) * factor;
  });
}

export class ReferenceRepository {
  constructor(
    private readonly firestore: Firestore,
    private readonly maxScanDocs = MAX_SEARCH_SCAN_DOCS,
  ) {}

  bikeRef(bikeId: string) {
    return this.firestore.collection(BIKES).doc(bikeId);
  }

  customerRef(customerId: string) {
    return this.firestore.collection(CUSTOMERS).doc(customerId);
  }

  uniqueKeyRef(lockId: string) {
    return this.firestore.collection(UNIQUE_KEYS).doc(lockId);
  }

  activeRentalLockRef(bikeId: string) {
    return this.firestore.collection(ACTIVE_RENTAL_LOCKS).doc(bikeId);
  }

  rentalRef(rentalId: string) {
    return this.firestore.collection(RENTALS).doc(rentalId);
  }

  readBike(snapshot: FirebaseFirestore.DocumentSnapshot): BikeDocument {
    if (!snapshot.exists) {
      throw new NotFoundError('Motorbike', snapshot.id);
    }
    return bikeRecordFrom(snapshot.id, snapshot.data() ?? {});
  }

  readCustomer(snapshot: FirebaseFirestore.DocumentSnapshot): CustomerDocument {
    if (!snapshot.exists) {
      throw new NotFoundError('Customer', snapshot.id);
    }
    return customerRecordFrom(snapshot.id, snapshot.data() ?? {});
  }

  async getBikeById(bikeId: string): Promise<BikeDocument> {
    return this.readBike(await this.bikeRef(bikeId).get());
  }

  async getCustomerById(customerId: string): Promise<CustomerDocument> {
    return this.readCustomer(await this.customerRef(customerId).get());
  }

  async pageBikes(
    filters: BikeSearchFilters,
    page: PageRequest,
  ): Promise<{ items: BikeDocument[]; totalElements: number }> {
    let query: Query = this.firestore.collection(BIKES);
    if (!filters.includeArchived) {
      query = query.where('isArchived', '==', false);
    }
    if (filters.status !== undefined) {
      query = query.where('status', '==', filters.status);
    }
    const snapshot = await query.limit(this.maxScanDocs + 1).get();
    if (snapshot.docs.length > this.maxScanDocs) {
      throw new UnprocessableEntityError(
        `Motorbike search exceeded the maximum scan limit of ${this.maxScanDocs} documents; narrow filters`,
      );
    }

    const mapped = snapshot.docs.map((doc) => bikeRecordFrom(doc.id, doc.data()));
    const sorted = filterAndSortBikes(mapped, filters, page);
    const start = page.page * page.size;
    return {
      items: sorted.slice(start, start + page.size),
      totalElements: sorted.length,
    };
  }

  async pageCustomers(
    filters: CustomerSearchFilters,
    page: PageRequest,
  ): Promise<{ items: CustomerDocument[]; totalElements: number }> {
    let query: Query = this.firestore.collection(CUSTOMERS);
    if (!filters.includeArchived) {
      query = query.where('isArchived', '==', false);
    }
    const snapshot = await query.limit(this.maxScanDocs + 1).get();
    if (snapshot.docs.length > this.maxScanDocs) {
      throw new UnprocessableEntityError(
        `Customer search exceeded the maximum scan limit of ${this.maxScanDocs} documents; narrow filters`,
      );
    }

    const mapped = snapshot.docs.map((doc) => customerRecordFrom(doc.id, doc.data()));
    const sorted = filterAndSortCustomers(mapped, filters, page);
    const start = page.page * page.size;
    return {
      items: sorted.slice(start, start + page.size),
      totalElements: sorted.length,
    };
  }

  async queryBikesIndexed(
    filters: { includeArchived: boolean; status?: BikeStatus },
    direction: 'ASC' | 'DESC',
    limitCount: number,
  ): Promise<BikeDocument[]> {
    let query: Query = this.firestore.collection(BIKES);
    if (!filters.includeArchived) {
      query = query.where('isArchived', '==', false);
    }
    if (filters.status !== undefined) {
      query = query.where('status', '==', filters.status);
    }
    const snapshot = await query
      .orderBy('createdAt', direction === 'ASC' ? 'asc' : 'desc')
      .limit(limitCount)
      .get();
    return snapshot.docs.map((doc) => bikeRecordFrom(doc.id, doc.data()));
  }

  async queryCustomersIndexed(
    filters: { includeArchived: boolean },
    direction: 'ASC' | 'DESC',
    limitCount: number,
  ): Promise<CustomerDocument[]> {
    let query: Query = this.firestore.collection(CUSTOMERS);
    if (!filters.includeArchived) {
      query = query.where('isArchived', '==', false);
    }
    const snapshot = await query
      .orderBy('createdAt', direction === 'ASC' ? 'asc' : 'desc')
      .limit(limitCount)
      .get();
    return snapshot.docs.map((doc) => customerRecordFrom(doc.id, doc.data()));
  }
}
