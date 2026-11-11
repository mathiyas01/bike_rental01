import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { AppConfig } from '../config/env.js';
import { BusinessError, ConflictError, NotFoundError, OperationalError, ValidationError } from '../shared/errors.js';
import { addDays, isBefore, parseDate, todayUtc } from '../shared/dates.js';
import {
  addMoney,
  maxZero,
  moneyToJson,
  normalizeMoney,
  subtractMoney,
} from '../shared/money.js';
import { parsePage, toPage, type PageResponse } from '../shared/pagination.js';
import { requireUuid } from '../shared/ids.js';
import type {
  BikeDocument,
  ChargeDocument,
  ChargeStatus,
  Currency,
  CustomerDocument,
  RentalDocument,
  RentalStatus,
} from '../domain/types.js';
import { RentalRepository } from './rental.repository.js';

const currencies = new Set<Currency>(['RON', 'EUR', 'USD']);
const rentalStatuses = new Set<RentalStatus>(['ACTIVE', 'CLOSED', 'CANCELLED']);
const chargeStatuses = new Set<ChargeStatus>(['UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED']);

export interface RentalDto {
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
  weeklyRate: number;
  currency: Currency;
  depositAmount: number;
  depositCurrency: Currency;
  paymentFrequency: 'WEEKLY';
  scheduleAnchorDay: string;
  status: RentalStatus;
  termsAndNotes: string | null;
  createdAt: string;
}

export interface RentalChargeDto {
  id: string;
  rentalId: string;
  chargeSequence: number;
  periodStartDate: string;
  periodEndDate: string;
  dueDate: string;
  amount: number;
  currency: Currency;
  status: ChargeStatus;
  paidAmount: number;
  remainingAmount: number;
  notes: string;
  createdAt: string;
}

interface CreateInput {
  customerId: string;
  motorbikeId: string;
  startDate: string;
  plannedEndDate: string | null;
  weeklyRate: string;
  currency: Currency;
  depositAmount: string;
  depositCurrency: Currency;
  scheduleAnchorDay: string;
  termsAndNotes: string | null;
}

interface UpdateInput extends Omit<CreateInput, 'customerId' | 'scheduleAnchorDay'> {}

function required(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError([{ field, rejectedValue: value ?? null, message: `${field} is required` }]);
  }
  return value;
}

function optionalDate(body: Record<string, unknown>, field: string): string | null {
  if (body[field] === undefined || body[field] === null || body[field] === '') return null;
  try {
    return parseDate(body[field], field);
  } catch (error) {
    throw new ValidationError([{ field, rejectedValue: body[field], message: String(error).replace(/^Error: /, '') }]);
  }
}

function currency(value: unknown, field: string): Currency {
  if (typeof value !== 'string' || !currencies.has(value as Currency)) {
    throw new ValidationError([{
      field,
      rejectedValue: value ?? null,
      message: 'Currency must be one of: RON, EUR, USD',
    }]);
  }
  return value as Currency;
}

function amount(value: unknown, field: string, minimum: number): string {
  try {
    return normalizeMoney(value, field, minimum);
  } catch (error) {
    throw new ValidationError([{
      field,
      rejectedValue: value ?? null,
      message: String(error).replace(/^Error: /, ''),
    }]);
  }
}

function id(body: Record<string, unknown>, field: string): string {
  const value = required(body, field);
  return requireUuid(value, field);
}

function createInput(body: Record<string, unknown>): CreateInput {
  const currencyValue = currency(body.currency, 'currency');
  const depositCurrency = body.depositCurrency === undefined || body.depositCurrency === null
    ? currencyValue
    : currency(body.depositCurrency, 'depositCurrency');
  return {
    customerId: id(body, 'customerId'),
    motorbikeId: id(body, 'motorbikeId'),
    startDate: (() => {
      try { return parseDate(body.startDate, 'startDate'); }
      catch (error) {
        throw new ValidationError([{ field: 'startDate', rejectedValue: body.startDate ?? null, message: String(error).replace(/^Error: /, '') }]);
      }
    })(),
    plannedEndDate: optionalDate(body, 'plannedEndDate'),
    weeklyRate: amount(body.weeklyRate, 'weeklyRate', 0.01),
    currency: currencyValue,
    depositAmount: body.depositAmount === undefined || body.depositAmount === null
      ? '0.00'
      : amount(body.depositAmount, 'depositAmount', 0),
    depositCurrency,
    scheduleAnchorDay: body.scheduleAnchorDay === undefined || body.scheduleAnchorDay === null
      ? 'START_DAY'
      : String(body.scheduleAnchorDay),
    termsAndNotes: body.termsAndNotes === undefined || body.termsAndNotes === null
      ? null
      : String(body.termsAndNotes),
  };
}

function updateInput(body: Record<string, unknown>): UpdateInput {
  const input = createInput({
    ...body,
    customerId: '00000000-0000-4000-8000-000000000000',
  });
  return input;
}

function timestamp(value: Timestamp): string {
  return value.toDate().toISOString();
}

function rentalDto(rental: RentalDocument): RentalDto {
  return {
    id: rental.id,
    customerId: rental.customerId,
    customerName: rental.customerName,
    customerPhone: rental.customerPhone,
    bikeId: rental.bikeId,
    bikeRegistrationNumber: rental.bikeRegistrationNumber,
    bikeMakeModel: rental.bikeMakeModel,
    startDate: rental.startDate,
    plannedEndDate: rental.plannedEndDate,
    actualClosedDate: rental.actualClosedDate,
    weeklyRate: moneyToJson(rental.weeklyRate),
    currency: rental.currency,
    depositAmount: moneyToJson(rental.depositAmount),
    depositCurrency: rental.depositCurrency,
    paymentFrequency: rental.paymentFrequency,
    scheduleAnchorDay: rental.scheduleAnchorDay,
    status: rental.status,
    termsAndNotes: rental.termsAndNotes,
    createdAt: timestamp(rental.createdAt),
  };
}

function chargeDto(charge: ChargeDocument, paid: string): RentalChargeDto {
  const remaining = maxZero(subtractMoney(charge.amount, paid));
  return {
    id: charge.id,
    rentalId: charge.rentalId,
    chargeSequence: charge.chargeSequence,
    periodStartDate: charge.periodStartDate,
    periodEndDate: charge.periodEndDate,
    dueDate: charge.dueDate,
    amount: moneyToJson(charge.amount),
    currency: charge.currency,
    status: charge.status,
    paidAmount: moneyToJson(paid),
    remainingAmount: moneyToJson(remaining),
    notes: charge.notes,
    createdAt: timestamp(charge.createdAt),
  };
}

function compareValue(left: unknown, right: unknown): number {
  return String(left ?? '').localeCompare(String(right ?? ''));
}

export class RentalService {
  private readonly repository: RentalRepository;

  constructor(
    private readonly firestore: Firestore,
    private readonly _config: AppConfig,
  ) {
    this.repository = new RentalRepository(firestore);
  }

  async create(body: Record<string, unknown>): Promise<RentalDto> {
    const input = createInput(body);
    if (input.plannedEndDate && isBefore(input.plannedEndDate, input.startDate)) {
      throw new BusinessError('Planned end date cannot be earlier than rental start date');
    }
    let result!: RentalDocument;
    await this.firestore.runTransaction(async (transaction) => {
      const customerSnapshot = await transaction.get(this.repository.customerReference(input.customerId));
      const bikeSnapshot = await transaction.get(this.repository.bikeReference(input.motorbikeId));
      const lockSnapshot = await transaction.get(this.repository.activeLockReference(input.motorbikeId));
      const customer = this.repository.readCustomer(customerSnapshot);
      const bike = this.repository.readBike(bikeSnapshot);
      if (customer.isArchived) throw new BusinessError('Cannot create a rental for an archived customer');
      RentalRepository.ensureAvailableBike(bike);
      if (lockSnapshot.exists) {
        throw new ConflictError(`Motorbike ${bike.registrationNumber} already has an active rental agreement`);
      }
      const now = RentalRepository.timestamp();
      const rentalId = RentalRepository.newId();
      const firstChargeId = this.repository.chargeReference(rentalId, 1);
      const period = RentalRepository.nextPeriod(input.startDate);
      result = {
        id: rentalId,
        customerId: customer.id,
        customerName: customer.fullName,
        customerPhone: customer.phone,
        bikeId: bike.id,
        bikeRegistrationNumber: bike.registrationNumber,
        bikeMakeModel: `${bike.make} ${bike.model}`,
        startDate: input.startDate,
        plannedEndDate: input.plannedEndDate,
        actualClosedDate: null,
        weeklyRate: input.weeklyRate,
        currency: input.currency,
        depositAmount: input.depositAmount,
        depositCurrency: input.depositCurrency,
        paymentFrequency: 'WEEKLY',
        scheduleAnchorDay: input.scheduleAnchorDay,
        status: 'ACTIVE',
        termsAndNotes: input.termsAndNotes,
        createdAt: now,
        updatedAt: now,
      };
      transaction.create(this.repository.rentalReference(rentalId), result);
      transaction.create(this.repository.activeLockReference(bike.id), {
        rentalId,
        status: 'ACTIVE',
        version: 1,
        createdAt: now,
      });
      transaction.update(this.repository.bikeReference(bike.id), {
        status: 'RENTED',
        updatedAt: now,
      });
      transaction.create(firstChargeId, {
        id: firstChargeId.id,
        rentalId,
        customerId: customer.id,
        bikeId: bike.id,
        chargeSequence: 1,
        periodStartDate: input.startDate,
        periodEndDate: period.end,
        dueDate: input.startDate,
        amount: input.weeklyRate,
        currency: input.currency,
        status: 'UNPAID',
        paidAmount: '0.00',
        remainingAmount: input.weeklyRate,
        notes: 'Initial weekly charge on contract start',
        createdAt: now,
        updatedAt: now,
      });
      transaction.create(this.repository.cursorReference(rentalId), {
        nextSequence: 2,
        nextPeriodStart: period.next,
        updatedAt: now,
      });
    });
    return rentalDto(result);
  }

  async close(rentalId: string, body: Record<string, unknown>): Promise<RentalDto> {
    const closureDate = (() => {
      try { return parseDate(body.closureDate, 'closureDate'); }
      catch (error) {
        throw new ValidationError([{ field: 'closureDate', rejectedValue: body.closureDate ?? null, message: String(error).replace(/^Error: /, '') }]);
      }
    })();
    const notes = body.notes === undefined || body.notes === null ? null : String(body.notes);
    let result!: RentalDocument;
    await this.firestore.runTransaction(async (transaction) => {
      const rentalSnapshot = await transaction.get(this.repository.rentalReference(rentalId));
      const rental = this.repository.readRental(rentalSnapshot);
      const bikeSnapshot = await transaction.get(this.repository.bikeReference(rental.bikeId));
      const lockSnapshot = await transaction.get(this.repository.activeLockReference(rental.bikeId));
      const bike = this.repository.readBike(bikeSnapshot);
      if (rental.status !== 'ACTIVE') {
        throw new BusinessError(`Rental agreement is not active (current status: ${rental.status})`);
      }
      if (isBefore(closureDate, rental.startDate)) {
        throw new BusinessError('Closure date cannot be earlier than rental start date');
      }
      const now = RentalRepository.timestamp();
      const termsAndNotes = notes && notes.trim()
        ? `${rental.termsAndNotes ? `${rental.termsAndNotes}\n` : ''}[Closed on ${closureDate}]: ${notes}`
        : rental.termsAndNotes;
      result = { ...rental, actualClosedDate: closureDate, status: 'CLOSED', termsAndNotes, updatedAt: now };
      transaction.update(this.repository.rentalReference(rental.id), {
        actualClosedDate: closureDate,
        status: 'CLOSED',
        termsAndNotes,
        updatedAt: now,
      });
      if (bike.status === 'RENTED') {
        transaction.update(this.repository.bikeReference(bike.id), { status: 'AVAILABLE', updatedAt: now });
      }
      if (lockSnapshot.exists && lockSnapshot.data()?.rentalId === rental.id) {
        transaction.delete(this.repository.activeLockReference(bike.id));
      } else {
        throw new ConflictError('Active rental lock is missing or belongs to another rental');
      }
    });
    return rentalDto(result);
  }

  async update(rentalId: string, body: Record<string, unknown>): Promise<RentalDto> {
    const input = updateInput(body);
    if (input.plannedEndDate && isBefore(input.plannedEndDate, input.startDate)) {
      throw new BusinessError('Planned end date cannot be earlier than rental start date');
    }
    let result!: RentalDocument;
    await this.firestore.runTransaction(async (transaction) => {
      const rentalSnapshot = await transaction.get(this.repository.rentalReference(rentalId));
      const rental = this.repository.readRental(rentalSnapshot);
      const oldBikeSnapshot = await transaction.get(this.repository.bikeReference(rental.bikeId));
      const oldBike = this.repository.readBike(oldBikeSnapshot);
      const targetIsSame = rental.bikeId === input.motorbikeId;
      const newBikeSnapshot = targetIsSame
        ? oldBikeSnapshot
        : await transaction.get(this.repository.bikeReference(input.motorbikeId));
      const newBike = this.repository.readBike(newBikeSnapshot);
      const oldLockSnapshot = await transaction.get(this.repository.activeLockReference(oldBike.id));
      const newLockSnapshot = targetIsSame
        ? oldLockSnapshot
        : await transaction.get(this.repository.activeLockReference(newBike.id));
      if (rental.status !== 'ACTIVE') throw new BusinessError('Only active rental agreements can be edited');
      if (oldBike.status !== 'RENTED' ||
          !oldLockSnapshot.exists ||
          oldLockSnapshot.data()?.rentalId !== rental.id) {
        throw new ConflictError('Active rental lock is missing or belongs to another rental');
      }
      if (!targetIsSame) {
        if (newBike.isArchived) {
          throw new BusinessError('Cannot assign an archived motorbike');
        }
        RentalRepository.ensureAvailableBike(newBike);
        if (newLockSnapshot.exists) {
          throw new ConflictError(`Motorbike ${newBike.registrationNumber} is not available for this rental`);
        }
      }
      const now = RentalRepository.timestamp();
      result = {
        ...rental,
        bikeId: newBike.id,
        bikeRegistrationNumber: newBike.registrationNumber,
        bikeMakeModel: `${newBike.make} ${newBike.model}`,
        startDate: input.startDate,
        plannedEndDate: input.plannedEndDate,
        weeklyRate: input.weeklyRate,
        currency: input.currency,
        depositAmount: input.depositAmount,
        depositCurrency: input.depositCurrency,
        termsAndNotes: input.termsAndNotes,
        updatedAt: now,
      };
      transaction.update(this.repository.rentalReference(rental.id), result);
      if (!targetIsSame) {
        transaction.update(this.repository.bikeReference(oldBike.id), { status: 'AVAILABLE', updatedAt: now });
        transaction.update(this.repository.bikeReference(newBike.id), { status: 'RENTED', updatedAt: now });
        transaction.delete(this.repository.activeLockReference(oldBike.id));
        transaction.create(this.repository.activeLockReference(newBike.id), {
          rentalId: rental.id,
          status: 'ACTIVE',
          version: 1,
          createdAt: now,
        });
      }
    });
    return rentalDto(result);
  }

  async get(rentalId: string): Promise<RentalDto> {
    const snapshot = await this.repository.rentalReference(rentalId).get();
    return rentalDto(this.repository.readRental(snapshot));
  }

  async list(query: Record<string, unknown>): Promise<PageResponse<RentalDto>> {
    const page = parsePage(query, 'startDate', ['startDate', 'createdAt', 'status']);
    const status = query.status === undefined ? undefined : String(query.status);
    if (status && !rentalStatuses.has(status as RentalStatus)) {
      throw new ValidationError([{ field: 'status', rejectedValue: status, message: 'Invalid rental status' }]);
    }
    const customerId = query.customerId === undefined ? undefined : String(query.customerId);
    const bikeId = query.bikeId === undefined ? undefined : String(query.bikeId);
    const result = await this.repository.pageRentals({
      ...(status ? { status } : {}),
      ...(customerId ? { customerId } : {}),
      ...(bikeId ? { bikeId } : {}),
    }, page);
    return toPage(result.items.map(rentalDto), page, result.totalElements);
  }

  async generateNext(rentalId: string): Promise<{ dto: RentalChargeDto; created: boolean }> {
    let result!: ChargeDocument;
    let created = false;
    await this.firestore.runTransaction(async (transaction) => {
      const rentalSnapshot = await transaction.get(this.repository.rentalReference(rentalId));
      const rental = this.repository.readRental(rentalSnapshot);
      const cursorSnapshot = await transaction.get(this.repository.cursorReference(rentalId));
      let sequence: number;
      let periodStart: string;
      if (cursorSnapshot.exists) {
        sequence = Number(cursorSnapshot.data()?.nextSequence);
        periodStart = String(cursorSnapshot.data()?.nextPeriodStart);
      } else {
        const latestSnapshot = await transaction.get(
          this.firestore.collection('rental_charges')
            .where('rentalId', '==', rentalId)
            .orderBy('chargeSequence', 'desc')
            .limit(1),
        );
        const latest = latestSnapshot.docs[0];
        const latestCharge = latest ? this.repository.readCharge(latest) : undefined;
        sequence = latestCharge ? latestCharge.chargeSequence + 1 : 1;
        periodStart = latestCharge ? addDays(latestCharge.periodEndDate, 1) : rental.startDate;
      }
      if (rental.status === 'CANCELLED') {
        throw new BusinessError('Cannot generate charges for a cancelled rental');
      }
      if (rental.actualClosedDate && isBefore(rental.actualClosedDate, periodStart)) {
        throw new BusinessError(`Cannot generate charge after rental actual closed date: ${rental.actualClosedDate}`);
      }
      const chargeReference = this.repository.chargeReference(rentalId, sequence);
      const existing = await transaction.get(chargeReference);
      if (existing.exists) {
        result = this.repository.readCharge(existing);
        return;
      }
      const period = RentalRepository.nextPeriod(periodStart);
      const now = RentalRepository.timestamp();
      result = {
        id: chargeReference.id,
        rentalId,
        customerId: rental.customerId,
        bikeId: rental.bikeId,
        chargeSequence: sequence,
        periodStartDate: periodStart,
        periodEndDate: period.end,
        dueDate: periodStart,
        amount: rental.weeklyRate,
        currency: rental.currency,
        status: 'UNPAID',
        paidAmount: '0.00',
        remainingAmount: rental.weeklyRate,
        notes: `Recurring weekly charge #${sequence}`,
        createdAt: now,
        updatedAt: now,
      };
      transaction.create(chargeReference, result);
      transaction.set(this.repository.cursorReference(rentalId), {
        nextSequence: sequence + 1,
        nextPeriodStart: period.next,
        updatedAt: now,
      });
      created = true;
    });
    return { dto: chargeDto(result, result.paidAmount), created };
  }

  async generateUpToDate(rentalId: string, targetDateValue: unknown): Promise<RentalChargeDto[]> {
    let targetDate: string;
    try { targetDate = parseDate(targetDateValue, 'targetDate'); }
    catch (error) {
      throw new ValidationError([{ field: 'targetDate', rejectedValue: targetDateValue ?? null, message: String(error).replace(/^Error: /, '') }]);
    }
    const generated: RentalChargeDto[] = [];
    for (let count = 0; count < 1000; count += 1) {
      const rental = this.repository.readRental(await this.repository.rentalReference(rentalId).get());
      const cursor = await this.repository.cursorReference(rentalId).get();
      const nextStart = cursor.exists ? String(cursor.data()?.nextPeriodStart) : rental.startDate;
      if (isBefore(targetDate, nextStart) || (rental.actualClosedDate && isBefore(rental.actualClosedDate, nextStart))) break;
      const next = await this.generateNext(rentalId);
      if (!next.created) break;
      generated.push(next.dto);
    }
    const rental = this.repository.readRental(await this.repository.rentalReference(rentalId).get());
    const cursor = await this.repository.cursorReference(rentalId).get();
    const nextStart = cursor.exists ? String(cursor.data()?.nextPeriodStart) : rental.startDate;
    if (!isBefore(targetDate, nextStart) &&
        !(rental.actualClosedDate && isBefore(rental.actualClosedDate, nextStart))) {
      throw new OperationalError('Requested charge generation exceeds the 1,000-charge limit');
    }
    return generated;
  }

  async chargesForRental(rentalId: string): Promise<RentalChargeDto[]> {
    const charges = await this.repository.chargesForRental(rentalId);
    if (charges.length > 1000) {
      throw new OperationalError('Rental-charge result exceeds the supported 1,000-item limit');
    }
    const paid = await this.repository.paidAmountsForCharges(charges.map((charge) => charge.id));
    return charges.map((charge) => chargeDto(charge, paid.get(charge.id) ?? charge.paidAmount));
  }

  async dueCharges(asOfDateValue: unknown): Promise<RentalChargeDto[]> {
    let asOfDate = todayUtc();
    if (asOfDateValue !== undefined) {
      try { asOfDate = parseDate(asOfDateValue, 'asOfDate'); }
      catch (error) {
        throw new ValidationError([{ field: 'asOfDate', rejectedValue: asOfDateValue, message: String(error).replace(/^Error: /, '') }]);
      }
    }
    const charges = await this.repository.dueCharges(asOfDate);
    if (charges.length > 1000) {
      throw new OperationalError('Due-charge result exceeds the supported 1,000-item limit');
    }
    const paid = await this.repository.paidAmountsForCharges(charges.map((charge) => charge.id));
    return charges
      .map((charge) => chargeDto(charge, paid.get(charge.id) ?? charge.paidAmount));
  }

  async listCharges(query: Record<string, unknown>): Promise<PageResponse<RentalChargeDto>> {
    const page = parsePage(query, 'dueDate', ['dueDate', 'createdAt', 'chargeSequence', 'status'], 'ASC');
    const status = query.status === undefined ? undefined : String(query.status);
    if (status && !chargeStatuses.has(status as ChargeStatus)) {
      throw new ValidationError([{ field: 'status', rejectedValue: status, message: 'Invalid charge status' }]);
    }
    const currencyValue = query.currency === undefined ? undefined : currency(query.currency, 'currency');
    const customerId = query.customerId === undefined ? undefined : String(query.customerId);
    const rentalId = query.rentalId === undefined ? undefined : String(query.rentalId);
    const result = await this.repository.pageCharges(
      {
        ...(status ? { status } : {}),
        ...(currencyValue ? { currency: currencyValue } : {}),
        ...(customerId ? { customerId } : {}),
        ...(rentalId ? { rentalId } : {}),
      },
      page,
    );
    const paid = await this.repository.paidAmountsForCharges(result.items.map((charge) => charge.id));
    return toPage(
      result.items.map((charge) => chargeDto(charge, paid.get(charge.id) ?? charge.paidAmount)),
      page,
      result.totalElements,
    );
  }
}
