import type { DocumentData, Timestamp } from 'firebase-admin/firestore';

export type BikeStatus = 'AVAILABLE' | 'RENTED' | 'IN_SERVICE' | 'INACTIVE';
export type RentalStatus = 'ACTIVE' | 'CLOSED' | 'CANCELLED';
export type ChargeStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
export type Currency = 'RON' | 'EUR' | 'USD';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER';
export type PaymentStatus = 'CONFIRMED' | 'REVERSED';
export type AllocationMode = 'AUTO_FIFO' | 'MANUAL';
export type StockMovementType =
  | 'STOCK_IN'
  | 'STOCK_OUT'
  | 'SERVICE_USAGE'
  | 'RETURN'
  | 'ADJUSTMENT'
  | 'REVERSAL';
export type ServiceStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface BikeDocument {
  id: string;
  registrationNumber: string;
  vin: string;
  make: string;
  model: string;
  manufactureYear?: number;
  status: BikeStatus;
  isArchived: boolean;
  currentOdometer?: string;
  itpExpiryDate?: string | null;
  rcaExpiryDate?: string | null;
  cascoExpiryDate?: string | null;
  serviceIntervalDays?: number;
  nextServiceDueDate?: string | null;
  notes?: string | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CustomerDocument {
  id: string;
  fullName: string;
  phone: string;
  email?: string | null;
  cnpOrTaxId?: string | null;
  dateOfBirth?: string | null;
  livingCity?: string | null;
  drivingLicenceNumber?: string | null;
  licenceCategories?: string | null;
  licenceExpiryDate?: string | null;
  address?: string | null;
  gdprConsentDate?: string | null;
  notes?: string | null;
  isArchived: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface RentalDocument {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  bikeId: string;
  bikeRegistrationNumber: string;
  bikeMakeModel: string;
  startDate: string;
  plannedEndDate: string | null;
  actualClosedDate: string | null;
  weeklyRate: string;
  currency: Currency;
  depositAmount: string;
  depositCurrency: Currency;
  paymentFrequency: 'WEEKLY';
  scheduleAnchorDay: string;
  status: RentalStatus;
  termsAndNotes: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ChargeDocument {
  id: string;
  rentalId: string;
  customerId: string;
  bikeId: string;
  chargeSequence: number;
  periodStartDate: string;
  periodEndDate: string;
  dueDate: string;
  amount: string;
  currency: Currency;
  status: ChargeStatus;
  paidAmount: string;
  remainingAmount: string;
  notes: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PaymentDocument {
  id: string;
  customerId: string;
  customerName: string;
  rentalId: string | null;
  paymentDate: string;
  amount: string;
  currency: Currency;
  paymentMethod: PaymentMethod;
  referenceNumber: string | null;
  notes: string | null;
  status: PaymentStatus;
  recordedByUserId: string;
  recordedByUserName: string;
  allocationMode: AllocationMode;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PaymentAllocationDocument {
  id: string;
  paymentId: string;
  rentalChargeId: string;
  chargeSequence: number;
  chargeDueDate: string;
  allocatedAmount: string;
  currency: Currency;
  allocatedAt: Timestamp;
}

export interface PaymentReversalDocument {
  id: string;
  paymentId: string;
  reason: string;
  reversedByUserId: string;
  reversedAt: Timestamp;
  createdAt: Timestamp;
}

export interface PartDocument {
  id: string;
  partCode: string;
  name: string;
  category: string;
  description: string | null;
  unitOfMeasure: string;
  currentQuantity: string;
  currentQuantityMinor: number;
  minReorderLevel: string;
  defaultUnitCost: string;
  costCurrency: Currency;
  defaultSupplierId: string | null;
  defaultSupplierName: string | null;
  isLowStock: boolean;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface StockMovementDocument {
  id: string;
  partId: string;
  partCode: string;
  partName: string;
  quantityDelta: string;
  movementType: StockMovementType;
  referenceType: string | null;
  referenceId: string | null;
  unitCost: string;
  currency: Currency;
  reason: string | null;
  recordedByUserId: string;
  recordedByUserName: string;
  createdAt: Timestamp;
}

export interface SupplierDocument {
  id: string;
  name: string;
  nameNormalized: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  taxCui: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EmbeddedServicePartUsage {
  id: string;
  partId: string;
  partCode: string;
  partName: string;
  quantity: string;
  unitCost: string;
  currency: Currency;
  totalCost: string;
}

export interface ServiceRecordDocument {
  id: string;
  bikeId: string;
  bikeRegistrationNumber: string;
  bikeMakeModel: string;
  serviceDate: string;
  odometerReading: string;
  serviceProvider: string;
  workPerformed: string;
  labourCost: string;
  labourCurrency: Currency;
  partsCost: string;
  totalCost: string;
  status: ServiceStatus;
  nextServiceDueDate: string | null;
  nextServiceDueOdometer: string | null;
  notes: string | null;
  partsUsed: EmbeddedServicePartUsage[];
  recordedByUserId: string;
  recordedByUserName: string;
  completedAt?: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ServicePartUsageDocument {
  id: string;
  serviceRecordId: string;
  bikeId: string;
  partId: string;
  partCode: string;
  partName: string;
  quantity: string;
  unitCost: string;
  currency: Currency;
  totalCost: string;
  createdAt: Timestamp;
}

export function documentData<T extends DocumentData>(data: T): T {
  return data;
}
