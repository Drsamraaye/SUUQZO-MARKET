# SUUQZO MALL — PHASE 06 MULTI-VENDOR CHECKOUT WORKFLOW SPECIFICATION

---

## 1. Overview

The checkout service transforms a multi-vendor customer cart into an atomic set of fulfillment orders inside a single ACID PostgreSQL transaction.

---

## 2. Multi-Vendor Checkout Sequence

```mermaid
flowchart TD
    A[Customer submits Checkout] --> B{Cart Empty?}
    B -- Yes --> C[Reject: BadRequestException]
    B -- No --> D{Idempotency Key Sent?}
    D -- Yes --> E{Order Exists with Key?}
    E -- Yes --> F[Return Existing Order]
    E -- No --> G[Begin Atomic Transaction]
    D -- No --> G

    subgraph "PostgreSQL Transaction (timeout: 30s)"
        G --> H[Validate Store & Variant Status]
        H --> I[Validate Available Stock for All Items]
        I --> J[Calculate 5% Marketplace Commission]
        J --> K[Create Parent Order - PENDING_PAYMENT]
        K --> L[Create SubOrders per Store - PENDING_ACCEPTANCE]
        L --> M[Create OrderItems with Price Snapshots]
        M --> N[Increment reservedQuantity on InventoryItems]
        N --> O[Create InventoryReservations - ACTIVE 30m TTL]
        O --> P[Create StockMovements - PURCHASE_RESERVE]
        P --> Q[Clear CartItems & Mark Cart CHECKED_OUT]
    end

    Q --> R[Commit Transaction]
    R --> S[Log Audit Record]
    R --> T[Dispatch Notifications to Customer & Sellers]
    R --> U[Return Structured Order Response]
```

---

## 3. Financial Splits & Snapshots

For each `SubOrder`:
- **`itemsSubtotal`**: Sum of (`unitPrice * quantity`) for all items from this store.
- **`commissionRate`**: Platform default `0.0500` (5.00%).
- **`commissionAmount`**: `itemsSubtotal * 0.0500` rounded to 2 decimal places.
- **`sellerPayableAmount`**: `itemsSubtotal - commissionAmount`.

Each `OrderItem` snapshots:
- `productTitleSnapshot`
- `variantTitleSnapshot`
- `skuSnapshot`
- `unitPrice` (authoritative variant price at checkout)
- `quantity`
- `totalPrice` (`unitPrice * quantity`)
- `commissionRate` (0.0500)
- `commissionAmount`
- `sellerEarnings`

These values remain completely immutable even if products or store pricing are subsequently altered.
