# MotoRental Pro — Motorbike Rental Management System

A production-grade, full-stack Motorbike Rental Management System built for a motorbike rental fleet operating in Romania.

---

## 🛠 Technology Stack

- **Backend:** Java 21 / Spring Boot 3.4.3
- **Database:** PostgreSQL 18.1 with Flyway migrations (15 tables)
- **Security:** Spring Security with stateless JWT Bearer token authentication & BCrypt password hashing
- **Mobile Frontend:** Cross-platform Flutter 3.38.6 + Dart 3.10.7
- **Mobile State Management & Routing:** Riverpod 2.6.1 + GoRouter
- **HTTP Client:** Dio with custom authentication and error decoding interceptors
- **Internationalization (i18n):** English (`en`, default) and Romanian (`ro`, alternate)
- **Design System:** Material 3 with Google Fonts (Inter), Dark Mode and Light Mode support

---

## 🌟 Core Business Invariants & Capabilities

1. **Strict Multi-Currency Isolation (RON, EUR, USD):**
   - Monetary amounts are strictly stored as `NUMERIC(14, 2)` alongside their ISO-4217 currency code.
   - **Zero cross-currency mixing:** Balances, revenues, expenses, and KPI cards maintain separate pockets for `RON`, `EUR`, and `USD`.
   - Rental agreements have a designated currency; payments must match or be explicitly isolated.
2. **Double-Entry Spare-Parts Inventory Ledger:**
   - Real-time stock levels are backed by an immutable ledger (`stock_movements`).
   - Atomic database transactions ensure parts cannot drop below zero stock.
   - Low-stock visual alerts and purchase/usage movement logging.
3. **Weekly Rental Lifecycle & Allocation Engine:**
   - 7-day recurring rental charge schedule generation.
   - Manual payment recording for Cash, Bank Transfer, and Card.
   - Automatic FIFO (oldest debt first) and manual charge allocation.
   - Audited payment reversals that cleanly restore outstanding charge debt.
4. **Maintenance & Fleet Utilization Analytics:**
   - Service logging with automatic parts consumption and odometer synchronization.
   - Configurable service intervals, next revision reminders by date or odometer threshold, and an early-service action from each fleet card.
   - Individual motorbike Profitability (ROI) broken down by currency: `Total Rent Revenue - Maintenance Costs = Net Profit`.
5. **GDPR Compliance & Regulatory Road Readiness:**
   - Soft-archiving of customers and motorbikes preserving complete financial and audit history.
   - ITP (periodic technical inspection), RCA (mandatory liability insurance), and CASCO document expiry tracking with visual alert badges.

---

## 🚀 Quick Start Guide

### Prerequisites
- Java 21+ JDK (tested with JDK 25)
- Maven 3.9+
- PostgreSQL 18 (running on port 5432)
- Flutter 3.38+ with Dart 3.10+

### 1. Database Setup
Ensure PostgreSQL is running and initialize the database:
```sql
CREATE DATABASE bike_rental_db;
```
*(Flyway will automatically execute all database migrations upon backend startup).*

### 2. Backend Startup
```powershell
cd backend
mvn.cmd spring-boot:run
```
The REST API will start at `http://localhost:8081`.
- Swagger / OpenAPI UI: `http://localhost:8081/swagger-ui.html`
- Initial Admin Owner Account:
  - **Email:** `admin@bikerental.ro`
  - **Password:** `Admin123!`

### 3. Backend Test Suite
Run the comprehensive 44-test automated test suite:
```powershell
cd backend
mvn.cmd test
```

### 4. Mobile App Startup
```powershell
cd mobile
flutter pub get
flutter run
```
- For Android Emulator: Automatically connects to `http://10.0.2.2:8081`.
- For Windows / iOS / Web: Connects to `http://localhost:8081`.
- For a physical Android phone, connect the phone and computer to the same Wi-Fi,
  find the computer's IPv4 address with `ipconfig`, then build with:
  `flutter build apk --release --dart-define=API_BASE_URL=http://YOUR_COMPUTER_IP:8081`.

### 6. Client APK with a Cloud Backend

An APK cannot access a backend running on the developer's computer unless the
computer is publicly reachable. For client testing, deploy the backend and
PostgreSQL database to a cloud provider first.

Configure these backend environment variables on the provider:

```text
SPRING_PROFILES_ACTIVE=dev
SERVER_PORT=<provider-assigned-port>
SPRING_DATASOURCE_URL=jdbc:postgresql://<database-host>:5432/<database-name>
SPRING_DATASOURCE_USERNAME=<database-user>
SPRING_DATASOURCE_PASSWORD=<database-password>
JWT_SECRET=<long-random-secret>
```

Use the provider's public HTTPS URL to build the APK:

```powershell
cd mobile
flutter build apk --release --dart-define=API_BASE_URL=https://<public-backend-domain>
```

Replace `<public-backend-domain>` with the complete deployed backend URL, without
a trailing slash. Do not omit `--dart-define`: Android emulators can use
`10.0.2.2`, but a physical phone cannot reach that address. If the deployed
service uses a provider-assigned port, use the public HTTPS URL exposed by the
provider rather than the internal container port.

Send `build\app\outputs\flutter-apk\app-release.apk` to the client. The client
only needs internet access and does not need PostgreSQL, Java, Maven, or the
backend installed locally.

### 5. Mobile App Test & Static Analysis
```powershell
cd mobile
flutter analyze
flutter test
```

---

## 📂 Architecture & Documentation Links

Detailed architectural specifications and design documents are available in the [`docs/`](./docs) folder:
- [System Architecture Specification](file:///c:/Users/thisa/Desktop/Bike/docs/ARCHITECTURE.md)
- [Requirements & Domain Model](file:///c:/Users/thisa/Desktop/Bike/docs/REQUIREMENTS_SPECIFICATION.md)
- [Relational Database Schema & ER Design](file:///c:/Users/thisa/Desktop/Bike/docs/DATABASE_DESIGN.md)
- [REST API Endpoint Contracts](file:///c:/Users/thisa/Desktop/Bike/docs/API_SPECIFICATION.md)
- [Flutter Screen Navigation Plan](file:///c:/Users/thisa/Desktop/Bike/docs/FLUTTER_NAVIGATION_PLAN.md)
- [Development Checklist](file:///c:/Users/thisa/Desktop/Bike/docs/DEVELOPMENT_CHECKLIST.md)
