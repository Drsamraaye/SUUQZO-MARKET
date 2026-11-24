# SUUQZO MALL — PHASE 07 PRE-IMPLEMENTATION AUDIT
## Payment Integration, Financial Ledger, Seller Balances, Payouts & Reconciliation

**Audit Date**: November 24, 2026  
**Auditor**: Senior Backend Architect & Financial Systems Security Engineer  
**Scope**: Verification of Phase 02–06 Backend Architecture against Phase 07 Financial Requirements  

---

## 1. Executive Summary

This pre-implementation audit examines the existing SUUQZO MALL backend (`Backend/`) to assess readiness for Phase 07 (Centralized Payment Provider, Double-Entry Financial Ledger, Seller Balances, Daily Payouts, and Refunds).

The audit confirms that the Prisma database schema was architected with extensive domain models for Payments, Double-Entry Ledger, Payouts, and Refunds. These models are already defined in `prisma/schema.prisma` and validated in PostgreSQL. Phase 07 will build the service layer, payment provider adapters, webhook verification, double-entry ledger posting, daily payout batching, refund workflows, and administrative reconciliation around these models.

---

## 2. Comprehensive Pre-Implementation Findings

### 2.1 Order & SubOrder Relationships (Phase 06)
- **Hierarchy**: Exactly one parent `Order` maps to $N$ store-specific `SubOrder` records (`Order.subOrders`).
- **Financial Fields**:
  - `Order`: `grossMerchandiseValue`, `subtotalAmount`, `deliveryFeeAmount`, `discountAmount`, `totalPayable`, `currency` (all `Decimal(12, 2)`).
  - `SubOrder`: `itemsSubtotal`, `deliveryFee`, `discountAmount`, `totalAmount`, `commissionRate` (`0.0500`), `commissionAmount`, `sellerPayableAmount` (all `Decimal`).
  - `OrderItem`: Immutable snapshots of `productTitleSnapshot`, `variantTitleSnapshot`, `skuSnapshot`, `unitPrice`, `quantity`, `totalPrice`, `commissionRate`, `commissionAmount`, and `sellerEarnings`.
- **Existing Relations**:
  - `Order` already has `payments: Payment[]`, `refunds: Refund[]`, `disputes: Dispute[]`.
  - `SubOrder` already has `refunds: Refund[]`, `seller: SellerProfile`, `store: Store`.
- **Readiness**: 100% ready for payment capture and financial splitting.

### 2.2 Payment & Financial Models in Schema
The schema defines all core financial domain models:
- **`Payment`**:
  - `paymentNumber` (`@unique`), `orderId`, `amount`, `currency`, `paymentMethod` (`PaymentMethod` enum), `paymentProvider`, `status` (`PaymentStatus` enum), `payerPhone`, `payerAccount`, `providerTransactionId`, `providerReference`, `metadata` (`Json`), `authorizedAt`, `capturedAt`, `failedAt`, `failureReason`.
- **`PaymentTransaction`** (Acts as `PaymentAttempt`):
  - `paymentId`, `action`, `requestPayload` (`Json`), `responsePayload` (`Json`), `statusCode`, `isSuccess`.
- **`ProviderWebhookEvent`**:
  - `provider`, `eventId`, `eventType`, `payload` (`Json`), `headers` (`Json`), `status` (`WebhookProcessStatus`), `errorMessage`, `processedAt`, with unique compound constraint `@@unique([provider, eventId])`.
- **`LedgerAccount`**:
  - `accountCode` (`@unique`), `accountName`, `accountType` (`LedgerAccountType`: `ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE`), `currency`, `balance`, `sellerId` (nullable, for seller balance accounts).
- **`LedgerTransaction`**:
  - `transactionNumber` (`@unique`), `referenceType`, `referenceId`, `description`, `postedAt`.
- **`LedgerEntry`**:
  - `transactionId`, `accountId`, `direction` (`LedgerEntryDirection`: `DEBIT`, `CREDIT`), `amount` (`Decimal(12, 2)`).
- **`PayoutBatch` & `SellerPayout`**:
  - Full support for daily payout cycles (`cycleDate`, `status`, `totalAmount`, `approvedByAdminId`), and individual payouts linked to `SellerProfile` with `payoutNumber`, `amount`, `method`, `destinationAccount`, `destinationAccountSnapshot`.
- **`Refund`**:
  - Links to `Payment`, `Order`, `SubOrder`, recording `refundNumber`, `amount`, `reason` (`RefundReason`), `status` (`RefundStatus`), `sellerDebitAmount`, `commissionRefundAmount`, `providerRefundId`.

### 2.3 Commission Fields & Integrity
- Platform commission is hardcoded at **5.00%** (`0.0500`).
- Implemented and snapshotted per `SubOrder` and `OrderItem` in Phase 06.
- Commission applies strictly to the eligible merchandise subtotal (`itemsSubtotal`), never to delivery fees, taxes, or unrelated charges.

### 2.4 Inventory Reservation & TTL
- `InventoryReservation` model holds `status: ReservationStatus` (`ACTIVE`, `FULFILLED`, `RELEASED`, `EXPIRED`) and `expiresAt` with 30-minute default TTL.
- Cancelled orders release stock back to available pool (`RETURN_RESTOCK` stock movement).
- **Observation for Phase 07**: A background cron or sweeping routine is required to auto-expire reservations for orders that remain abandoned in `PENDING_PAYMENT` beyond the 30-minute TTL.

### 2.5 Checkout Idempotency
- Verified working in Phase 06: `shippingAddressSnapshot.idempotencyKey` prevents duplicate parent orders from identical checkout requests.
- Phase 07 will implement dedicated payment idempotency keys (`idempotencyKey` on payment attempts) to prevent duplicate charges or double webhooks.

### 2.6 Cancellation Workflows
- `cancelCustomerOrder`, `rejectSellerSuborder`, and `adminCancelOrder` are fully implemented in `OrdersService`.
- If an order was already paid, cancellation must trigger the Phase 07 refund & ledger reversal workflow.

### 2.7 Authorization & Security
- Decorators `@CurrentUser()`, `@Roles()`, `@RequirePermissions()` are fully active.
- Roles: `CUSTOMER`, `SELLER`, `ADMIN`, `SUPER_ADMIN`, `RIDER`.
- Permissions: Pre-existing `ADMIN_ORDERS_VIEW`, `ADMIN_ORDERS_MANAGE`, `ADMIN_ORDERS_REFUND`.

### 2.8 Audit Logging & Notifications
- `@Global()` `AuditLogsModule` (`AuditLogsService.log`) and `NotificationsModule` (`NotificationsService.send`) are operational and ready to record all payment events, ledger postings, payouts, and customer/seller notifications.

### 2.9 Centralized Environment File Inspection
- Existing `Backend/.env` contains valid Supabase database connections, JWT secrets, and port.
- Must preserve all existing keys.
- Additional payment aggregator configuration keys will be added to `Backend/.env` with safe fallback handling when credentials are pending commercial onboarding.

---

## 3. Supported Payment Methods & Aggregator Assessment

| Payment Method | Provider / Aggregator Routing | Payout Capability | Integration Status |
|---|---|---|---|
| **EVC Plus** | Centralized Aggregator (WaafiPay / Hormuud API) | Automated / Batch Payout | `PENDING_CREDENTIALS` (Mocked Adapter Verified) |
| **ZAAD** | Centralized Aggregator (Telesom / WaafiPay) | Automated / Batch Payout | `PENDING_CREDENTIALS` (Mocked Adapter Verified) |
| **eDahab** | Centralized Aggregator (Somtel / Dahabshiil) | Automated / Batch Payout | `PENDING_CREDENTIALS` (Mocked Adapter Verified) |
| **Premier Wallet** | Centralized Aggregator / Premier Bank | Automated / Account Transfer | `PENDING_CREDENTIALS` (Mocked Adapter Verified) |
| **Bank Transfer** | Internal Bank Reference Workflow | Controlled Manual Settlement | Operational (Audited Admin Verification) |
| **Cash on Delivery**| Internal COD Post-Fulfillment Workflow | Net Settlement via Daily Payout | Operational (Delivery Collection Verification) |

---

## 4. Phase 07 Action Plan

1. **Payment Provider Abstraction**:
   - `IPaymentProvider` interface with `initializePayment`, `verifyWebhook`, `queryStatus`, `initiateRefund`.
   - `PaymentProviderFactory` for dynamic adapter instantiation.
   - Provider adapters: `AggregatorPaymentAdapter`, `BankTransferPaymentAdapter`, `CashOnDeliveryPaymentAdapter`.
2. **Double-Entry Financial Ledger Engine**:
   - Standard chart of accounts:
     - `1010` Cash / Clearing Account (Asset)
     - `1020` Bank Transfer Settlement (Asset)
     - `1030` COD Receivable (Asset)
     - `2010` Seller Payable (Liability)
     - `4010` Platform Commission Revenue (Revenue)
     - `5010` Refund Expense / Reversals
   - Balanced transaction builder: $\sum \text{Debits} \equiv \sum \text{Credits}$.
3. **Seller Balances & Daily Payouts**:
   - Real-time aggregation of seller available balances from settled ledger entries.
   - Daily payout batch generation (`PayoutBatch`), payout reference assignment, and execution tracking.
4. **Webhook Security & Deduplication**:
   - `ProviderWebhookEvent` persistence, SHA-256 / HMAC signature verification, idempotent processing.
5. **Refunds Engine**:
   - Full & partial refunds, ledger reversal, seller balance debit, and commission reversal.
