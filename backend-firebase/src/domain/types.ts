import type { DocumentData, Timestamp } from 'firebase-admin/firestore';

export type BikeStatus = 'AVAILABLE' | 'RENTED' | 'IN_SERVICE' | 'INACTIVE';
export type RentalStatus = 'ACTIVE' | 'CLOSED' | 'CANCELLED';
export type ChargeStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
export type Currency = 'RON' | 'EUR' | 'USD';

export interface BikeDocument {
  id: string;
  registrationNumber: string;
  vin: string;
  make: string;
  model: string;
  status: BikeStatus;
  isArchived: boolean;
}

export interface CustomerDocument {
  id: string;
  fullName: string;
  phone: string;
  isArchived: boolean;
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

export function documentData<T extends DocumentData>(data: T): T {
  return data;
}
