import { randomUUID } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { AuthenticatedUser } from '../auth/types.js';
import {
  documentData,
  type BikeDocument,
  type EmbeddedServicePartUsage,
  type ServicePartUsageDocument,
  type ServiceRecordDocument,
} from '../domain/types.js';
import { InventoryService } from '../inventory/inventory.service.js';
import {
  assertTransactionBudget,
  type PlannedWriteEntry,
} from '../inventory/inventory.validation.js';
import { addDays } from '../shared/dates.js';
import { BusinessError, NotFoundError } from '../shared/errors.js';
import { toMinorUnits } from '../shared/money.js';
import { toPage, type PageResponse } from '../shared/pagination.js';
import {
  BIKES,
  SERVICE_PART_USAGE,
  SERVICE_RECORDS,
  ServicingRepository,
  serviceRecordFrom,
  toServiceRecordDto,
} from './servicing.repository.js';
import type { ServiceRecordDto } from './servicing.types.js';
import {
  computePartUsageTotalCost,
  computeServiceCostTotals,
  parseDueServicesQuery,
  parseLogServiceInput,
  parseServiceSearchQuery,
  parseUpdateServiceStatusInput,
} from './servicing.validation.js';

export class ServicingService {
  private readonly repository: ServicingRepository;
  private readonly inventoryService: InventoryService;

  constructor(
    private readonly firestore: Firestore,
    inventoryService?: InventoryService,
  ) {
    this.repository = new ServicingRepository(firestore);
    this.inventoryService = inventoryService ?? new InventoryService(firestore);
  }

  async logService(rawBody: unknown, authUser: AuthenticatedUser): Promise<ServiceRecordDto> {
    const input = parseLogServiceInput(rawBody);

    return this.firestore.runTransaction(async (tx) => {
      const now = Timestamp.now();
      const serviceRecordId = randomUUID();
      const bikeRef = this.repository.bikeRef(input.motorbikeId);
      const userRef = this.repository.appUserRef(authUser.id);
      const serviceRecordRef = this.repository.serviceRecordRef(serviceRecordId);

      // Complete all primary document reads strictly before any inventory or servicing writes.
      const [bikeSnap, userSnap] = await Promise.all([
        tx.get(bikeRef),
        tx.get(userRef),
      ]);

      const auditUser = this.repository.readAuditUser(userSnap);
      const bike = this.repository.readBike(bikeSnap);

      if (bike.isArchived) {
        throw new BusinessError('Cannot log service for an archived motorbike');
      }

      const currentOdometer = bike.currentOdometer ?? '0.00';
      const currentOdometerMinor = toMinorUnits(currentOdometer);
      if (input.odometerReadingMinor < currentOdometerMinor) {
        throw new BusinessError(
          `Service odometer reading (${input.odometerReading}) cannot be less than current motorbike odometer (${currentOdometer})`,
        );
      }

      // Prepare spare-part deductions still inside the read phase (performs tx.getAll only; zero writes until applyWrites).
      const deductionPlan = await this.inventoryService.prepareServicePartDeductionsInTx(tx, {
        rawPartsUsed: input.rawPartsUsed,
        serviceRecordId,
        bikeRegistrationNumber: bike.registrationNumber,
        recordedByUserId: auditUser.id,
        recordedByUserName: auditUser.fullName,
        now,
      });

      const intervalDays =
        bike.serviceIntervalDays && bike.serviceIntervalDays > 0
          ? bike.serviceIntervalDays
          : 30;
      const nextServiceDueDate =
        input.nextServiceDueDate ?? addDays(input.serviceDate, intervalDays);

      const embeddedPartsUsed: EmbeddedServicePartUsage[] = [];
      const usageWriteOps: Array<{
        ref: FirebaseFirestore.DocumentReference;
        doc: ServicePartUsageDocument;
      }> = [];
      const allPlannedWrites: PlannedWriteEntry[] = [];

      for (const movement of deductionPlan.movements) {
        const usageId = randomUUID();
        const { totalCost } = computePartUsageTotalCost(movement.quantity, movement.unitCost);
        const embedded: EmbeddedServicePartUsage = {
          id: usageId,
          partId: movement.partId,
          partCode: movement.partCode,
          partName: movement.partName,
          quantity: movement.quantity,
          unitCost: movement.unitCost,
          currency: movement.currency,
          totalCost,
        };
        const usageDoc: ServicePartUsageDocument = {
          id: usageId,
          serviceRecordId,
          bikeId: bike.id,
          partId: movement.partId,
          partCode: movement.partCode,
          partName: movement.partName,
          quantity: movement.quantity,
          unitCost: movement.unitCost,
          currency: movement.currency,
          totalCost,
          createdAt: now,
        };
        embeddedPartsUsed.push(embedded);
        usageWriteOps.push({
          ref: this.repository.servicePartUsageRef(usageId),
          doc: usageDoc,
        });
        allPlannedWrites.push({
          path: `${SERVICE_PART_USAGE}/${usageId}`,
          data: usageDoc as unknown as Record<string, unknown>,
        });
      }

      const { partsCost, totalCost } = computeServiceCostTotals(
        input.labourCost,
        input.labourCurrency,
        embeddedPartsUsed,
      );

      const serviceRecordDoc: ServiceRecordDocument = {
        id: serviceRecordId,
        bikeId: bike.id,
        bikeRegistrationNumber: bike.registrationNumber,
        bikeMakeModel: `${bike.make} ${bike.model}`,
        serviceDate: input.serviceDate,
        odometerReading: input.odometerReading,
        serviceProvider: input.serviceProvider,
        workPerformed: input.workPerformed,
        labourCost: input.labourCost,
        labourCurrency: input.labourCurrency,
        partsCost,
        totalCost,
        status: input.status,
        nextServiceDueDate,
        nextServiceDueOdometer: input.nextServiceDueOdometer,
        notes: input.notes,
        partsUsed: embeddedPartsUsed,
        recordedByUserId: auditUser.id,
        recordedByUserName: auditUser.fullName,
        createdAt: now,
        updatedAt: now,
      };

      const bikeUpdates: Partial<BikeDocument> = {
        nextServiceDueDate,
        updatedAt: now,
      };
      if (input.odometerReadingMinor > currentOdometerMinor) {
        bikeUpdates.currentOdometer = input.odometerReading;
      }

      allPlannedWrites.push(
        {
          path: `${SERVICE_RECORDS}/${serviceRecordId}`,
          data: serviceRecordDoc as unknown as Record<string, unknown>,
        },
        {
          path: `${BIKES}/${bike.id}`,
          data: bikeUpdates as unknown as Record<string, unknown>,
        },
        ...deductionPlan.plannedWrites,
      );

      assertTransactionBudget(allPlannedWrites);

      // Write phase (atomic commit)
      tx.set(serviceRecordRef, documentData(serviceRecordDoc));
      tx.update(bikeRef, bikeUpdates);
      for (const op of usageWriteOps) {
        tx.set(op.ref, documentData(op.doc));
      }
      deductionPlan.applyWrites();

      return toServiceRecordDto(serviceRecordDoc);
    });
  }

  async getServiceById(serviceId: string): Promise<ServiceRecordDto> {
    const record = await this.repository.getServiceRecordById(serviceId);
    return toServiceRecordDto(record);
  }

  async getServicesForBike(bikeId: string): Promise<ServiceRecordDto[]> {
    const records = await this.repository.getServicesForBike(bikeId);
    return records.map(toServiceRecordDto);
  }

  async searchServices(rawQuery: Record<string, unknown>): Promise<PageResponse<ServiceRecordDto>> {
    const { filters, page } = parseServiceSearchQuery(rawQuery);
    const { items, totalElements } = await this.repository.pageServices(filters, page);
    return toPage(items.map(toServiceRecordDto), page, totalElements);
  }

  async getDueServices(rawQuery: Record<string, unknown>): Promise<ServiceRecordDto[]> {
    const targetDate = parseDueServicesQuery(rawQuery);
    const records = await this.repository.getDueServices(targetDate);
    return records.map(toServiceRecordDto);
  }

  async updateServiceStatus(
    serviceId: string,
    rawBody: unknown,
    authUser: AuthenticatedUser,
  ): Promise<ServiceRecordDto> {
    const input = parseUpdateServiceStatusInput(rawBody);

    return this.firestore.runTransaction(async (tx) => {
      const now = Timestamp.now();
      const serviceRef = this.repository.serviceRecordRef(serviceId);
      const userRef = this.repository.appUserRef(authUser.id);

      const [serviceSnap, userSnap] = await Promise.all([
        tx.get(serviceRef),
        tx.get(userRef),
      ]);

      this.repository.readAuditUser(userSnap);

      if (!serviceSnap.exists) {
        throw new NotFoundError('Service record', serviceId);
      }

      const existing = serviceRecordFrom(serviceSnap.id, serviceSnap.data() ?? {});
      if (existing.status !== 'PLANNED' && existing.status !== 'IN_PROGRESS') {
        throw new BusinessError(
          `Cannot mark service as COMPLETED from status ${existing.status}`,
        );
      }

      const updates = {
        status: input.status,
        completedAt: now,
        updatedAt: now,
      };
      tx.update(serviceRef, updates);

      return toServiceRecordDto({
        ...existing,
        ...updates,
      });
    });
  }
}
