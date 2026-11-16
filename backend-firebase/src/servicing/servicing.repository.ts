import {
  FieldPath,
  Timestamp,
  type Firestore,
  type Query,
} from 'firebase-admin/firestore';
import { AuthError } from '../auth/errors.js';
import type {
  BikeDocument,
  EmbeddedServicePartUsage,
  ServicePartUsageDocument,
  ServiceRecordDocument,
} from '../domain/types.js';
import { APP_USERS } from '../inventory/inventory.repository.js';
import { MAX_SEARCH_SCAN_DOCS } from '../inventory/inventory.types.js';
import { NotFoundError, UnprocessableEntityError } from '../shared/errors.js';
import { moneyToJson, normalizeMoney } from '../shared/money.js';
import type { PageRequest } from '../shared/pagination.js';
import type {
  ServicePartUsageDto,
  ServiceRecordDto,
  ServiceSearchFilters,
} from './servicing.types.js';
import { scale4ToJson, toScale4Units } from './servicing.validation.js';

export const BIKES = 'bikes';
export const SERVICE_RECORDS = 'service_records';
export const SERVICE_PART_USAGE = 'service_part_usage';

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

export function servicingBikeFrom(id: string, data: FirebaseFirestore.DocumentData): BikeDocument {
  let currentOdometer = '0.00';
  if (data.currentOdometer !== undefined && data.currentOdometer !== null) {
    currentOdometer = normalizeMoney(data.currentOdometer, 'currentOdometer', 0);
  }
  const rawInterval = Number(data.serviceIntervalDays);
  const serviceIntervalDays = Number.isInteger(rawInterval) && rawInterval > 0 ? rawInterval : 30;

  return {
    id,
    registrationNumber: String(data.registrationNumber ?? ''),
    vin: String(data.vin ?? ''),
    make: String(data.make ?? ''),
    model: String(data.model ?? ''),
    status: data.status as BikeDocument['status'],
    isArchived: data.isArchived === true || data.archived === true,
    currentOdometer,
    serviceIntervalDays,
    nextServiceDueDate:
      data.nextServiceDueDate !== undefined && data.nextServiceDueDate !== null
        ? String(data.nextServiceDueDate)
        : null,
    updatedAt: data.updatedAt,
  };
}

function embeddedPartUsageFrom(raw: Record<string, unknown>): EmbeddedServicePartUsage {
  return {
    id: String(raw.id ?? ''),
    partId: String(raw.partId ?? ''),
    partCode: String(raw.partCode ?? ''),
    partName: String(raw.partName ?? ''),
    quantity: String(raw.quantity ?? '0.00'),
    unitCost: String(raw.unitCost ?? '0.00'),
    currency: raw.currency as EmbeddedServicePartUsage['currency'],
    totalCost: String(raw.totalCost ?? '0.00'),
  };
}

export function serviceRecordFrom(
  id: string,
  data: FirebaseFirestore.DocumentData,
): ServiceRecordDocument {
  const partsUsedRaw = Array.isArray(data.partsUsed) ? data.partsUsed : [];
  return {
    id,
    bikeId: String(data.bikeId ?? ''),
    bikeRegistrationNumber: String(data.bikeRegistrationNumber ?? ''),
    bikeMakeModel: String(data.bikeMakeModel ?? ''),
    serviceDate: String(data.serviceDate ?? ''),
    odometerReading: String(data.odometerReading ?? '0.00'),
    serviceProvider: String(data.serviceProvider ?? ''),
    workPerformed: String(data.workPerformed ?? ''),
    labourCost: String(data.labourCost ?? '0.00'),
    labourCurrency: data.labourCurrency,
    partsCost: String(data.partsCost ?? '0.00'),
    totalCost: String(data.totalCost ?? '0.00'),
    status: data.status,
    nextServiceDueDate:
      data.nextServiceDueDate !== undefined && data.nextServiceDueDate !== null
        ? String(data.nextServiceDueDate)
        : null,
    nextServiceDueOdometer:
      data.nextServiceDueOdometer !== undefined && data.nextServiceDueOdometer !== null
        ? String(data.nextServiceDueOdometer)
        : null,
    notes: data.notes !== undefined && data.notes !== null ? String(data.notes) : null,
    partsUsed: partsUsedRaw.map((item) =>
      embeddedPartUsageFrom((item ?? {}) as Record<string, unknown>),
    ),
    recordedByUserId: String(data.recordedByUserId ?? ''),
    recordedByUserName: String(data.recordedByUserName ?? ''),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export function toServicePartUsageDto(
  usage: EmbeddedServicePartUsage | ServicePartUsageDocument,
): ServicePartUsageDto {
  return {
    id: usage.id,
    partId: usage.partId,
    partCode: usage.partCode,
    partName: usage.partName,
    quantity: moneyToJson(usage.quantity),
    unitCost: moneyToJson(usage.unitCost),
    currency: usage.currency,
    totalCost: scale4ToJson(usage.totalCost),
  };
}

export function toServiceRecordDto(record: ServiceRecordDocument): ServiceRecordDto {
  return {
    id: record.id,
    bikeId: record.bikeId,
    bikeRegistrationNumber: record.bikeRegistrationNumber,
    motorbikeRegistrationNumber: record.bikeRegistrationNumber,
    bikeMakeModel: record.bikeMakeModel,
    serviceDate: record.serviceDate,
    odometerReading: moneyToJson(record.odometerReading),
    serviceProvider: record.serviceProvider,
    workPerformed: record.workPerformed,
    labourCost: moneyToJson(record.labourCost),
    labourCurrency: record.labourCurrency,
    partsCost: scale4ToJson(record.partsCost),
    totalCost: scale4ToJson(record.totalCost),
    status: record.status,
    nextServiceDueDate: record.nextServiceDueDate,
    nextServiceDueOdometer:
      record.nextServiceDueOdometer !== null
        ? moneyToJson(record.nextServiceDueOdometer)
        : null,
    notes: record.notes,
    partsUsed: record.partsUsed.map(toServicePartUsageDto),
    createdAt: timestampToIso(record.createdAt),
  };
}

function sortServiceRecords(
  items: ServiceRecordDocument[],
  page: PageRequest,
): ServiceRecordDocument[] {
  const factor = page.direction === 'ASC' ? 1 : -1;
  return [...items].sort((left, right) => {
    let primary = 0;
    switch (page.sortField) {
      case 'serviceDate':
        primary = left.serviceDate.localeCompare(right.serviceDate);
        break;
      case 'odometerReading':
        primary = compareBigInt(toScale4Units(left.odometerReading), toScale4Units(right.odometerReading));
        break;
      case 'labourCost':
        primary = compareBigInt(toScale4Units(left.labourCost), toScale4Units(right.labourCost));
        break;
      case 'totalCost':
        primary = compareBigInt(toScale4Units(left.totalCost), toScale4Units(right.totalCost));
        break;
      case 'status':
        primary = left.status.localeCompare(right.status);
        break;
      case 'nextServiceDueDate':
        primary = (left.nextServiceDueDate ?? '').localeCompare(right.nextServiceDueDate ?? '');
        break;
      case 'createdAt':
        primary = compareTimestamps(left.createdAt, right.createdAt);
        break;
      default:
        primary = left.serviceDate.localeCompare(right.serviceDate);
        break;
    }
    if (primary !== 0) {
      return primary * factor;
    }
    return left.id.localeCompare(right.id) * factor;
  });
}

export class ServicingRepository {
  constructor(private readonly firestore: Firestore) {}

  appUserRef(userId: string) {
    return this.firestore.collection(APP_USERS).doc(userId);
  }

  bikeRef(bikeId: string) {
    return this.firestore.collection(BIKES).doc(bikeId);
  }

  serviceRecordRef(serviceId: string) {
    return this.firestore.collection(SERVICE_RECORDS).doc(serviceId);
  }

  servicePartUsageRef(usageId: string) {
    return this.firestore.collection(SERVICE_PART_USAGE).doc(usageId);
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

  readBike(snapshot: FirebaseFirestore.DocumentSnapshot): BikeDocument {
    if (!snapshot.exists) {
      throw new NotFoundError('Motorbike', snapshot.id);
    }
    return servicingBikeFrom(snapshot.id, snapshot.data() ?? {});
  }

  async getServiceRecordById(serviceId: string): Promise<ServiceRecordDocument> {
    const snapshot = await this.serviceRecordRef(serviceId).get();
    if (!snapshot.exists) {
      throw new NotFoundError('Service record', serviceId);
    }
    return serviceRecordFrom(snapshot.id, snapshot.data() ?? {});
  }

  async getServicesForBike(bikeId: string): Promise<ServiceRecordDocument[]> {
    const snapshot = await this.firestore
      .collection(SERVICE_RECORDS)
      .where('bikeId', '==', bikeId)
      .orderBy('serviceDate', 'desc')
      .orderBy(FieldPath.documentId(), 'desc')
      .get();
    return snapshot.docs.map((doc) => serviceRecordFrom(doc.id, doc.data()));
  }

  async getDueServices(targetDate: string): Promise<ServiceRecordDocument[]> {
    const snapshot = await this.firestore
      .collection(SERVICE_RECORDS)
      .where('nextServiceDueDate', '<=', targetDate)
      .orderBy('nextServiceDueDate', 'asc')
      .orderBy(FieldPath.documentId(), 'asc')
      .get();
    return snapshot.docs.map((doc) => serviceRecordFrom(doc.id, doc.data()));
  }

  private async paginateIndexedQuery(
    baseQuery: Query,
    page: PageRequest,
  ): Promise<{ items: ServiceRecordDocument[]; totalElements: number }> {
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
          items: snapshot.docs.map((doc) => serviceRecordFrom(doc.id, doc.data())),
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

  async pageServices(
    filters: ServiceSearchFilters,
    page: PageRequest,
  ): Promise<{ items: ServiceRecordDocument[]; totalElements: number }> {
    let baseQuery: Query = this.firestore.collection(SERVICE_RECORDS);
    if (filters.bikeId) {
      baseQuery = baseQuery.where('bikeId', '==', filters.bikeId);
    }
    if (filters.status) {
      baseQuery = baseQuery.where('status', '==', filters.status);
    }
    if (filters.startDate) {
      baseQuery = baseQuery.where('serviceDate', '>=', filters.startDate);
    }
    if (filters.endDate) {
      baseQuery = baseQuery.where('serviceDate', '<=', filters.endDate);
    }

    if (page.sortField === 'serviceDate') {
      return this.paginateIndexedQuery(baseQuery, page);
    }

    const snapshot = await baseQuery.limit(MAX_SEARCH_SCAN_DOCS + 1).get();
    if (snapshot.size > MAX_SEARCH_SCAN_DOCS) {
      throw new UnprocessableEntityError(
        `Service records query scanned more than ${MAX_SEARCH_SCAN_DOCS} candidate documents; refine filters or use default serviceDate sort`,
      );
    }

    const candidates = snapshot.docs.map((doc) => serviceRecordFrom(doc.id, doc.data()));
    const sorted = sortServiceRecords(candidates, page);
    const offset = page.page * page.size;
    return {
      items: sorted.slice(offset, offset + page.size),
      totalElements: sorted.length,
    };
  }
}
