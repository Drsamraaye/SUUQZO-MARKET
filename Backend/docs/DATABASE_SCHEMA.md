# SUUQZO MALL — Database Schema Reference Specification

**Version**: 1.0.0  
**Status**: APPROVED & ACTIVE  
**ORM**: Prisma 7 (with `@prisma/adapter-pg`)  
**Database**: PostgreSQL 16+  
**Schema Location**: `Backend/prisma/schema.prisma`  
**Configuration**: `Backend/prisma.config.ts`  

---

## 1. Schema Overview

The SUUQZO MALL database is a multi-vendor marketplace data architecture designed for high-concurrency order placement, multi-seller basket partitioning, automated daily payouts, double-entry financial accounting, and integration with Somali local payment rails.

### Core Metrics & Enforced Business Rules:
- **Platform Commission**: 5% standard rate stored as a decimal rate (`0.0500`) and preserved immutably per line item and suborder.
- **Monetary Precision**: All currency amounts use PostgreSQL `DECIMAL(12, 2)` or `DECIMAL(14, 2)`. No floating-point data types are permitted.
- **Seller Payouts**: Automated daily batch generation (`PayoutBatch` -> `SellerPayout`).
- **Payment Collection**: Centralized at the parent `Order` level through local payment aggregators.
- **Supabase Dual Connection Architecture**:
  - `DIRECT_URL` (Port 5432 - Session Mode): Used by Prisma CLI (`prisma db push`, `prisma migrate`) to support prepared statements and DDL locking.
  - `DATABASE_URL` (Port 6543 - Transaction Mode): Used for high-concurrency application runtime querying with connection pooling.
- **Payment Rails Supported**:
  - `ZAAD` (Telesom)
  - `EVC_PLUS` (Hormuud)
  - `EDAHAB` (Somtel)
  - `BANK_TRANSFER` (Premier Bank, IBS, Dahabshiil)
  - `CASH_ON_DELIVERY`
  - `PREMIER_WALLET`

---

## 2. Entity Model Directory

### 2.1 Identity, Authentication & Security
- **`User`**: Root credential and identity record. Supports email and Somali phone login, 2FA, and role assignments (`SUPER_ADMIN`, `ADMIN`, `SUPPORT`, `SELLER`, `CUSTOMER`, `RIDER`).
- **`UserSession`**: Tracks active web/mobile device logins, token hashes, IP addresses, and user-agent strings. Supports instant remote logout.
- **`RefreshToken`**: Cryptographically hashed refresh tokens grouped by token family to detect and prevent token reuse replay attacks.

### 2.2 Customer Domain
- **`CustomerProfile`**: Extended customer information, loyalty points, spending metrics, and communication preferences.
- **`CustomerAddress`**: Multi-address management with street, district, city, landmark, and GPS coordinates (`latitude`, `longitude`) for precision routing.

### 2.3 Seller & Storefront Domain
- **`SellerProfile`**: Business registration, KYC verification status, commission rate, and payout account details.
- **`SellerKycDocument`**: Stores uploaded identity cards, passports, and business licenses for compliance review.
- **`Store`**: A seller can operate multiple branded stores or branches with independent physical addresses, geofences, and operating hours.

### 2.4 Rider & Logistics Domain
- **`RiderProfile`**: Driver verification, vehicle classification (`BICYCLE`, `MOTORCYCLE`, `CAR`, `VAN`), real-time GPS telemetry, and online/offline status.
- **`DeliveryAssignment`**: Unique 1:1 delivery contract for a seller `SubOrder`. Manages pickup and dropoff snapshots, delivery fees, and rider earnings.
- **`DeliveryTrackingUpdate`**: Temporal GPS breadcrumbs and milestone updates (`ACCEPTED`, `ARRIVED_AT_STORE`, `PARCEL_PICKED_UP`, `EN_ROUTE`, `DELIVERED`).

### 2.5 Catalog & Inventory Domain
- **`Category`**: Self-referential tree structure for multi-level category navigation with optional commission override capability.
- **`Brand`**: Product brand catalog.
- **`Product`**: Base product catalog item owned by a `Store`.
- **`ProductVariant`**: Sellable SKU with price, compare-at price, weight, and arbitrary attribute combinations (e.g. Color, Size).
- **`ProductImage`**: Media gallery linked to products or specific variants.
- **`InventoryItem`**: Current stock levels per variant and store. Maintains `quantityOnHand` and `reservedQuantity`.
- **`InventoryReservation`**: Time-to-live (TTL) inventory holds during checkout to guarantee zero overselling.
- **`StockMovement`**: Immutable audit log of every stock change (restock, order reservation, return, shrinkage).

### 2.6 Cart, Checkout & Orders
- **`Cart`** & **`CartItem`**: Persistent shopping carts for guest and logged-in customers.
- **`CheckoutSession`**: Pre-order checkout validation state with TTL lock.
- **`Order` (Parent Order)**: Aggregated customer purchase record containing overall GMV, delivery fees, tax, and discount snapshots.
- **`SubOrder` (Seller Suborder)**: Partitioned order slice assigned to exactly one `SellerProfile`. Calculates subtotal, delivery fee, 5% commission, and net seller payable.
- **`OrderItem`**: Line item belonging to a `SubOrder`. Stores immutable pricing, title, SKU, and commission values.

### 2.7 Payments & Financial Accounting
- **`Payment`**: Unified customer payment transaction against the parent `Order`.
- **`PaymentTransaction`**: Individual API attempt, gateway response, and payload log.
- **`ProviderWebhookEvent`**: Idempotent webhook event ledger indexed by `[provider, eventId]`.
- **`LedgerAccount`**: Chart of accounts (`ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE`).
- **`LedgerTransaction`**: Balanced double-entry accounting journal entry.
- **`LedgerEntry`**: Atomic debit or credit item attached to an account.

### 2.8 Payouts, Refunds & Disputes
- **`PayoutBatch`**: Daily grouping of seller disbursements.
- **`SellerPayout`**: Individual payout record with destination account snapshot and provider transaction ID.
- **`Refund`**: Direct reversal traced to original `Payment` and `SubOrder`.
- **`ReturnRequest`** & **`ReturnItem`**: Customer return workflow with seller inspection results.
- **`Dispute`**: Arbitration case managed between customer, seller, and platform admin.

### 2.9 Wallets, Marketing, Reviews & Platform
- **`Wallet`** & **`WalletTransaction`**: In-app digital balances for store credit, refunds, or rider earnings.
- **`Campaign`**, **`Coupon`**, **`CouponUsage`**: Discount and voucher management with seller and order restrictions.
- **`ProductReview`**, **`StoreReview`**, **`RiderReview`**: Verified-purchase feedback with moderation controls.
- **`Notification`**: Multi-channel user notifications (In-app, SMS, Push, Email).
- **`Conversation`** & **`Message`**: Real-time buyer-seller and support chat.
- **`SupportTicket`** & **`TicketMessage`**: Customer service issue tracking.
- **`AdminProfile`** & **`AuditLog`**: Granular RBAC permissions and change auditing.
- **`PlatformSetting`** & **`IntegrationConfig`**: Runtime system configuration and third-party gateway credentials.

---

## 3. NestJS Integration & Database Service Usage

Prisma 7 requires a driver adapter when communicating with PostgreSQL. The application initializes `PrismaService` via `@prisma/adapter-pg`:

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    super({ adapter });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
```

The database service is globally exported via `PrismaModule` in `Backend/src/database/prisma.module.ts`.
