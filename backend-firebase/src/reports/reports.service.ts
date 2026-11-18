import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type {
  BikeDocument,
  PaymentAllocationDocument,
  PaymentDocument,
  RentalDocument,
  ServiceRecordDocument,
  StockMovementDocument,
} from '../domain/types.js';
import { parseDate, todayBucharest } from '../shared/dates.js';
import {
  minorToScale4Units,
  minorUnitsToJson,
  multiplyMinorToScale4Units,
  scale4UnitsToJson,
  toMinorUnits,
} from '../shared/money.js';
import { ReportsRepository } from './reports.repository.js';
import {
  REPORT_CURRENCIES,
  type BikeRoiDto,
  type CurrencyAmountMap,
  type DashboardKpiDto,
  type DateRangeReportDto,
  type FleetUtilizationDto,
  type ReportCurrency,
} from './reports.types.js';
import { parseBikeRoiIdParam, parseDateRangeQuery } from './reports.validation.js';

function createCurrencyBigIntMap(): Record<ReportCurrency, bigint> {
  return { RON: 0n, EUR: 0n, USD: 0n };
}

function normalizeReportCurrency(currency: unknown): ReportCurrency | null {
  if (typeof currency !== 'string') return null;
  const normalized = currency.trim().toUpperCase();
  return (REPORT_CURRENCIES as readonly string[]).includes(normalized)
    ? (normalized as ReportCurrency)
    : null;
}

function addCurrencyUnits(
  target: Record<ReportCurrency, bigint>,
  currency: unknown,
  units: bigint,
): void {
  const key = normalizeReportCurrency(currency);
  if (key !== null) {
    target[key] += units;
  }
}

function serializeMinorMap(source: Record<ReportCurrency, bigint>): CurrencyAmountMap {
  return {
    RON: minorUnitsToJson(source.RON),
    EUR: minorUnitsToJson(source.EUR),
    USD: minorUnitsToJson(source.USD),
  };
}

function serializeScale4Map(source: Record<ReportCurrency, bigint>): CurrencyAmountMap {
  return {
    RON: scale4UnitsToJson(source.RON),
    EUR: scale4UnitsToJson(source.EUR),
    USD: scale4UnitsToJson(source.USD),
  };
}

function isInDateRange(date: string | null | undefined, fromDate: string, toDate: string): boolean {
  if (!date) return false;
  return date >= fromDate && date <= toDate;
}

export function timestampToUtcDate(value: unknown): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString().slice(0, 10);
  }
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString().slice(0, 10);
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  return null;
}

function safeMinor(value: unknown): bigint {
  if (value === undefined || value === null) return 0n;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? toMinorUnits(trimmed) : 0n;
  }
  if (typeof value === 'number') {
    return toMinorUnits(String(value));
  }
  return 0n;
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

export function computeFleetCounts(
  bikes: ReadonlyArray<Pick<BikeDocument, 'status' | 'isArchived'>>,
): {
  totalFleet: number;
  available: number;
  rented: number;
  inService: number;
} {
  let totalFleet = 0;
  let available = 0;
  let rented = 0;
  let inService = 0;

  for (const bike of bikes) {
    if (bike.isArchived) continue;
    totalFleet += 1;
    if (bike.status === 'AVAILABLE') available += 1;
    else if (bike.status === 'RENTED') rented += 1;
    else if (bike.status === 'IN_SERVICE') inService += 1;
  }

  return { totalFleet, available, rented, inService };
}

export function computeFleetUtilizationDto(
  bikes: ReadonlyArray<Pick<BikeDocument, 'status' | 'isArchived'>>,
): FleetUtilizationDto {
  const counts = computeFleetCounts(bikes);
  const utilizationRate =
    counts.totalFleet > 0 ? (counts.rented / counts.totalFleet) * 100.0 : 0.0;
  return {
    totalBikes: counts.totalFleet,
    rentedBikes: counts.rented,
    availableBikes: counts.available,
    inMaintenanceBikes: counts.inService,
    utilizationRate,
  };
}

export function computeDashboardKpiDto(params: {
  bikes: ReadonlyArray<Pick<BikeDocument, 'status' | 'isArchived'>>;
  overdueChargesCount: number;
  lowStockPartsCount: number;
  monthlyConfirmedPayments: ReadonlyArray<Pick<PaymentDocument, 'amount' | 'currency' | 'status' | 'paymentDate'>>;
  monthStartDate?: string;
  monthEndDate?: string;
}): DashboardKpiDto {
  const counts = computeFleetCounts(params.bikes);
  const revenueMinor = createCurrencyBigIntMap();

  for (const payment of params.monthlyConfirmedPayments) {
    if (payment.status !== 'CONFIRMED') continue;
    if (
      params.monthStartDate &&
      params.monthEndDate &&
      !isInDateRange(payment.paymentDate, params.monthStartDate, params.monthEndDate)
    ) {
      continue;
    }
    addCurrencyUnits(revenueMinor, payment.currency, safeMinor(payment.amount));
  }

  return {
    // Java ReportService.getDashboardKpis sets activeRentalsCount to non-archived RENTED bikes.
    activeRentalsCount: counts.rented,
    availableBikesCount: counts.available,
    inServiceBikesCount: counts.inService,
    totalFleetCount: counts.totalFleet,
    overdueChargesCount: params.overdueChargesCount,
    lowStockPartsCount: params.lowStockPartsCount,
    monthlyRevenue: serializeMinorMap(revenueMinor),
    // Java DashboardKpiDto initializes monthlyExpenses to zero and never populates it.
    monthlyExpenses: { RON: 0, EUR: 0, USD: 0 },
  };
}

export function computeDateRangeReportDto(params: {
  fromDate: string;
  toDate: string;
  rentals: ReadonlyArray<Pick<RentalDocument, 'startDate' | 'status'>>;
  confirmedPayments: ReadonlyArray<Pick<PaymentDocument, 'amount' | 'currency' | 'status' | 'paymentDate'>>;
  services: ReadonlyArray<Pick<ServiceRecordDocument, 'serviceDate' | 'labourCost' | 'labourCurrency' | 'partsUsed'>>;
  stockMovements: ReadonlyArray<Pick<StockMovementDocument, 'createdAt' | 'quantityDelta' | 'unitCost' | 'currency' | 'movementType'>>;
}): DateRangeReportDto {
  const { fromDate, toDate } = params;
  let totalRentals = 0;
  let activeRentals = 0;
  let closedRentals = 0;
  let serviceCount = 0;

  const revenueMinor = createCurrencyBigIntMap();
  const labourCostMinor = createCurrencyBigIntMap();
  const sparePartsCostScale4 = createCurrencyBigIntMap();
  let stockInQtyMinor = 0n;
  let stockOutQtyMinor = 0n;
  const stockInCostScale4 = createCurrencyBigIntMap();
  const stockOutCostScale4 = createCurrencyBigIntMap();

  for (const rental of params.rentals) {
    if (!isInDateRange(rental.startDate, fromDate, toDate)) continue;
    totalRentals += 1;
    if (rental.status === 'ACTIVE') activeRentals += 1;
    if (rental.status === 'CLOSED') closedRentals += 1;
  }

  for (const payment of params.confirmedPayments) {
    if (payment.status !== 'CONFIRMED') continue;
    if (!isInDateRange(payment.paymentDate, fromDate, toDate)) continue;
    addCurrencyUnits(revenueMinor, payment.currency, safeMinor(payment.amount));
  }

  for (const service of params.services) {
    if (!isInDateRange(service.serviceDate, fromDate, toDate)) continue;
    serviceCount += 1;
    addCurrencyUnits(labourCostMinor, service.labourCurrency, safeMinor(service.labourCost));
    for (const usage of service.partsUsed) {
      const partCostScale4 = multiplyMinorToScale4Units(
        safeMinor(usage.quantity),
        safeMinor(usage.unitCost),
      );
      addCurrencyUnits(sparePartsCostScale4, usage.currency, partCostScale4);
    }
  }

  for (const movement of params.stockMovements) {
    const createdDateUtc = timestampToUtcDate(movement.createdAt);
    if (!isInDateRange(createdDateUtc, fromDate, toDate)) continue;
    const quantityMinor = absBigInt(safeMinor(movement.quantityDelta));
    const costScale4 = multiplyMinorToScale4Units(quantityMinor, safeMinor(movement.unitCost));

    if (movement.movementType === 'STOCK_IN' || movement.movementType === 'RETURN') {
      stockInQtyMinor += quantityMinor;
      addCurrencyUnits(stockInCostScale4, movement.currency, costScale4);
    } else if (movement.movementType === 'STOCK_OUT' || movement.movementType === 'SERVICE_USAGE') {
      stockOutQtyMinor += quantityMinor;
      addCurrencyUnits(stockOutCostScale4, movement.currency, costScale4);
    }
  }

  return {
    totalRentals,
    activeRentals,
    closedRentals,
    serviceCount,
    revenue: serializeMinorMap(revenueMinor),
    labourCost: serializeMinorMap(labourCostMinor),
    sparePartsCost: serializeScale4Map(sparePartsCostScale4),
    stockInQuantity: { TOTAL: minorUnitsToJson(stockInQtyMinor) },
    stockOutQuantity: { TOTAL: minorUnitsToJson(stockOutQtyMinor) },
    stockInCost: serializeScale4Map(stockInCostScale4),
    stockOutCost: serializeScale4Map(stockOutCostScale4),
  };
}

/**
 * Computes BikeRoiDto from confirmed direct rental payments (`rentalId !== null`)
 * and confirmed customer-level (`rentalId === null`) payment allocations to the bike's charges,
 * using exact integer minor / scale-4 fixed-point arithmetic without double-counting.
 */
export function computeBikeRoiDto(params: {
  bike: Pick<BikeDocument, 'id' | 'registrationNumber' | 'make' | 'model'>;
  payments: ReadonlyArray<Pick<PaymentDocument, 'amount' | 'currency' | 'status'>>;
  allocations?: ReadonlyArray<Pick<PaymentAllocationDocument, 'paymentId' | 'allocatedAmount' | 'currency'>>;
  allocationParentPayments?: ReadonlyMap<string, Pick<PaymentDocument, 'status' | 'rentalId'>>;
  services: ReadonlyArray<Pick<ServiceRecordDocument, 'labourCost' | 'labourCurrency' | 'partsUsed'>>;
}): BikeRoiDto {
  const revenueMinor = createCurrencyBigIntMap();
  const maintenanceScale4 = createCurrencyBigIntMap();
  const netProfitScale4 = createCurrencyBigIntMap();

  for (const payment of params.payments) {
    if (payment.status !== 'CONFIRMED') continue;
    addCurrencyUnits(revenueMinor, payment.currency, safeMinor(payment.amount));
  }

  if (params.allocations && params.allocationParentPayments) {
    for (const alloc of params.allocations) {
      const parent = params.allocationParentPayments.get(alloc.paymentId);
      if (!parent) continue;
      if (parent.status !== 'CONFIRMED') continue;
      if (parent.rentalId !== null) continue;
      addCurrencyUnits(revenueMinor, alloc.currency, safeMinor(alloc.allocatedAmount));
    }
  }

  for (const service of params.services) {
    addCurrencyUnits(
      maintenanceScale4,
      service.labourCurrency,
      minorToScale4Units(safeMinor(service.labourCost)),
    );
    for (const usage of service.partsUsed) {
      const partTotalScale4 = multiplyMinorToScale4Units(
        safeMinor(usage.quantity),
        safeMinor(usage.unitCost),
      );
      addCurrencyUnits(maintenanceScale4, usage.currency, partTotalScale4);
    }
  }

  for (const curr of REPORT_CURRENCIES) {
    netProfitScale4[curr] = minorToScale4Units(revenueMinor[curr]) - maintenanceScale4[curr];
  }

  return {
    bikeId: params.bike.id,
    registrationNumber: params.bike.registrationNumber,
    makeModel: `${params.bike.make} ${params.bike.model}`,
    totalRevenue: serializeMinorMap(revenueMinor),
    totalMaintenanceCost: serializeScale4Map(maintenanceScale4),
    netProfit: serializeScale4Map(netProfitScale4),
  };
}

export class ReportsService {
  private readonly repository: ReportsRepository;

  constructor(firestore: Firestore, repository?: ReportsRepository) {
    this.repository = repository ?? new ReportsRepository(firestore);
  }

  async getDashboardKpis(asOfDateOverride?: string, referenceDate?: Date): Promise<DashboardKpiDto> {
    const today = asOfDateOverride ? parseDate(asOfDateOverride, 'asOfDate') : todayBucharest(referenceDate);
    const startOfMonth = `${today.slice(0, 8)}01`;

    const [bikes, overdueChargesCount, lowStockPartsCount, monthlyConfirmedPayments] =
      await Promise.all([
        this.repository.listActiveBikes(),
        this.repository.countOverdueOrDueCharges(today),
        this.repository.countLowStockParts(),
        this.repository.listConfirmedPaymentsInDateRange(startOfMonth, today),
      ]);

    return computeDashboardKpiDto({
      bikes,
      overdueChargesCount,
      lowStockPartsCount,
      monthlyConfirmedPayments,
      monthStartDate: startOfMonth,
      monthEndDate: today,
    });
  }

  async getFleetUtilization(): Promise<FleetUtilizationDto> {
    const bikes = await this.repository.listActiveBikes();
    return computeFleetUtilizationDto(bikes);
  }

  async getDateRangeReport(rawQuery: Record<string, unknown>): Promise<DateRangeReportDto> {
    const { fromDate, toDate } = parseDateRangeQuery(rawQuery);
    const [rentals, confirmedPayments, services, stockMovements] = await Promise.all([
      this.repository.listRentalsInDateRange(fromDate, toDate),
      this.repository.listConfirmedPaymentsInDateRange(fromDate, toDate),
      this.repository.listServicesInDateRange(fromDate, toDate),
      this.repository.listStockMovementsInDateRange(fromDate, toDate),
    ]);

    return computeDateRangeReportDto({
      fromDate,
      toDate,
      rentals,
      confirmedPayments,
      services,
      stockMovements,
    });
  }

  async getBikeRoi(rawBikeId: unknown): Promise<BikeRoiDto> {
    const bikeId = parseBikeRoiIdParam(rawBikeId);
    const bike = await this.repository.getBikeOrThrow(bikeId);
    const [rentalIds, chargeIds, services] = await Promise.all([
      this.repository.listRentalIdsForBike(bikeId),
      this.repository.listChargeIdsForBike(bikeId),
      this.repository.listServicesForBike(bikeId),
    ]);

    const [payments, allocations] = await Promise.all([
      this.repository.listDirectPaymentsForRentals(rentalIds),
      this.repository.listAllocationsForCharges(chargeIds),
    ]);

    const uniqueParentPaymentIds = [...new Set(allocations.map((alloc) => alloc.paymentId))];
    const allocationParentPayments = await this.repository.getPaymentsByIds(uniqueParentPaymentIds);

    return computeBikeRoiDto({
      bike,
      payments,
      allocations,
      allocationParentPayments,
      services,
    });
  }
}
