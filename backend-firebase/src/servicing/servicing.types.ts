import type { Currency, ServiceStatus } from '../domain/types.js';
import type { ServicePartUsageInputItem } from '../inventory/inventory.types.js';

// PostgreSQL NUMERIC(10, 1) max value (999,999,999.9) represented in scale-2 minor units.
export const MAX_ODOMETER_MINOR = 99_999_999_990n;

export interface ServicePartUsageDto {
  id: string;
  partId: string;
  partCode: string;
  partName: string;
  quantity: number;
  unitCost: number;
  currency: Currency;
  totalCost: number;
}

export interface ServiceRecordDto {
  id: string;
  bikeId: string;
  bikeRegistrationNumber: string;
  motorbikeRegistrationNumber: string;
  bikeMakeModel: string;
  serviceDate: string;
  odometerReading: number;
  serviceProvider: string;
  workPerformed: string;
  labourCost: number;
  labourCurrency: Currency;
  partsCost: number;
  totalCost: number;
  status: ServiceStatus;
  nextServiceDueDate: string | null;
  nextServiceDueOdometer: number | null;
  notes: string | null;
  partsUsed: ServicePartUsageDto[];
  completedAt: string | null;
  createdAt: string;
}

export interface LogServiceInput {
  motorbikeId: string;
  serviceDate: string;
  odometerReading: string;
  odometerReadingMinor: bigint;
  serviceProvider: string;
  workPerformed: string;
  labourCost: string;
  labourCurrency: Currency;
  status: ServiceStatus;
  nextServiceDueDate: string | null;
  nextServiceDueOdometer: string | null;
  notes: string | null;
  partsUsed: ServicePartUsageInputItem[];
  rawPartsUsed: unknown;
}

export interface ServiceSearchFilters {
  bikeId?: string;
  status?: ServiceStatus;
  startDate?: string;
  endDate?: string;
}
