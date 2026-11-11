# Stage A: API compatibility matrix

This is the endpoint inventory observed in the Java controllers. The Firebase
implementation must expose the same paths, methods, parameters, request JSON,
response JSON, and status behavior. All paths include the `/api/v1` prefix.

## Contract conventions

- `AUTH` means a valid Bearer JWT is required. `PUBLIC` is allowed anonymously.
- Successful validation failures use HTTP `400` and the structured
  `ErrorResponse` documented below.
- Missing resources and business conflicts retain the Java service's
  `ErrorResponse` status/message; exact messages must be captured by
  differential tests before implementation.
- Create endpoints return `201`; ordinary reads/updates return `200`.
- `204` is used by password reset.
- Paginated responses use:
  `{ content, pageNumber, pageSize, totalElements, totalPages, last }`.
- Date fields are ISO `YYYY-MM-DD`; timestamps are ISO instants. UUIDs are
  strings. `BigDecimal` values are decimal JSON numbers.

## Authentication

| # | Method and path | Auth | Request | Response and status | Client |
|---:|---|---|---|---|---|
| 1 | `POST /api/v1/auth/login` | PUBLIC | `{email, password}`; email required/valid, password min 6 | `LoginResponse` (`accessToken`, `tokenType`, `expiresIn`, `user`) — `200` | Mobile, web |
| 2 | `POST /api/v1/auth/reset-password` | AUTH by security configuration | `{email, password}`; same validation as login | Empty body — `204` | Development helper |
| 3 | `POST /api/v1/auth/bootstrap-owner` | PUBLIC | `{email, password, fullName, preferredLanguage?}`; password min 8 | `LoginResponse` — `201`; only on empty DB | Setup |
| 4 | `GET /api/v1/auth/profile` | AUTH | none | `UserProfileDto` — `200` | Mobile |
| 5 | `PATCH /api/v1/auth/profile/language` | AUTH | `{preferredLanguage}` | `UserProfileDto` — `200` | Mobile, web |
| 6 | `PATCH /api/v1/auth/profile/currency` | AUTH | `{preferredCurrency}` | `UserProfileDto` — `200` | Mobile, web |

## Motorbikes

| # | Method and path | Auth | Request/query | Response and status | Client |
|---:|---|---|---|---|---|
| 7 | `POST /api/v1/bikes` | AUTH | `CreateBikeRequest` | `BikeDto` — `201` | Mobile, web |
| 8 | `GET /api/v1/bikes` | AUTH | `search?`, `status?`, `includeArchived=false`, `page?`, `size?`, `sort?`; default size 20, `createdAt,DESC` | `PageResponse<BikeDto>` — `200` | Mobile, web |
| 9 | `GET /api/v1/bikes/{id}` | AUTH | UUID path | `BikeDto` — `200` | Mobile |
| 10 | `PUT /api/v1/bikes/{id}` | AUTH | `UpdateBikeRequest` | `BikeDto` — `200` | Web capability |
| 11 | `PATCH /api/v1/bikes/{id}/status` | AUTH | `{status}` | `BikeDto` — `200` | Backend/client capability |
| 12 | `POST /api/v1/bikes/{id}/archive` | AUTH | none | `BikeDto` — `200` | Mobile/web |
| 13 | `POST /api/v1/bikes/{id}/unarchive` | AUTH | none | `BikeDto` — `200` | Mobile/web |

## Customers

| # | Method and path | Auth | Request/query | Response and status | Client |
|---:|---|---|---|---|---|
| 14 | `POST /api/v1/customers` | AUTH | `CreateCustomerRequest` | `CustomerDto` — `201` | Mobile, web |
| 15 | `GET /api/v1/customers` | AUTH | `search?`, `includeArchived=false`, `page?`, `size?`, `sort?`; default `createdAt,DESC` | `PageResponse<CustomerDto>` — `200` | Mobile, web |
| 16 | `GET /api/v1/customers/{id}` | AUTH | UUID path | `CustomerDto` — `200` | Mobile |
| 17 | `PUT /api/v1/customers/{id}` | AUTH | `UpdateCustomerRequest` | `CustomerDto` — `200` | Web capability |
| 18 | `POST /api/v1/customers/{id}/archive` | AUTH | none | `CustomerDto` — `200` | Mobile/web |
| 19 | `POST /api/v1/customers/{id}/unarchive` | AUTH | none | `CustomerDto` — `200` | Mobile/web |
| 20 | `GET /api/v1/customers/{id}/balance-summary` | AUTH | UUID path | `CustomerBalanceSummaryDto` — `200` | Mobile |

## Rentals

| # | Method and path | Auth | Request/query | Response and status | Client |
|---:|---|---|---|---|---|
| 21 | `POST /api/v1/rentals` | AUTH | `CreateRentalRequest` | `RentalDto` — `201`; allocates bike and initial charge | Mobile, web |
| 22 | `POST /api/v1/rentals/{id}/close` | AUTH | `{closureDate, notes?}` | `RentalDto` — `200`; restores bike availability | Mobile, web |
| 23 | `PUT /api/v1/rentals/{id}` | AUTH | `UpdateRentalRequest` | `RentalDto` — `200` | Web |
| 24 | `GET /api/v1/rentals/{id}` | AUTH | UUID path | `RentalDto` — `200` | Mobile |
| 25 | `GET /api/v1/rentals` | AUTH | `status?`, `customerId?`, `bikeId?`, `page?`, `size?`, `sort?`; default `startDate,DESC` | `PageResponse<RentalDto>` — `200` | Mobile, web |

## Rental charges

| # | Method and path | Auth | Request/query | Response and status | Client |
|---:|---|---|---|---|---|
| 26 | `POST /api/v1/rental-charges/rental/{rentalId}/generate-next` | AUTH | none | `RentalChargeDto` — `201` | Mobile |
| 27 | `POST /api/v1/rental-charges/rental/{rentalId}/generate-up-to-date` | AUTH | required `targetDate` ISO date | `RentalChargeDto[]` — `201` | Backend capability |
| 28 | `GET /api/v1/rental-charges/rental/{rentalId}` | AUTH | UUID path | `RentalChargeDto[]` — `200` | Mobile |
| 29 | `GET /api/v1/rental-charges/due` | AUTH | `asOfDate?` ISO date | `RentalChargeDto[]` — `200` | Backend capability |
| 30 | `GET /api/v1/rental-charges` | AUTH | `status?`, `currency?`, `customerId?`, `rentalId?`, `page?`, `size?`, `sort?`; default `dueDate,ASC` | `PageResponse<RentalChargeDto>` — `200` | Backend capability |

## Payments

| # | Method and path | Auth | Request/query | Response and status | Client |
|---:|---|---|---|---|---|
| 31 | `POST /api/v1/payments` | AUTH | `RecordPaymentRequest` | `PaymentDto` — `201`; allocation and charge updates are atomic | Mobile, web |
| 32 | `POST /api/v1/payments/{id}/reverse` | AUTH | `{reason}` required | `PaymentDto` — `200`; restores linked debt | Mobile |
| 33 | `GET /api/v1/payments/{id}` | AUTH | UUID path | `PaymentDto` — `200` | Backend capability |
| 34 | `GET /api/v1/payments` | AUTH | `status?`, `currency?`, `method?`, `customerId?`, `startDate?`, `endDate?`, `page?`, `size?`, `sort?`; default `paymentDate,DESC` | `PageResponse<PaymentDto>` — `200` | Mobile, web |
| 35 | `GET /api/v1/payments/customer/{customerId}` | AUTH | UUID path | `PaymentDto[]` — `200` | Backend capability |
| 36 | `GET /api/v1/payments/rental/{rentalId}` | AUTH | UUID path | `PaymentDto[]` — `200` | Backend capability |
| 37 | `GET /api/v1/payments/balance-summary/{customerId}` | AUTH | UUID path | `CustomerBalanceSummaryDto` — `200` | Backend capability |

## Parts and inventory

| # | Method and path | Auth | Request/query | Response and status | Client |
|---:|---|---|---|---|---|
| 38 | `POST /api/v1/parts` | AUTH | `CreatePartRequest` | `PartDto` — `201`; initial quantity creates ledger movement | Mobile, web |
| 39 | `PUT /api/v1/parts/{id}` | AUTH | `UpdatePartRequest` | `PartDto` — `200` | Backend capability |
| 40 | `GET /api/v1/parts/{id}` | AUTH | UUID path | `PartDto` — `200` | Backend capability |
| 41 | `GET /api/v1/parts` | AUTH | `search?`, `category?`, `lowStockOnly?`, `includeArchived=false`, `page?`, `size?`, `sort?`; default `partCode,ASC` | `PageResponse<PartDto>` — `200` | Mobile, web |
| 42 | `GET /api/v1/parts/low-stock` | AUTH | none | `PartDto[]` — `200` | Backend capability |
| 43 | `POST /api/v1/parts/{id}/archive` | AUTH | none | `PartDto` — `200` | Backend capability |
| 44 | `POST /api/v1/parts/{id}/unarchive` | AUTH | none | `PartDto` — `200` | Backend capability |
| 45 | `POST /api/v1/stock-movements` | AUTH | `RecordStockMovementRequest` | `StockMovementDto` — `201`; rejects negative resulting stock | Mobile, web |
| 46 | `GET /api/v1/stock-movements/part/{partId}` | AUTH | UUID path | `StockMovementDto[]` — `200` | Backend capability |
| 47 | `GET /api/v1/stock-movements` | AUTH | `partId?`, `type?`, `startDate?`, `endDate?` ISO instants, `page?`, `size?`, `sort?`; default `createdAt,DESC` | `PageResponse<StockMovementDto>` — `200` | Backend capability |

## Suppliers

| # | Method and path | Auth | Request/query | Response and status | Client |
|---:|---|---|---|---|---|
| 48 | `POST /api/v1/suppliers` | AUTH | `CreateSupplierRequest` | `SupplierDto` — `201` | Backend capability |
| 49 | `GET /api/v1/suppliers` | AUTH | `search?`, `includeArchived=false`, `page?`, `size?`, `sort?`; default `name,ASC` | `PageResponse<SupplierDto>` — `200` | Backend capability |
| 50 | `GET /api/v1/suppliers/{id}` | AUTH | UUID path | `SupplierDto` — `200` | Backend capability |
| 51 | `POST /api/v1/suppliers/{id}/archive` | AUTH | none | `SupplierDto` — `200` | Backend capability |
| 52 | `POST /api/v1/suppliers/{id}/unarchive` | AUTH | none | `SupplierDto` — `200` | Backend capability |

## Servicing

| # | Method and path | Auth | Request/query | Response and status | Client |
|---:|---|---|---|---|---|
| 53 | `POST /api/v1/services` | AUTH | `LogServiceRequest` | `ServiceRecordDto` — `201`; service, odometer, and parts ledger are atomic | Mobile, web |
| 54 | `GET /api/v1/services/{id}` | AUTH | UUID path | `ServiceRecordDto` — `200` | Backend capability |
| 55 | `GET /api/v1/services/bike/{bikeId}` | AUTH | UUID path | `ServiceRecordDto[]` — `200` | Backend capability |
| 56 | `GET /api/v1/services` | AUTH | `bikeId?`, `status?`, `startDate?`, `endDate?`, `page?`, `size?`, `sort?`; default `serviceDate,DESC` | `PageResponse<ServiceRecordDto>` — `200` | Mobile, web |
| 57 | `GET /api/v1/services/due` | AUTH | `asOfDate?` ISO date | `ServiceRecordDto[]` — `200` | Backend capability |

## Reports

| # | Method and path | Auth | Request/query | Response and status | Client |
|---:|---|---|---|---|---|
| 58 | `GET /api/v1/reports/dashboard` | AUTH | none | `DashboardKpiDto` — `200` | Mobile, web |
| 59 | `GET /api/v1/reports/fleet-utilization` | AUTH | none | `FleetUtilizationDto` — `200` | Mobile, web |
| 60 | `GET /api/v1/reports/date-range` | AUTH | required `fromDate`, `toDate` ISO dates | `DateRangeReportDto` — `200` | Web |
| 61 | `GET /api/v1/reports/bike-roi/{bikeId}` | AUTH | UUID path | `BikeRoiDto` — `200` | Mobile |

## JSON DTO shapes

The following are the exact DTO property names observed in Java. Optional
properties remain nullable unless a request validation annotation or database
constraint says otherwise.

### Auth and shared DTOs

- `LoginResponse`: `accessToken`, `tokenType`, `expiresIn`, `user`.
- `UserProfileDto`: `id`, `email`, `fullName`, `role`, `preferredLanguage`,
  `preferredCurrency`.
- `PageResponse<T>`: `content`, `pageNumber`, `pageSize`, `totalElements`,
  `totalPages`, `last`.
- `ErrorResponse`: `timestamp`, `status`, `error`, `message`, `path`,
  optional `validationErrors[]`; each validation error has `field`,
  `rejectedValue`, `message`.

### Domain response DTOs

- `BikeDto`: `id`, `registrationNumber`, `vin`, `make`, `model`,
  `manufactureYear`, `currentOdometer`, `itpExpiryDate`, `rcaExpiryDate`,
  `cascoExpiryDate`, `serviceIntervalDays`, `nextServiceDueDate`, `status`,
  `notes`, `archived`, `createdAt`, `updatedAt`.
- `CustomerDto`: `id`, `fullName`, `phone`, `email`, `cnpOrTaxId`,
  `dateOfBirth`, `livingCity`, `drivingLicenceNumber`, `licenceCategories`,
  `licenceExpiryDate`, `address`, `gdprConsentDate`, `notes`, `archived`,
  `createdAt`, `updatedAt`.
- `RentalDto`: `id`, `customerId`, `customerName`, `customerPhone`, `bikeId`,
  `bikeRegistrationNumber`, `bikeMakeModel`, `startDate`, `plannedEndDate`,
  `actualClosedDate`, `weeklyRate`, `currency`, `depositAmount`,
  `depositCurrency`, `paymentFrequency`, `scheduleAnchorDay`, `status`,
  `termsAndNotes`, `createdAt`.
- `RentalChargeDto`: `id`, `rentalId`, `chargeSequence`, `periodStartDate`,
  `periodEndDate`, `dueDate`, `amount`, `currency`, `status`, `paidAmount`,
  `remainingAmount`, `notes`, `createdAt`.
- `PaymentDto`: `id`, `customerId`, `customerName`, `rentalId`, `paymentDate`,
  `amount`, `currency`, `paymentMethod`, `referenceNumber`, `notes`, `status`,
  `recordedByUserName`, `allocations`, `reversalReason`, `reversedAt`,
  `createdAt`.
- `PaymentAllocationDto`: `id`, `paymentId`, `rentalChargeId`, `chargeSequence`,
  `chargeDueDate`, `allocatedAmount`, `currency`, `allocatedAt`.
- `CustomerBalanceSummaryDto`: `customerId`, `customerName`, `balances` map.
  Each map value has `currency`, `totalBilled`, `totalPaid`,
  `totalOutstanding`.
- `PartDto`: `id`, `partCode`, `name`, `category`, `description`,
  `unitOfMeasure`, `currentQuantity`, `minReorderLevel`, `defaultUnitCost`,
  `costCurrency`, `defaultSupplierId`, `defaultSupplierName`, `isLowStock`,
  `active`, `createdAt`.
- `SupplierDto`: `id`, `name`, `contactPerson`, `phone`, `email`, `taxCui`,
  `address`, `notes`, `active`, `createdAt`.
- `StockMovementDto`: `id`, `partId`, `partCode`, `partName`, `quantityDelta`,
  `movementType`, `referenceType`, `referenceId`, `unitCost`, `currency`,
  `reason`, `recordedByUserName`, `createdAt`.
- `ServiceRecordDto`: `id`, `bikeId`, `bikeRegistrationNumber`,
  `bikeMakeModel`, `serviceDate`, `odometerReading`, `serviceProvider`,
  `workPerformed`, `labourCost`, `labourCurrency`, `partsCost`, `totalCost`,
  `status`, `nextServiceDueDate`, `nextServiceDueOdometer`, `notes`,
  `partsUsed`, `createdAt`.
- `ServicePartUsageDto`: `id`, `partId`, `partCode`, `partName`, `quantity`,
  `unitCost`, `currency`, `totalCost`.
- `DashboardKpiDto`: `activeRentalsCount`, `availableBikesCount`,
  `inServiceBikesCount`, `totalFleetCount`, `overdueChargesCount`,
  `lowStockPartsCount`, `monthlyRevenue`, `monthlyExpenses` maps.
- `FleetUtilizationDto`: `totalBikes`, `rentedBikes`, `availableBikes`,
  `inMaintenanceBikes`, `utilizationRate`.
- `BikeRoiDto`: `bikeId`, `registrationNumber`, `makeModel`, `totalRevenue`,
  `totalMaintenanceCost`, `netProfit` maps.
- `DateRangeReportDto`: `totalRentals`, `activeRentals`, `closedRentals`,
  `serviceCount`, `revenue`, `labourCost`, `sparePartsCost`,
  `stockInQuantity`, `stockOutQuantity`, `stockInCost`, `stockOutCost` maps.

### Request DTO shapes

- `CreateBikeRequest`: `registrationNumber`, `vin`, `make`, `model`,
  `manufactureYear`, `currentOdometer`, `itpExpiryDate`, `rcaExpiryDate`,
  `cascoExpiryDate`, `serviceIntervalDays`, `status`, `notes`.
- `UpdateBikeRequest`: same bike fields, all update fields supplied by the
  client as applicable.
- `CreateCustomerRequest`: `fullName`, `phone`, `email`, `cnpOrTaxId`,
  `dateOfBirth`, `livingCity`, `drivingLicenceNumber`, `licenceCategories`,
  `licenceExpiryDate`, `address`, `gdprConsentDate`, `notes`.
- `UpdateCustomerRequest`: `fullName`, `phone`, `email`, `cnpOrTaxId`,
  `drivingLicenceNumber`, `licenceCategories`, `licenceExpiryDate`, `address`,
  `notes`.
- `CreateRentalRequest`: `customerId`, `motorbikeId`, `startDate`,
  `plannedEndDate`, `weeklyRate`, `currency`, `depositAmount`,
  `depositCurrency`, `scheduleAnchorDay`, `termsAndNotes`.
- `UpdateRentalRequest`: `motorbikeId`, `startDate`, `plannedEndDate`,
  `weeklyRate`, `currency`, `depositAmount`, `depositCurrency`,
  `termsAndNotes`.
- `CloseRentalRequest`: `closureDate`, `notes`.
- `RecordPaymentRequest`: `customerId`, `rentalId`, `paymentDate`, `amount`,
  `currency`, `paymentMethod`, `referenceNumber`, `notes`, `allocationMode`,
  `manualAllocations[]`. An allocation item has `rentalChargeId` and `amount`.
- `ReversePaymentRequest`: `reason`.
- `CreatePartRequest`: `partCode`, `name`, `category`, `description`,
  `unitOfMeasure`, `initialQuantity`, `minReorderLevel`, `defaultUnitCost`,
  `costCurrency`, `defaultSupplierId`.
- `UpdatePartRequest`: `name`, `category`, `description`, `unitOfMeasure`,
  `minReorderLevel`, `defaultUnitCost`, `defaultSupplierId`.
- `RecordStockMovementRequest`: `partId`, `quantity`, `movementType`,
  `referenceType`, `referenceId`, `unitCost`, `currency`, `reason`.
- `CreateSupplierRequest`: `name`, `contactPerson`, `phone`, `email`, `taxCui`,
  `address`, `notes`.
- `LogServiceRequest`: `motorbikeId`, `serviceDate`, `odometerReading`,
  `serviceProvider`, `workPerformed`, `labourCost`, `labourCurrency`, `status`,
  `nextServiceDueDate`, `nextServiceDueOdometer`, `notes`, `partsUsed[]`.
  Each part item has `partId`, `quantity`, `unitCost`, `currency`.

## Enumerations observed

- Bike status: `AVAILABLE`, `RENTED`, `IN_SERVICE`, `INACTIVE`.
- Rental status: `ACTIVE`, `CLOSED`, `CANCELLED`.
- Charge status: `UNPAID`, `PARTIALLY_PAID`, `PAID`, `CANCELLED`.
- Payment method: `CASH`, `BANK_TRANSFER`.
- Payment status: `CONFIRMED`, `REVERSED`.
- Stock movement type: `STOCK_IN`, `STOCK_OUT`, `SERVICE_USAGE`, `RETURN`,
  `ADJUSTMENT`, `REVERSAL`.
- Service status: `PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`.
- Supported currencies: `RON`, `EUR`, `USD`.

## Source references

- Controllers: `backend/src/main/java/ro/bikerental/modules/**/controller`
- DTOs: `backend/src/main/java/ro/bikerental/modules/**/dto`
- Security/error behavior: `backend/src/main/java/ro/bikerental/common`
- Mobile endpoint usage: `mobile/lib/features/**` and
  `mobile/lib/core/api/api_endpoints.dart`
- Web endpoint usage: `web/src/App.tsx` and `web/src/api.ts`
