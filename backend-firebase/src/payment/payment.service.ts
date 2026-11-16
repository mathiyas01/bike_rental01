import { Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';
import type { AppConfig } from '../config/env.js';
import type { AuthenticatedUser } from '../auth/types.js';
import type {
  ChargeDocument,
  ChargeStatus,
  Currency,
  PaymentAllocationDocument,
  PaymentDocument,
  PaymentReversalDocument,
} from '../domain/types.js';
import { BusinessError, UnprocessableEntityError } from '../shared/errors.js';
import { requireUuid } from '../shared/ids.js';
import { fromMinorUnits, moneyToJson, toMinorUnits } from '../shared/money.js';
import { toPage, type PageResponse } from '../shared/pagination.js';
import {
  PaymentRepository,
  allocationFrom,
  chargeFrom,
  toPaymentDto,
} from './payment.repository.js';
import {
  MAX_AFFECTED_CHARGES,
  MAX_ALLOCATION_HISTORY_READS_CREATE,
  MAX_ALLOCATION_HISTORY_READS_REVERSE,
  MAX_ALLOCATIONS_PER_CHARGE,
  MAX_PARENT_PAYMENTS_READ,
  type CurrencyBalanceDto,
  type CustomerBalanceSummaryDto,
  type PaymentDto,
} from './payment.types.js';
import {
  assertTransactionBudget,
  parseRecordPaymentInput,
  parseReversePaymentInput,
  parseSearchPaymentsQuery,
  type PlannedWriteEntry,
} from './payment.validation.js';

interface TransactionReadState {
  allocationReads: number;
  maxHistoryReads: number;
  parentPaymentStatus: Map<string, string | null>;
}

interface PlannedChargeUpdate {
  charge: ChargeDocument;
  newPaidAmount: string;
  newRemainingAmount: string;
  newStatus: ChargeStatus;
}

const SUPPORTED_CURRENCIES: readonly Currency[] = ['RON', 'EUR', 'USD'];

function sortCandidateCharges(charges: ChargeDocument[]): ChargeDocument[] {
  return [...charges].sort((left, right) => {
    if (left.dueDate !== right.dueDate) {
      return left.dueDate.localeCompare(right.dueDate);
    }
    if (left.chargeSequence !== right.chargeSequence) {
      return left.chargeSequence - right.chargeSequence;
    }
    return left.id.localeCompare(right.id);
  });
}

export class PaymentService {
  private readonly repository: PaymentRepository;

  constructor(
    private readonly firestore: Firestore,
    private readonly _config: AppConfig,
  ) {
    this.repository = new PaymentRepository(firestore);
  }

  private async readConfirmedPaidInTx(
    tx: Transaction,
    chargeId: string,
    state: TransactionReadState,
    excludePaymentId?: string,
  ): Promise<{ confirmedPaidMinor: bigint; allocations: PaymentAllocationDocument[] }> {
    const query = this.repository
      .allocationsForChargeQuery(chargeId)
      .limit(MAX_ALLOCATIONS_PER_CHARGE + 1);
    const allocSnap = await tx.get(query);

    if (allocSnap.docs.length > MAX_ALLOCATIONS_PER_CHARGE) {
      throw new UnprocessableEntityError(
        `Charge ${chargeId} has more than ${MAX_ALLOCATIONS_PER_CHARGE} allocation records, exceeding atomic read safeguards`,
      );
    }

    state.allocationReads += allocSnap.docs.length;
    if (state.allocationReads > state.maxHistoryReads) {
      throw new UnprocessableEntityError(
        `Transaction exceeded the maximum of ${state.maxHistoryReads} allocation-history reads`,
      );
    }

    const allocations = allocSnap.docs.map((doc) => allocationFrom(doc.id, doc.data()));
    const missingParentIds: string[] = [];
    const seenMissing = new Set<string>();

    for (const alloc of allocations) {
      if (alloc.paymentId === excludePaymentId) continue;
      if (!state.parentPaymentStatus.has(alloc.paymentId) && !seenMissing.has(alloc.paymentId)) {
        seenMissing.add(alloc.paymentId);
        missingParentIds.push(alloc.paymentId);
      }
    }

    if (state.parentPaymentStatus.size + missingParentIds.length > MAX_PARENT_PAYMENTS_READ) {
      throw new UnprocessableEntityError(
        `Transaction exceeded the maximum of ${MAX_PARENT_PAYMENTS_READ} distinct parent payment reads`,
      );
    }

    if (missingParentIds.length > 0) {
      const parentSnaps = await this.repository.getManyInTransaction(
        tx,
        missingParentIds.map((pid) => this.repository.paymentReference(pid)),
      );
      for (const snap of parentSnaps) {
        state.parentPaymentStatus.set(
          snap.id,
          snap.exists ? String(snap.data()?.status ?? '') : null,
        );
      }
    }

    let confirmedPaidMinor = 0n;
    for (const alloc of allocations) {
      if (alloc.paymentId === excludePaymentId) continue;
      if (state.parentPaymentStatus.get(alloc.paymentId) === 'CONFIRMED') {
        confirmedPaidMinor += toMinorUnits(alloc.allocatedAmount);
      }
    }

    return { confirmedPaidMinor, allocations };
  }

  private async fetchAllEligibleAutoFifoCharges(
    tx: Transaction,
    options: { customerId: string; rentalId: string | null; currency: Currency },
  ): Promise<ChargeDocument[]> {
    const baseQuery = this.repository.eligibleChargesForAutoFifoQuery(options);
    const batchSize = 500;
    const allDocs: ChargeDocument[] = [];
    let query = baseQuery.limit(batchSize);

    while (true) {
      const snap = await tx.get(query);
      for (const doc of snap.docs) {
        allDocs.push(chargeFrom(doc.id, doc.data()));
      }
      if (snap.docs.length < batchSize) {
        break;
      }
      const lastDoc = snap.docs[snap.docs.length - 1];
      if (!lastDoc) break;
      query = baseQuery.startAfter(lastDoc).limit(batchSize);
    }

    return sortCandidateCharges(allDocs);
  }

  async recordPayment(rawBody: unknown, authUser: AuthenticatedUser): Promise<PaymentDto> {
    const input = parseRecordPaymentInput(rawBody);

    const paymentDto = await this.firestore.runTransaction(async (tx) => {
      const now = Timestamp.now();

      // Phase 1: Common reads (strictly before any writes)
      const [userSnap, customerSnap, rentalSnap] = await Promise.all([
        tx.get(this.repository.userReference(authUser.id)),
        tx.get(this.repository.customerReference(input.customerId)),
        input.rentalId !== null
          ? tx.get(this.repository.rentalReference(input.rentalId))
          : Promise.resolve(null),
      ]);

      const auditUser = this.repository.readAuditUser(userSnap);
      const customer = this.repository.readCustomer(customerSnap);

      if (rentalSnap !== null) {
        const rental = this.repository.readRental(rentalSnap);
        if (rental.customerId !== customer.id) {
          throw new BusinessError(
            `Rental agreement does not belong to customer: ${customer.id}`,
          );
        }
      }

      const paymentId = PaymentRepository.newId();
      const paymentDoc: PaymentDocument = {
        id: paymentId,
        customerId: customer.id,
        customerName: customer.fullName,
        rentalId: input.rentalId,
        paymentDate: input.paymentDate,
        amount: input.amount,
        currency: input.currency,
        paymentMethod: input.paymentMethod,
        referenceNumber: input.referenceNumber,
        notes: input.notes,
        status: 'CONFIRMED',
        recordedByUserId: auditUser.id,
        recordedByUserName: auditUser.fullName,
        allocationMode: input.allocationMode,
        createdAt: now,
        updatedAt: now,
      };

      const plannedAllocations: PaymentAllocationDocument[] = [];
      const plannedChargeUpdates = new Map<string, PlannedChargeUpdate>();
      const readState: TransactionReadState = {
        allocationReads: 0,
        maxHistoryReads: MAX_ALLOCATION_HISTORY_READS_CREATE,
        parentPaymentStatus: new Map(),
      };

      if (input.allocationMode === 'MANUAL') {
        if (input.manualAllocations.length > 0) {
          let totalManualMinor = 0n;
          for (const item of input.manualAllocations) {
            totalManualMinor += item.amountMinor;
          }
          if (totalManualMinor > input.amountMinor) {
            throw new BusinessError(
              `Total allocated amount (${fromMinorUnits(totalManualMinor)}) cannot exceed payment amount (${input.amount})`,
            );
          }

          const distinctChargeIds: string[] = [];
          const seenCharges = new Set<string>();
          for (const item of input.manualAllocations) {
            if (!seenCharges.has(item.rentalChargeId)) {
              seenCharges.add(item.rentalChargeId);
              distinctChargeIds.push(item.rentalChargeId);
            }
          }

          if (distinctChargeIds.length > MAX_AFFECTED_CHARGES) {
            throw new UnprocessableEntityError(
              `Manual allocation targets ${distinctChargeIds.length} charges, exceeding the atomic transaction limit of ${MAX_AFFECTED_CHARGES}`,
            );
          }

          const chargeSnaps = await this.repository.getManyInTransaction(
            tx,
            distinctChargeIds.map((id) => this.repository.chargeReference(id)),
          );
          const chargeMap = new Map<string, ChargeDocument>();
          for (const snap of chargeSnaps) {
            chargeMap.set(snap.id, this.repository.readCharge(snap));
          }

          for (const chargeId of distinctChargeIds) {
            const charge = chargeMap.get(chargeId)!;
            if (charge.customerId !== customer.id) {
              throw new BusinessError(
                `Charge ${charge.id} does not belong to customer ${customer.id}`,
              );
            }
            if (charge.currency !== input.currency) {
              throw new BusinessError(
                `Currency mismatch: payment currency ${input.currency} does not match charge currency ${charge.currency}`,
              );
            }
          }

          const runningPaidMinor = new Map<string, bigint>();
          for (const chargeId of distinctChargeIds) {
            const { confirmedPaidMinor } = await this.readConfirmedPaidInTx(
              tx,
              chargeId,
              readState,
            );
            runningPaidMinor.set(chargeId, confirmedPaidMinor);
          }

          for (const item of input.manualAllocations) {
            const charge = chargeMap.get(item.rentalChargeId)!;
            const currentPaid = runningPaidMinor.get(charge.id) ?? 0n;
            const chargeAmountMinor = toMinorUnits(charge.amount);
            const unpaidMinor = chargeAmountMinor > currentPaid ? chargeAmountMinor - currentPaid : 0n;

            if (item.amountMinor > unpaidMinor) {
              throw new BusinessError(
                `Allocation amount ${item.amount} exceeds unpaid balance ${fromMinorUnits(unpaidMinor)} for charge ${charge.id}`,
              );
            }

            const newPaidMinor = currentPaid + item.amountMinor;
            runningPaidMinor.set(charge.id, newPaidMinor);
            const newRemainingMinor = chargeAmountMinor > newPaidMinor
              ? chargeAmountMinor - newPaidMinor
              : 0n;
            const newStatus: ChargeStatus = newPaidMinor >= chargeAmountMinor
              ? 'PAID'
              : 'PARTIALLY_PAID';

            plannedChargeUpdates.set(charge.id, {
              charge,
              newPaidAmount: fromMinorUnits(newPaidMinor),
              newRemainingAmount: fromMinorUnits(newRemainingMinor),
              newStatus,
            });

            plannedAllocations.push({
              id: PaymentRepository.newId(),
              paymentId,
              rentalChargeId: charge.id,
              chargeSequence: charge.chargeSequence,
              chargeDueDate: charge.dueDate,
              allocatedAmount: item.amount,
              currency: input.currency,
              allocatedAt: now,
            });
          }
        }
      } else {
        const candidateCharges = await this.fetchAllEligibleAutoFifoCharges(tx, {
          customerId: customer.id,
          rentalId: input.rentalId,
          currency: input.currency,
        });

        let remainingMinor = input.amountMinor;
        for (const charge of candidateCharges) {
          if (remainingMinor <= 0n) {
            break;
          }
          if (plannedChargeUpdates.size >= MAX_AFFECTED_CHARGES) {
            throw new UnprocessableEntityError(
              `Payment allocation exceeds the atomic transaction limit of ${MAX_AFFECTED_CHARGES} affected charges`,
            );
          }

          const { confirmedPaidMinor } = await this.readConfirmedPaidInTx(
            tx,
            charge.id,
            readState,
          );
          const chargeAmountMinor = toMinorUnits(charge.amount);
          const unpaidMinor = chargeAmountMinor - confirmedPaidMinor;

          if (unpaidMinor <= 0n) {
            // Reconcile stale charge status to PAID without emitting an allocation (§2.2 AUTO_FIFO 7a)
            plannedChargeUpdates.set(charge.id, {
              charge,
              newPaidAmount: fromMinorUnits(confirmedPaidMinor),
              newRemainingAmount: '0.00',
              newStatus: 'PAID',
            });
            continue;
          }

          const allocMinor = remainingMinor < unpaidMinor ? remainingMinor : unpaidMinor;
          const newPaidMinor = confirmedPaidMinor + allocMinor;
          const newRemainingMinor = chargeAmountMinor > newPaidMinor
            ? chargeAmountMinor - newPaidMinor
            : 0n;
          const newStatus: ChargeStatus = newPaidMinor >= chargeAmountMinor
            ? 'PAID'
            : 'PARTIALLY_PAID';

          plannedChargeUpdates.set(charge.id, {
            charge,
            newPaidAmount: fromMinorUnits(newPaidMinor),
            newRemainingAmount: fromMinorUnits(newRemainingMinor),
            newStatus,
          });

          plannedAllocations.push({
            id: PaymentRepository.newId(),
            paymentId,
            rentalChargeId: charge.id,
            chargeSequence: charge.chargeSequence,
            chargeDueDate: charge.dueDate,
            allocatedAmount: fromMinorUnits(allocMinor),
            currency: input.currency,
            allocatedAt: now,
          });

          remainingMinor -= allocMinor;
        }
      }

      // Phase 2: Validate transaction write & Commit payload budgets before any writes
      const writeEntries: PlannedWriteEntry[] = [
        {
          path: `payments/${paymentId}`,
          data: { ...paymentDoc },
        },
      ];

      for (const update of plannedChargeUpdates.values()) {
        writeEntries.push({
          path: `rental_charges/${update.charge.id}`,
          data: {
            ...update.charge,
            paidAmount: update.newPaidAmount,
            remainingAmount: update.newRemainingAmount,
            status: update.newStatus,
            updatedAt: now,
          },
        });
      }

      for (const alloc of plannedAllocations) {
        writeEntries.push({
          path: `payment_allocations/${alloc.id}`,
          data: { ...alloc },
        });
      }

      assertTransactionBudget({
        affectedCharges: plannedChargeUpdates.size,
        writeEntries,
      });

      // Phase 3: Atomic writes (no further reads)
      tx.create(this.repository.paymentReference(paymentId), paymentDoc);

      for (const update of plannedChargeUpdates.values()) {
        tx.update(this.repository.chargeReference(update.charge.id), {
          paidAmount: update.newPaidAmount,
          remainingAmount: update.newRemainingAmount,
          status: update.newStatus,
          updatedAt: now,
        });
      }

      for (const alloc of plannedAllocations) {
        tx.create(this.repository.allocationReference(alloc.id), alloc);
      }

      return toPaymentDto(paymentDoc, plannedAllocations, null);
    });

    return paymentDto;
  }

  async reversePayment(
    paymentId: string,
    rawBody: unknown,
    authUser: AuthenticatedUser,
  ): Promise<PaymentDto> {
    const id = requireUuid(paymentId, 'id');
    const input = parseReversePaymentInput(rawBody);

    return this.firestore.runTransaction(async (tx) => {
      const now = Timestamp.now();

      // Phase 1: All reads before any writes
      const [userSnap, paymentSnap, reversalQuerySnap, ownAllocsSnap] = await Promise.all([
        tx.get(this.repository.userReference(authUser.id)),
        tx.get(this.repository.paymentReference(id)),
        tx.get(
          this.firestore
            .collection('payment_reversals')
            .where('paymentId', '==', id)
            .limit(1),
        ),
        tx.get(
          this.repository
            .allocationsForPaymentQuery(id)
            .limit(MAX_ALLOCATION_HISTORY_READS_REVERSE + 1),
        ),
      ]);

      const auditUser = this.repository.readAuditUser(userSnap);
      const payment = this.repository.readPayment(paymentSnap);

      if (payment.status === 'REVERSED' || !reversalQuerySnap.empty) {
        throw new BusinessError('Payment is already reversed');
      }

      if (ownAllocsSnap.docs.length > MAX_ALLOCATION_HISTORY_READS_REVERSE) {
        throw new UnprocessableEntityError(
          `Payment reversal exceeded the maximum of ${MAX_ALLOCATION_HISTORY_READS_REVERSE} allocation reads`,
        );
      }

      const ownAllocations = ownAllocsSnap.docs.map((doc) => allocationFrom(doc.id, doc.data()));
      const distinctChargeIds = [...new Set(ownAllocations.map((alloc) => alloc.rentalChargeId))];

      if (distinctChargeIds.length > MAX_AFFECTED_CHARGES) {
        throw new UnprocessableEntityError(
          `Payment reversal affects ${distinctChargeIds.length} charges, exceeding the atomic limit of ${MAX_AFFECTED_CHARGES}`,
        );
      }

      const chargeSnaps = await this.repository.getManyInTransaction(
        tx,
        distinctChargeIds.map((chargeId) => this.repository.chargeReference(chargeId)),
      );
      const charges = chargeSnaps.map((snap) => this.repository.readCharge(snap));

      const readState: TransactionReadState = {
        allocationReads: ownAllocsSnap.docs.length,
        maxHistoryReads: MAX_ALLOCATION_HISTORY_READS_REVERSE,
        parentPaymentStatus: new Map([[id, 'REVERSED']]),
      };

      const plannedChargeUpdates: PlannedChargeUpdate[] = [];
      for (const charge of charges) {
        const { confirmedPaidMinor } = await this.readConfirmedPaidInTx(
          tx,
          charge.id,
          readState,
          id,
        );
        const chargeAmountMinor = toMinorUnits(charge.amount);
        const newRemainingMinor = chargeAmountMinor > confirmedPaidMinor
          ? chargeAmountMinor - confirmedPaidMinor
          : 0n;

        let newStatus: ChargeStatus;
        if (confirmedPaidMinor === 0n) {
          newStatus = 'UNPAID';
        } else if (confirmedPaidMinor < chargeAmountMinor) {
          newStatus = 'PARTIALLY_PAID';
        } else {
          newStatus = 'PAID';
        }

        plannedChargeUpdates.push({
          charge,
          newPaidAmount: fromMinorUnits(confirmedPaidMinor),
          newRemainingAmount: fromMinorUnits(newRemainingMinor),
          newStatus,
        });
      }

      // Phase 2: Pre-write budget validation
      const reversalDoc: PaymentReversalDocument = {
        id,
        paymentId: id,
        reason: input.reason,
        reversedByUserId: auditUser.id,
        reversedAt: now,
        createdAt: now,
      };

      const writeEntries: PlannedWriteEntry[] = [
        {
          path: `payments/${id}`,
          data: {
            ...payment,
            status: 'REVERSED',
            updatedAt: now,
          },
        },
        {
          path: `payment_reversals/${id}`,
          data: { ...reversalDoc },
        },
      ];

      for (const update of plannedChargeUpdates) {
        writeEntries.push({
          path: `rental_charges/${update.charge.id}`,
          data: {
            ...update.charge,
            paidAmount: update.newPaidAmount,
            remainingAmount: update.newRemainingAmount,
            status: update.newStatus,
            updatedAt: now,
          },
        });
      }

      assertTransactionBudget({
        affectedCharges: plannedChargeUpdates.length,
        writeEntries,
      });

      // Phase 3: Atomic writes (allocation docs preserved for audit trail)
      tx.update(this.repository.paymentReference(id), {
        status: 'REVERSED',
        updatedAt: now,
      });
      tx.create(this.repository.reversalReference(id), reversalDoc);

      for (const update of plannedChargeUpdates) {
        tx.update(this.repository.chargeReference(update.charge.id), {
          paidAmount: update.newPaidAmount,
          remainingAmount: update.newRemainingAmount,
          status: update.newStatus,
          updatedAt: now,
        });
      }

      return toPaymentDto(
        { ...payment, status: 'REVERSED', updatedAt: now },
        ownAllocations,
        reversalDoc,
      );
    });
  }

  async getPaymentById(paymentId: string): Promise<PaymentDto> {
    const id = requireUuid(paymentId, 'id');
    const [paymentSnap, allocationsByPayment, reversalsByPayment] = await Promise.all([
      this.repository.paymentReference(id).get(),
      this.repository.findAllocationsByPaymentIds([id]),
      this.repository.findReversalsByPaymentIds([id]),
    ]);

    const payment = this.repository.readPayment(paymentSnap);
    return toPaymentDto(
      payment,
      allocationsByPayment.get(id) ?? [],
      reversalsByPayment.get(id) ?? null,
    );
  }

  async searchPayments(query: Record<string, unknown>): Promise<PageResponse<PaymentDto>> {
    const { filters, page } = parseSearchPaymentsQuery(query);
    const result = await this.repository.pagePayments(filters, page);

    const paymentIds = result.items.map((item) => item.id);
    const reversedIds = result.items
      .filter((item) => item.status === 'REVERSED')
      .map((item) => item.id);

    const [allocationsByPayment, reversalsByPayment] = await Promise.all([
      this.repository.findAllocationsByPaymentIds(paymentIds),
      this.repository.findReversalsByPaymentIds(reversedIds),
    ]);

    const dtos = result.items.map((payment) =>
      toPaymentDto(
        payment,
        allocationsByPayment.get(payment.id) ?? [],
        payment.status === 'REVERSED'
          ? (reversalsByPayment.get(payment.id) ?? null)
          : null,
      ),
    );

    return toPage(dtos, page, result.totalElements);
  }

  async getPaymentsForCustomer(customerId: string): Promise<PaymentDto[]> {
    const validCustomerId = requireUuid(customerId, 'customerId');
    const payments = await this.repository.findPaymentsByCustomerId(validCustomerId);
    const allocationsByPayment = await this.repository.findAllocationsByPaymentIds(
      payments.map((payment) => payment.id),
    );

    return payments.map((payment) =>
      toPaymentDto(payment, allocationsByPayment.get(payment.id) ?? [], null),
    );
  }

  async getPaymentsForRental(rentalId: string): Promise<PaymentDto[]> {
    const validRentalId = requireUuid(rentalId, 'rentalId');
    const payments = await this.repository.findPaymentsByRentalId(validRentalId);
    const allocationsByPayment = await this.repository.findAllocationsByPaymentIds(
      payments.map((payment) => payment.id),
    );

    return payments.map((payment) =>
      toPaymentDto(payment, allocationsByPayment.get(payment.id) ?? [], null),
    );
  }

  async getCustomerBalanceSummary(customerId: string): Promise<CustomerBalanceSummaryDto> {
    const validCustomerId = requireUuid(customerId, 'customerId');
    const [customerSnap, charges, confirmedPayments] = await Promise.all([
      this.repository.customerReference(validCustomerId).get(),
      this.repository.findChargesForCustomer(validCustomerId),
      this.repository.findConfirmedPaymentsForCustomer(validCustomerId),
    ]);

    const customer = this.repository.readCustomer(customerSnap);

    const billedMinor = new Map<Currency, bigint>([
      ['RON', 0n],
      ['EUR', 0n],
      ['USD', 0n],
    ]);
    const paidMinor = new Map<Currency, bigint>([
      ['RON', 0n],
      ['EUR', 0n],
      ['USD', 0n],
    ]);

    for (const charge of charges) {
      if (billedMinor.has(charge.currency)) {
        billedMinor.set(
          charge.currency,
          (billedMinor.get(charge.currency) ?? 0n) + toMinorUnits(charge.amount),
        );
      }
    }

    for (const payment of confirmedPayments) {
      if (paidMinor.has(payment.currency)) {
        paidMinor.set(
          payment.currency,
          (paidMinor.get(payment.currency) ?? 0n) + toMinorUnits(payment.amount),
        );
      }
    }

    const balances = {} as Record<Currency, CurrencyBalanceDto>;
    for (const currency of SUPPORTED_CURRENCIES) {
      const billed = billedMinor.get(currency) ?? 0n;
      const paid = paidMinor.get(currency) ?? 0n;
      const outstanding = billed > paid ? billed - paid : 0n;
      balances[currency] = {
        currency,
        totalBilled: moneyToJson(fromMinorUnits(billed)),
        totalPaid: moneyToJson(fromMinorUnits(paid)),
        totalOutstanding: moneyToJson(fromMinorUnits(outstanding)),
      };
    }

    return {
      customerId: customer.id,
      customerName: customer.fullName,
      balances,
    };
  }
}
