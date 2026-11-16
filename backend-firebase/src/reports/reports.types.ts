import type { Currency } from '../domain/types.js';

export const REPORT_CURRENCIES = ['RON', 'EUR', 'USD'] as const;
export const MAX_REPORT_SCAN_DOCS = 1000;

export type ReportCurrency = (typeof REPORT_CURRENCIES)[number];
export type CurrencyAmountMap = Record<Currency, number>;

export interface QuantityTotalMap {
  TOTAL: number;
}

export interface DashboardKpiDto {
  activeRentalsCount: number;
  availableBikesCount: number;
  inServiceBikesCount: number;
  totalFleetCount: number;
  overdueChargesCount: number;
  lowStockPartsCount: number;
  monthlyRevenue: CurrencyAmountMap;
  monthlyExpenses: CurrencyAmountMap;
}

export interface FleetUtilizationDto {
  totalBikes: number;
  rentedBikes: number;
  availableBikes: number;
  inMaintenanceBikes: number;
  utilizationRate: number;
}

export interface DateRangeReportDto {
  totalRentals: number;
  activeRentals: number;
  closedRentals: number;
  serviceCount: number;
  revenue: CurrencyAmountMap;
  labourCost: CurrencyAmountMap;
  sparePartsCost: CurrencyAmountMap;
  stockInQuantity: QuantityTotalMap;
  stockOutQuantity: QuantityTotalMap;
  stockInCost: CurrencyAmountMap;
  stockOutCost: CurrencyAmountMap;
}

export interface BikeRoiDto {
  bikeId: string;
  registrationNumber: string;
  makeModel: string;
  totalRevenue: CurrencyAmountMap;
  totalMaintenanceCost: CurrencyAmountMap;
  netProfit: CurrencyAmountMap;
}

export interface DateRangeQuery {
  fromDate: string;
  toDate: string;
}
