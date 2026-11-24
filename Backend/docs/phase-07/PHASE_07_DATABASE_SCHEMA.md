# SUUQZO MALL — PHASE 07 DATABASE SCHEMA
## Domain Models for Payments, Double-Entry Ledger, Payouts & Refunds

**Database:** Supabase PostgreSQL  
**ORM:** Prisma 7  

---

## 1. Domain Entities & Schema Definitions

### 1.1 Payment & Transaction Models
- **`Payment`**: Represents a payment attempt or session against a parent `Order`.
  - `id`: CUID Primary Key.
  - `paymentNumber`: Unique human-readable reference (`PAY-timestamp-hex`).
  - `orderId`: References `Order.id`.
  - `amount`: `Decimal(12, 2)`.
  - `currency`: Default `'USD'`.
  - `paymentMethod`: `ZAAD`, `EVC_PLUS`, `EDAHAB`, `BANK_TRANSFER`, `CASH_ON_DELIVERY`, `PREMIER_WALLET`.
  - `paymentProvider`: Provider identifier string.
  - `status`: `PENDING`, `REQUIRES_ACTION`, `AUTHORIZED`, `CAPTURED`, `FAILED`, `PARTIALLY_REFUNDED`, `REFUNDED`, `VOIDED`.
  - `payerPhone` / `payerAccount`: Optional customer account identifiers.
  - `providerTransactionId` / `providerReference`: External provider references.
  - `metadata`: JSON payload containing initiation details and capture payloads.
  - Timestamps: `authorizedAt`, `capturedAt`, `failedAt`, `createdAt`, `updatedAt`.

- **`PaymentTransaction`**: Audit log of provider interactions for a payment.
  - `id`: CUID Primary Key.
  - `paymentId`: References `Payment.id`.
  - `action`: `INITIALIZE`, `WEBHOOK_CAPTURE`, `ADMIN_BANK_VERIFY`, `COD_COLLECTED`, `WEBHOOK_FAILED`.
  - `requestPayload`, `responsePayload`: JSON snapshots.
  - `statusCode`: HTTP status or response code.
  - `isSuccess`: Boolean flag.

- **`ProviderWebhookEvent`**: Webhook deduplication and audit trail.
  - `id`: CUID Primary Key.
  - `provider`: Provider name.
  - `eventId`: Provider-issued event ID (`@@unique([provider, eventId])`).
  - `eventType`: Event category string.
  - `payload`, `headers`: JSON snapshots.
  - `status`: `RECEIVED`, `PROCESSING`, `PROCESSED`, `FAILED`, `IGNORED`.

---

### 1.2 Financial Ledger & Double-Entry Models
- **`LedgerAccount`**: Standard chart of accounts and merchant sub-accounts.
  - `id`: CUID Primary Key.
  - `accountCode`: Unique identifier (`1010`, `1020`, `1030`, `2010`, `4010`, `5010`, or `2010-{sellerId}`).
  - `accountName`: Human-readable label.
  - `accountType`: `ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE`.
  - `balance`: `Decimal(14, 2)`.
  - `sellerId`: Optional foreign key to `SellerProfile.id` for seller payable accounts.

- **`LedgerTransaction`**: Group of balanced ledger entries.
  - `id`: CUID Primary Key.
  - `transactionNumber`: Unique identifier (`LTX-timestamp-rand`).
  - `referenceType`: `PAYMENT_CAPTURE`, `REFUND`, `SELLER_PAYOUT`, etc.
  - `referenceId`: ID of the triggering entity.
  - `description`: Explanatory text.
  - `postedAt`: Timestamp of posting.

- **`LedgerEntry`**: Individual debit or credit line.
  - `id`: CUID Primary Key.
  - `transactionId`: References `LedgerTransaction.id`.
  - `accountId`: References `LedgerAccount.id`.
  - `direction`: `DEBIT` or `CREDIT`.
  - `amount`: `Decimal(12, 2)`.

---

### 1.3 Commission & Seller Payout Models
- **`PayoutBatch`**: Daily cycle batch.
  - `id`: CUID Primary Key.
  - `batchNumber`: Unique identifier (`BATCH-YYYYMMDD-hex`).
  - `cycleDate`: Date of payout run.
  - `status`: `PENDING_REVIEW`, `APPROVED`, `PROCESSING`, `COMPLETED`, `CANCELLED`.
  - `totalAmount`: `Decimal(14, 2)`.
  - `totalPayoutsCount`: Number of seller payouts.
  - `approvedByAdminId`: Admin User ID who approved the batch.

- **`SellerPayout`**: Single seller payout record.
  - `id`: CUID Primary Key.
  - `payoutNumber`: Unique reference (`PAYOUT-timestamp-hex`).
  - `batchId`: References `PayoutBatch.id`.
  - `sellerId`: References `SellerProfile.id`.
  - `amount`: `Decimal(12, 2)`.
  - `method`: `ZAAD`, `EVC_PLUS`, `EDAHAB`, `BANK_TRANSFER`, etc.
  - `destinationAccount`: Account identifier snapshot.
  - `status`: `SCHEDULED`, `PROCESSING`, `PAID`, `FAILED`, `REVERSED`.

---

### 1.4 Refund Model
- **`Refund`**: Full or partial customer refund.
  - `id`: CUID Primary Key.
  - `refundNumber`: Unique reference (`REF-timestamp-hex`).
  - `paymentId`: References `Payment.id`.
  - `orderId`: References `Order.id`.
  - `subOrderId`: Optional reference to specific `SubOrder.id`.
  - `amount`: `Decimal(12, 2)`.
  - `reason`: `RefundReason` enum.
  - `status`: `PENDING`, `APPROVED`, `PROCESSING`, `COMPLETED`, `FAILED`, `REJECTED`.
  - `sellerDebitAmount`: `Decimal(12, 2)` debited from merchant liability.
  - `commissionRefundAmount`: `Decimal(12, 2)` reversed from marketplace commission.
  - `providerRefundId`: External provider reference.
