import type { BikeStatus } from '../domain/types.js';
export { MAX_SEARCH_SCAN_DOCS } from '../inventory/inventory.types.js';
export { MAX_ODOMETER_MINOR } from '../servicing/servicing.types.js';

export interface BikeDto {
  id: string;
  registrationNumber: string;
  vin: string;
  make: string;
  model: string;
  manufactureYear: number;
  // Alias kept for mobile/Flutter BikeModel.fromJson compatibility alongside Java/React manufactureYear.
  yearOfManufacture: number;
  currentOdometer: number;
  itpExpiryDate: string | null;
  rcaExpiryDate: string | null;
  cascoExpiryDate: string | null;
  serviceIntervalDays: number;
  nextServiceDueDate: string | null;
  status: BikeStatus;
  notes: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDto {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  cnpOrTaxId: string | null;
  dateOfBirth: string | null;
  livingCity: string | null;
  drivingLicenceNumber: string | null;
  licenceCategories: string | null;
  licenceExpiryDate: string | null;
  address: string | null;
  gdprConsentDate: string | null;
  notes: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBikeInput {
  registrationNumber: string;
  vin: string;
  make: string;
  model: string;
  manufactureYear: number;
  currentOdometer: string;
  itpExpiryDate: string | null;
  rcaExpiryDate: string | null;
  cascoExpiryDate: string | null;
  serviceIntervalDays: number;
  status: BikeStatus;
  notes: string | null;
}

export interface UpdateBikeInput {
  registrationNumber: string;
  vin: string;
  make: string;
  model: string;
  manufactureYear: number;
  currentOdometer: string;
  itpExpiryDate: string | null;
  rcaExpiryDate: string | null;
  cascoExpiryDate: string | null;
  serviceIntervalDays: number | null;
  status: BikeStatus | null;
  notes: string | null;
}

export interface UpdateBikeStatusInput {
  status: BikeStatus;
}

export interface CreateCustomerInput {
  fullName: string;
  phone: string;
  email: string | null;
  cnpOrTaxId: string | null;
  dateOfBirth: string | null;
  livingCity: string | null;
  drivingLicenceNumber: string | null;
  licenceCategories: string;
  licenceExpiryDate: string | null;
  address: string | null;
  gdprConsentDate: string;
  notes: string | null;
}

export interface UpdateCustomerInput {
  fullName: string;
  phone: string;
  email: string | null;
  cnpOrTaxId: string | null;
  drivingLicenceNumber: string | null;
  licenceCategories: string | null;
  licenceExpiryDate: string | null;
  address: string | null;
  notes: string | null;
}

export interface BikeSearchFilters {
  search?: string;
  status?: BikeStatus;
  includeArchived: boolean;
}

export interface CustomerSearchFilters {
  search?: string;
  includeArchived: boolean;
}
