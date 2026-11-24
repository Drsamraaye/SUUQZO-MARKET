# SUUQZO MALL — Database Audit Report
**Audit Date:** 2026-11-24  
**Schema File:** `Backend/prisma/schema.prisma` (1523 lines)  
**Database Provider:** Supabase PostgreSQL (aws-1-eu-north-1.pooler.supabase.com)  
**ORM:** Prisma 7 (prisma-client-js)

---

## 1. Schema Overview

| Category | Count |
|---|---|
| Total Models | 51+ |
| Enums | 29 |
| Domain Areas | 10 |

---

## 2. Enums Catalogue

| Enum | Values |
|---|---|
| `UserRole` | SUPER_ADMIN, ADMIN, SUPPORT, SELLER, CUSTOMER, RIDER |
| `UserStatus` | PENDING_VERIFICATION, ACTIVE, SUSPENDED, BANNED, DEACTIVATED |
| `SellerVerificationStatus` | UNVERIFIED, PENDING_REVIEW, VERIFIED, REJECTED, SUSPENDED |
| `PayoutMethodType` | ZAAD, EVC_PLUS, EDAHAB, BANK_TRANSFER, PREMIER_WALLET |
| `StoreStatus` | ACTIVE, INACTIVE, VACATION, SUSPENDED |
| `RiderStatus` | OFFLINE, ONLINE, BUSY, SUSPENDED |
| `RiderVerificationStatus` | PENDING_REVIEW, VERIFIED, REJECTED, SUSPENDED |
| `VehicleType` | BICYCLE, MOTORCYCLE, CAR, VAN |
| `ProductStatus` | DRAFT, PENDING_REVIEW, PUBLISHED, REJECTED, ARCHIVED |
| `StockMovementType` | INITIAL_STOCK, RESTOCK, PURCHASE_RESERVE, PURCHASE_FULFILL, RESERVATION_EXPIRED, RETURN_RESTOCK, MANUAL_ADJUSTMENT, DAMAGED_EXPIRED |
| `ReservationStatus` | ACTIVE, CONSUMED, RELEASED, EXPIRED |
| `CartStatus` | ACTIVE, ABANDONED, CHECKED_OUT, MERGED |
| `ParentOrderStatus` | PENDING_PAYMENT, PAYMENT_PROCESSING, CONFIRMED, PARTIALLY_FULFILLED, FULFILLED, CANCELLED, REFUNDED |
| `SubOrderStatus` | PENDING_ACCEPTANCE, CONFIRMED, PROCESSING_PACKING, READY_FOR_PICKUP, ASSIGNED_FOR_DELIVERY, OUT_FOR_DELIVERY, DELIVERED, CANCELLED, REFUNDED, DISPUTED |
| `OrderItemStatus` | PENDING, FULFILLED, CANCELLED, RETURNED |
| `DeliveryTaskStatus` | UNASSIGNED, OFFERED_TO_RIDER, ACCEPTED, ARRIVED_AT_STORE, PARCEL_PICKED_UP, EN_ROUTE, ARRIVED_AT_CUSTOMER, DELIVERED, FAILED_ATTEMPT, RETURNED_TO_STORE, CANCELLED |
| `PaymentStatus` | PENDING, REQUIRES_ACTION, AUTHORIZED, CAPTURED, FAILED, PARTIALLY_REFUNDED, REFUNDED, VOIDED |
| `PaymentMethod` | ZAAD, EVC_PLUS, EDAHAB, BANK_TRANSFER, CASH_ON_DELIVERY, PREMIER_WALLET |
| `WebhookProcessStatus` | RECEIVED, PROCESSING, PROCESSED, FAILED, IGNORED |
| `LedgerAccountType` | ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE |
| `LedgerEntryDirection` | DEBIT, CREDIT |
| `PayoutBatchStatus` | PENDING_REVIEW, APPROVED, PROCESSING, COMPLETED, PARTIALLY_FAILED, CANCELLED |
| `PayoutStatus` | SCHEDULED, PROCESSING, PAID, FAILED, REVERSED |
| `RefundStatus` | PENDING, APPROVED, PROCESSING, COMPLETED, FAILED, REJECTED |
| `RefundReason` | ITEM_OUT_OF_STOCK, CUSTOMER_CANCELLED, RETURN_ACCEPTED, DAMAGED_ITEM, UNDELIVERED, DISPUTE_SETTLEMENT |
| `ReturnStatus` | REQUESTED, APPROVED_BY_SELLER, REJECTED_BY_SELLER, ITEM_SHIPPED, ITEM_RECEIVED_STORE, INSPECTED_PASSED, INSPECTED_FAILED, REFUND_ISSUED, CLOSED |
| `DisputeStatus` | OPEN, EVIDENCE_SUBMISSION, UNDER_ADMIN_REVIEW, RESOLVED_REFUND_CUSTOMER, RESOLVED_FAVOR_SELLER, DISMISSED |
| `DiscountType` | PERCENTAGE, FIXED_AMOUNT |
| `NotificationChannel` | IN_APP, SMS, EMAIL, PUSH |
| `TicketPriority` | LOW, NORMAL, HIGH, URGENT |
| `TicketStatus` | OPEN, IN_PROGRESS, WAITING_ON_CUSTOMER, RESOLVED, CLOSED |
| `OtpPurpose` | PHONE_VERIFICATION, EMAIL_VERIFICATION, LOGIN, PASSWORD_RESET, SENSITIVE_ACTION |

---

## 3. Domain Models

### Domain 1 — Identity, Authentication & Sessions
| Model | Key Fields | Indexes/Constraints |
|---|---|---|
| `User` | id (cuid), phone (unique), email (unique?), passwordHash, role, assignedRoles[], status, twoFactorEnabled, failedLoginAttempts, lockoutUntil | `@@index([role, status])` |
| `UserSession` | id, userId, tokenHash (unique), ipAddress, userAgent, expiresAt, isRevoked | `@@index([userId, isRevoked])` |
| `RefreshToken` | id, userId, sessionId, tokenHash (unique), family, isRevoked, expiresAt | `@@index([userId, family])`, `@@index([sessionId])` |
| `PasswordResetToken` | id, userId, tokenHash (unique), expiresAt, isConsumed | `@@index([userId, isConsumed])` |
| `OtpVerification` | id, target, purpose, codeHash, attempts, maxAttempts, expiresAt, isConsumed, resendAfter | `@@index([target, purpose, isConsumed])` |

### Domain 2 — Customer Management
| Model | Key Fields |
|---|---|
| `CustomerProfile` | userId (unique), firstName, lastName, loyaltyPoints, totalSpent, totalOrdersCount |
| `DeliveryAddress` | userId, label, street, city, district, coordinates |
| `Wishlist` | userId (unique) |
| `WishlistItem` | wishlistId + variantId (unique together) |

### Domain 3 — Seller & Store Management
| Model | Key Fields |
|---|---|
| `SellerProfile` | userId (unique), businessName, verificationStatus, kycDocuments |
| `KycDocument` | sellerProfileId, documentType, documentUrl, verificationStatus |
| `Store` | sellerId, name, slug (unique), status, adminReviewNotes |
| `StoreSettings` | storeId (unique), commissionRate, payoutSchedule |

### Domain 4 — Rider Management
| Model | Key Fields |
|---|---|
| `RiderProfile` | userId (unique), nationalIdNumber, vehicleType, verificationStatus, status |

### Domain 5 — Product & Inventory
| Model | Key Fields |
|---|---|
| `Category` | name, slug (unique), parentId (self-ref), isActive |
| `Brand` | name, slug (unique) |
| `Product` | storeId, name, slug, `@@unique([storeId, slug])`, status, basePrice |
| `ProductVariant` | productId, sku (unique), price, stock |
| `ProductImage` | productId/variantId, imageUrl, isPrimary, sortOrder |
| `Inventory` | variantId + storeId (unique), quantityOnHand, reservedQuantity |
| `StockMovement` | inventoryId, type, quantityDelta, referenceId |
| `StockReservation` | inventoryId, quantity, status, expiresAt |

### Domain 6 — Cart & Orders (Schema only — NOT implemented)
| Model | Status |
|---|---|
| `Cart`, `CartItem` | Schema exists, NO service/controller |
| `ParentOrder`, `SubOrder`, `OrderItem` | Schema exists, NO service/controller |
| `DeliveryTask` | Schema exists, NO service/controller |

### Domain 7 — Payments & Financial Ledger (Schema only — NOT implemented)
| Model | Status |
|---|---|
| `Payment`, `PaymentWebhookEvent` | Schema exists, NO service/controller |
| `LedgerAccount`, `LedgerEntry` | Schema exists, NO service/controller |
| `Wallet`, `WalletTransaction` | Schema exists, NO service/controller |
| `PayoutBatch`, `Payout` | Schema exists, NO service/controller |
| `Refund`, `Return`, `Dispute` | Schema exists, NO service/controller |

### Domain 8 — Platform Operations
| Model | Status |
|---|---|
| `Coupon`, `CouponUsage` | Schema exists, NOT implemented |
| `Notification` | ✅ Implemented via NotificationsService |
| `AuditLog` | ✅ Implemented via AuditLogsService |
| `SupportTicket`, `TicketMessage` | Schema exists, NOT implemented |
| `Message` | Schema exists, NOT implemented |

---

## 4. Database Connectivity Verification

**Test:** `npx vitest run test/integration/nestjs-integration.spec.ts`  
**Result:** 3 / 3 PASSED  
- Database connectivity confirmed
- Prisma client operation verified
- Connection pool: Supabase Pooler (pgbouncer mode)

> [!NOTE]  
> **Known issue**: Supabase pgbouncer connection pooler has strict transaction timeout limits. Under parallel test load, `$transaction()` calls may fail with "Unable to start a transaction in the given time." This affects `independent-audit.spec.ts` test 2.1 (register) causing 14 cascade failures. All other tests pass. Root cause: pool exhaustion when multiple test files share a single Supabase free-tier pooler. **Workaround**: `fileParallelism: false` is set but `independent-audit.spec.ts` still hits timeout when running alongside other long files.

---

## 5. Schema Integrity Notes

| Check | Result |
|---|---|
| `ProductVariant.sku` global uniqueness | ✅ `@unique` |
| `Product` slug uniqueness | ✅ `@@unique([storeId, slug])` — per-store |
| `Store.slug` uniqueness | ✅ `@unique` |
| `Category.slug` uniqueness | ✅ `@unique` |
| `Brand.slug` uniqueness | ✅ `@unique` |
| `RefreshToken` stored as hash only | ✅ `tokenHash` field, raw never persisted |
| `PasswordResetToken` stored as hash only | ✅ `tokenHash` field |
| `OtpVerification` code stored as hash | ✅ `codeHash` field |
| Cascade deletes on User | ✅ All child relations use `onDelete: Cascade` |
| `twoFactorSecret` encrypted at rest | ✅ AES-256-GCM via TwoFactorService |

---

*No schema changes were made during this audit.*
