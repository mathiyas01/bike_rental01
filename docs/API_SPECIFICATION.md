# Motorbike Rental Management System — REST API Specification

**Base URL:** `/api/v1`  
**Protocol:** JSON over HTTPS  
**Authentication:** Bearer JWT in `Authorization` header (`Authorization: Bearer <token>`)

---

## 1. Standard Error Response Contract

All non-2xx responses adhere to this RFC 7807-inspired schema:

```json
{
  "timestamp": "2026-10-21T10:30:00Z",
  "status": 400,
  "error": "BAD_REQUEST",
  "message": "Payment currency EUR does not match rental charge currency RON",
  "path": "/api/v1/payments",
  "validationErrors": [
    {
      "field": "currency",
      "rejectedValue": "EUR",
      "message": "Must match target charge currency (RON)"
    }
  ]
}
```

---

## 2. Authentication Endpoints

### 2.1 Owner Login
- **Endpoint:** `POST /api/v1/auth/login`
- **Request:**
```json
{
  "email": "owner@bikerental.ro",
  "password": "SecurePassword123!"
}
```
- **Response (200 OK):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenType": "Bearer",
  "expiresIn": 86400,
  "user": {
    "id": "e9b2518e-4a65-4f76-857e-616a2ad34e95",
    "email": "owner@bikerental.ro",
    "fullName": "Mihai Popescu",
    "role": "ROLE_OWNER",
    "preferredLanguage": "en"
  }
}
```

### 2.2 Profile Settings
- **Endpoint:** `GET /api/v1/auth/profile`
- **Update Preferred Language:** `PATCH /api/v1/auth/profile/language`
```json
{
  "preferredLanguage": "ro"
}
```

---

## 3. Dashboard Endpoints

### 3.1 Fleet & Financial Overview
- **Endpoint:** `GET /api/v1/dashboard?startDate=2026-10-01&endDate=2026-10-31`
- **Response (200 OK):**
```json
{
  "fleetMetrics": {
    "totalBikes": 24,
    "availableBikes": 8,
    "rentedBikes": 14,
    "inServiceBikes": 2,
    "activeRentalsCount": 14
  },
  "financialMetrics": {
    "incomeByCurrency": {
      "RON": 14200.00,
      "EUR": 1250.00,
      "USD": 0.00
    },
    "outstandingBalancesByCurrency": {
      "RON": 2800.00,
      "EUR": 300.00,
      "USD": 0.00
    },
    "overdueChargesCount": 3,
    "serviceExpensesByCurrency": {
      "RON": 1850.50,
      "EUR": 110.00,
      "USD": 0.00
    }
  },
  "operationalAlerts": {
    "paymentsDueToday": 2,
    "upcomingServiceReminders": 3,
    "lowStockPartsCount": 4
  },
  "recentPayments": [
    {
      "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "customerName": "Ion Ionescu",
      "amount": 350.00,
      "currency": "RON",
      "paymentMethod": "CASH",
      "paymentDate": "2026-10-21"
    }
  ]
}
```

---

## 4. Motorbike Endpoints

### 4.1 Register Motorbike
- **Endpoint:** `POST /api/v1/bikes`
- **Request:**
```json
{
  "registrationNumber": "B 777 BIK",
  "vin": "JH2PC37053M000001",
  "make": "Honda",
  "model": "PCX 125",
  "manufactureYear": 2024,
  "currentOdometer": 12450.5,
  "itpExpiryDate": "2027-05-15",
  "rcaExpiryDate": "2027-04-10",
  "cascoExpiryDate": null,
  "notes": "Equipped with top delivery box mount"
}
```

### 4.2 List Motorbikes (with filtering)
- **Endpoint:** `GET /api/v1/bikes?status=AVAILABLE&search=Honda&page=0&size=20`

### 4.3 Motorbike Details & History
- **Endpoint:** `GET /api/v1/bikes/{id}`
- Returns motorbike specs, active rental, full rental history, and service history.

---

## 5. Customer Endpoints

### 5.1 Register Customer
- **Endpoint:** `POST /api/v1/customers`
- **Request:**
```json
{
  "fullName": "Andrei Vasilescu",
  "phone": "+40721234567",
  "email": "andrei.vasilescu@email.ro",
  "cnpOrTaxId": "1940512123456",
  "drivingLicenceNumber": "B00123456Z",
  "licenceCategories": "A,B",
  "licenceExpiryDate": "2030-08-20",
  "address": "Str. Victoriei nr. 45, Sector 1, București",
  "gdprConsentDate": "2026-10-21",
  "notes": "Courier for food delivery platform"
}
```

### 5.2 Customer Financial Summary
- **Endpoint:** `GET /api/v1/customers/{id}/balance-summary`
- Returns active rental, total amounts billed, total amounts paid, and net balance separated by currency (`RON`, `EUR`, `USD`).

---

## 6. Rental Agreement Endpoints

### 6.1 Create Rental Agreement
- **Endpoint:** `POST /api/v1/rentals`
- **Request:**
```json
{
  "customerId": "8a32a27d-93d3-463e-a7d0-c3d694389650",
  "motorbikeId": "65b90f48-a149-436d-965a-0cb85bbf48f7",
  "startDate": "2026-10-22",
  "plannedEndDate": null,
  "weeklyRate": 350.00,
  "currency": "RON",
  "depositAmount": 500.00,
  "depositCurrency": "RON",
  "paymentFrequency": "WEEKLY",
  "scheduleAnchorDay": "START_DAY",
  "termsAndNotes": "Helmet and lock included in rental."
}
```
- **Business validations enforced:**
  - Motorbike must be in `AVAILABLE` status.
  - Generates initial weekly charge (Sequence 1) spanning `2026-10-22` to `2026-10-28` with due date `2026-10-22`.
  - Atomically transitions bike status to `RENTED`.

### 6.2 Close Rental Agreement
- **Endpoint:** `POST /api/v1/rentals/{id}/close`
- **Request:**
```json
{
  "closureDate": "2026-11-15",
  "depositDisposition": "REFUND_FULL",
  "refundedAmount": 500.00,
  "refundCurrency": "RON",
  "notes": "Returned in clean condition, full tank."
}
```
- Automatically changes bike status back to `AVAILABLE`.

---

## 7. Payments & Allocation Endpoints

### 7.1 Record Payment with Allocations
- **Endpoint:** `POST /api/v1/payments`
- **Request:**
```json
{
  "customerId": "8a32a27d-93d3-463e-a7d0-c3d694389650",
  "rentalId": "cf149c47-380d-4ea3-8fe5-21d74659ce6b",
  "paymentDate": "2026-10-22",
  "amount": 700.00,
  "currency": "RON",
  "paymentMethod": "CASH",
  "referenceNumber": "REC-2026-0012",
  "notes": "Paid two weeks advance rent",
  "allocationMode": "AUTO_FIFO",
  "manualAllocations": []
}
```
- If `allocationMode` is `MANUAL`, caller passes `rentalChargeId` and `allocatedAmount` list.
- Validates that `payment.currency == rental_charge.currency`.

### 7.2 Reverse Payment
- **Endpoint:** `POST /api/v1/payments/{id}/reverse`
- **Request:**
```json
{
  "reason": "Customer bank transfer bounced after initial manual record"
}
```
- Restores unpaid status on linked rental charges; writes to `payment_reversals`.

---

## 8. Servicing & Spare-Parts Endpoints

### 8.1 Log Service with Parts Deduction
- **Endpoint:** `POST /api/v1/services`
- **Request:**
```json
{
  "motorbikeId": "65b90f48-a149-436d-965a-0cb85bbf48f7",
  "serviceDate": "2026-10-21",
  "odometerReading": 15000.0,
  "serviceProvider": "Moto Service SRL",
  "workPerformed": "Regular 15k maintenance: oil change, oil filter, rear brake pad replacement",
  "labourCost": 150.00,
  "labourCurrency": "RON",
  "status": "COMPLETED",
  "nextServiceDueDate": "2027-04-21",
  "nextServiceDueOdometer": 20000.0,
  "partsUsed": [
    {
      "partId": "0bf67a7e-1ff2-493d-a51f-561b0a827e8a",
      "quantity": 1.0,
      "unitCost": 45.00,
      "currency": "RON"
    },
    {
      "partId": "c4d32a88-8e6d-4731-97b5-2db0cfb19e99",
      "quantity": 1.0,
      "unitCost": 35.00,
      "currency": "RON"
    }
  ]
}
```
- Validates stock sufficiency, atomically updates `parts.current_quantity`, records `stock_movements`, and updates bike odometer.

### 8.2 Stock In / Out Operations
- **Endpoint:** `POST /api/v1/stock-movements`
- **Request:**
```json
{
  "partId": "0bf67a7e-1ff2-493d-a51f-561b0a827e8a",
  "quantityDelta": 10.0,
  "movementType": "STOCK_IN",
  "referenceType": "SUPPLIER_INVOICE",
  "unitCost": 42.00,
  "currency": "RON",
  "reason": "Batch restock invoice #4928"
}
```
