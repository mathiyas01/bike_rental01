# Motorbike Rental Management System — Requirements & Domain Specification

## 1. Domain Overview

The system is engineered for a motorbike rental enterprise in Romania. Motorbikes are leased to individual customers (e.g., delivery couriers, commuters, or tourists) under weekly rental agreements. Rent is charged periodically, payments are recorded manually (cash or bank transfer), fleet maintenance is tracked with linked spare parts inventory, and financial reports must strictly segregate transactions across three currencies: **RON**, **EUR**, and **USD**.

---

## 2. Multi-Currency Specification (Critical Core Rule)

### 2.1 Currency Isolation Rules
1. **Currencies Allowed:** Exactly `RON` (Romanian Leu), `EUR` (Euro), and `USD` (US Dollar).
2. **Storage Precision:** All monetary amounts are stored as `NUMERIC(14, 2)` in PostgreSQL and represented as `BigDecimal` in Java. Floating point (`float`, `double`) is strictly banned.
3. **Currency Tagging:** Every database row with an amount (`rental_price`, `deposit_amount`, `charge_amount`, `payment_amount`, `labour_cost`, `unit_cost`) **must** include its associated `currency` column.
4. **No Cross-Currency Aggregation:** The system shall **never** sum amounts of different currencies together into a single scalar value.
   - *Example violation:* `150 RON + 100 EUR = 250 Total` is **strictly prohibited**.
   - *Correct representation:* Multi-currency balance map: `{ "RON": 150.00, "EUR": 100.00, "USD": 0.00 }`.
5. **No Implicit Exchange Rates:** The MVP does not automatically convert between currencies. If an owner accepts 100 EUR for a 500 RON debt, that requires an explicit, separate multi-currency exchange workflow with source currency, target currency, timestamped exchange rate, and audit notes. In the MVP, payments can only be allocated to charges sharing the identical currency.
6. **Formatting:**
   - English (Default): `1,500.50 RON`, `€250.00`, `$120.00`.
   - Romanian: `1.500,50 RON`, `250,00 €`, `120,00 $` (space as thousands separator, comma as decimal).

---

## 3. Module Specifications & Business Rules

### 3.1 Authentication & Security
- **Owner Account:** Initial owner registered via migration or bootstrap CLI (preferred language defaults to English `en`, with full Romanian `ro` toggle).
- **Login:** Email and password with rate-limiting / brute-force protection.
- **Tokens:** Short-lived JWT Access Token (e.g. 60 min) with refresh token capability or secure sliding expiration.
- **Storage:** Secure hardware-backed storage (`flutter_secure_storage`).

### 3.2 Motorbike Fleet Management
- **Attributes:** Registration number (e.g. `B 123 BIK`), VIN (17 chars), make, model, manufacture year, odometer (km), registration cert expiry (ITP), mandatory third-party liability insurance (RCA) expiry, casco insurance expiry, operational status, archived flag.
- **Statuses:**
  - `AVAILABLE`: Ready to be leased.
  - `RENTED`: Currently assigned to an active rental agreement.
  - `IN_SERVICE`: Undergoing scheduled or emergency maintenance.
  - `INACTIVE`: Decommissioned or archived.
- **Conflict Prevention:** A motorbike can have at most **one** `ACTIVE` rental agreement at any given moment. Database and service layer constraints enforce this invariant.

### 3.3 Customer Management
- **Attributes:** Full name, phone number, email, Romanian CNP (or Passport/National ID for foreigners), driving licence number, licence categories (A, A1, A2, B), licence expiry date, residential address, emergency contact, GDPR consent date, notes, archived flag.
- **GDPR Compliance:**
  - Right to be forgotten: Personal data can be anonymized upon verified request while preserving anonymized financial records (charges, payments, invoices) to satisfy Romanian statutory accounting requirements (10 years fiscal record retention).
  - Soft-archive prevents accidental data destruction.

### 3.4 Rental Agreements & Recurring Charges
- **Agreement Attributes:**
  - Customer ID, Motorbike ID.
  - Start date (`DATE`), planned end date (`DATE`, optional for open-ended rentals), actual closed date (`DATE`).
  - Weekly rental price (`NUMERIC(14,2)`), Currency (`RON`, `EUR`, `USD`).
  - Deposit amount (`NUMERIC(14,2)`), Deposit currency.
  - Schedule anchor weekday (`MONDAY` through `SUNDAY`) or anniversary interval (every 7 days).
  - Status: `ACTIVE`, `CLOSED`, `CANCELLED`.
- **Weekly Charge Generation Engine:**
  - For each active rental, a background job or on-demand scheduler generates weekly charges for each 7-day period.
  - `rental_charges` table stores: `rental_id`, `charge_sequence`, `period_start_date`, `period_end_date`, `due_date`, `amount`, `currency`, `status` (`UNPAID`, `PARTIALLY_PAID`, `PAID`, `CANCELLED`).
  - Historical charges are **immutable**. If a weekly rate changes, an explicit agreement amendment or new rental must be created. Past charges remain unchanged.
  - When a rental is closed early, subsequent unaccrued charges are cancelled or not generated.

### 3.5 Payments & Allocation Ledger
- **Financial Architecture:** Separation of debt (`rental_charges`) from cash received (`payments`) via an allocation bridge (`payment_allocations`).
- **Payment Attributes:** Customer ID, rental ID (optional context), payment date, amount, currency, payment method (`CASH`, `BANK_TRANSFER`), external reference (e.g., bank transfer confirmation code), notes, recorded by user.
- **Allocation Rules:**
  - A payment can cover one or more weekly rental charges for that customer.
  - Sum of allocations across charges must equal or be less than the payment amount (partial payment allowed).
  - Allocations cannot exceed the unpaid remaining balance of any target charge.
  - Currency matching: `payment.currency == rental_charge.currency` must hold true.
  - Default allocation strategy: FIFO (First-In, First-Out by due date), with an explicit manual override option in the UI.
- **Outstanding Balance:**
  $$\text{Outstanding Balance} = \sum(\text{Active Charges}) - \sum(\text{Allocated Payments}) + \sum(\text{Adjustments})$$
- **Reversals:** Payments cannot be hard-deleted. A reversal creates a `payment_reversals` record, restoring the unpaid balances on the linked charges, with a mandatory recorded reason and user timestamp.

### 3.6 Motorbike Servicing & Maintenance
- **Service Attributes:** Motorbike ID, service date, odometer reading, mechanic / garage name, labour cost, labour currency, work performed description, status (`PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`), next service due date/km.
- **Status Transitions:**
  - Starting service: Bike status automatically transitions to `IN_SERVICE`.
  - Completing service: Bike status transitions back to `AVAILABLE` (or `RENTED` if still under active agreement), and odometer updates the bike's master odometer reading.
- **Stock Integration:** Parts consumed during service are logged in `service_part_usage` and atomically deducted from inventory in the same database transaction.

### 3.7 Spare-Parts Inventory & Stock Ledger
- **Part Attributes:** Unique part code (e.g., `OIL-10W40-1L`, `BRAKE-PAD-FR`), name, category (`FILTERS`, `BRAKES`, `FLUIDS`, `TYRES`, `ELECTRICAL`, `ENGINE`), unit of measure (`PCS`, `LITRES`, `SETS`), current quantity (`NUMERIC(10,2)`), minimum reorder level, default unit cost, cost currency.
- **Double-Entry Stock Movement Ledger:**
  - Every inventory change inserts a non-deletable row in `stock_movements`.
  - Movement types: `STOCK_IN`, `STOCK_OUT`, `SERVICE_USAGE`, `RETURN`, `ADJUSTMENT`, `REVERSAL`.
  - Records: `part_id`, `quantity_delta` (positive or negative), `unit_cost`, `currency`, `reference_type` (`SERVICE`, `SUPPLIER_PURCHASE`, `MANUAL`), `reference_id`, `reason`, `recorded_by_user_id`, `created_at`.
- **Concurrency & Invariants:**
  - Row-level lock (`PESSIMISTIC_WRITE` or atomic SQL increment) prevents negative inventory and race conditions.
  - If `current_quantity + delta < 0`, the transaction fails with `InsufficientStockException`.
  - Idempotency token prevents duplicate deductions on network retries.

---

## 4. Key Business Assumptions for Owner Confirmation

The following 6 assumptions have been designed with sensible production defaults:

1. **Weekly Due Date Schedule:**
   - *Default:* Every 7 days from the rental start date (e.g., start on Wednesday -> due every Wednesday). The system also allows setting a custom fixed weekday anchor (e.g., all couriers pay on Monday).
2. **Weekly Rate Modification Mid-Rental:**
   - *Default:* Immutable historical charges. If the weekly rate changes, it only applies to future weekly charges, leaving historical invoices and receipts untouched.
3. **Deposits and Refunds:**
   - *Default:* Deposits are logged as a distinct financial line item with their own currency. On contract termination, the deposit can be refunded in full, partially refunded (with documented damage/mileage deductions), or applied towards unpaid weekly rental charges.
4. **Payment Allocation Policy:**
   - *Default:* Automatic FIFO (oldest unpaid charge first) with an intuitive UI checkbox toggle allowing the business owner to manually pick which specific weekly charges the cash/transfer covers.
5. **Inventory Valuation & Currency:**
   - *Default:* Stock quantity is physical and universal. Unit costs and inventory valuation are tracked per part in its native currency (e.g. RON or EUR). Stock valuation reports group totals by currency.
6. **Romanian Fiscal & Receipt Requirements:**
   - *Default:* The system generates clean, printable PDF / digital payment receipts (*Confirmare de plată / Chitanță*) featuring standard Romanian business metadata (Business Name, CUI, Adresă, Client CNP/Date, Dată, Sumă, Metodă de plată). Integration with certified fiscal printers or ANAF e-Factura can be plugged in seamlessly via service adapters.
