# SUUQZO MALL — INVENTORY INTEGRATION & STOCK MOVEMENTS
## Phase 05 Technical Specification

### 1. Relational Inventory Model

Every product variant in each store maintains an isolated `InventoryItem` record and an append-only `StockMovement` audit ledger:

```prisma
model InventoryItem {
  id                String                 @id @default(cuid())
  variantId         String
  storeId           String
  quantityOnHand    Int                    @default(0)
  reservedQuantity  Int                    @default(0)
  lowStockThreshold Int                    @default(5)
  createdAt         DateTime               @default(now())
  updatedAt         DateTime               @updatedAt

  variant           ProductVariant         @relation(fields: [variantId], references: [id], onDelete: Cascade)
  store             Store                  @relation(fields: [storeId], references: [id], onDelete: Cascade)
  reservations      InventoryReservation[]
  movements         StockMovement[]

  @@unique([variantId, storeId])
  @@index([storeId])
}

model StockMovement {
  id              String            @id @default(cuid())
  inventoryItemId String
  type            StockMovementType
  quantityChange  Int
  quantityBefore  Int
  quantityAfter   Int
  referenceType   String?
  referenceId     String?
  notes           String?
  createdById     String?
  createdAt       DateTime          @default(now())

  inventoryItem   InventoryItem     @relation(fields: [inventoryItemId], references: [id], onDelete: Restrict)

  @@index([inventoryItemId, createdAt])
}
```

---

### 2. Transactional Invariants & Negative Stock Guard

#### 2.1 The Negative Stock Invariant
- **Rule**: `quantityAfter = quantityBefore + quantityChange >= 0`.
- **Enforcement**: Any deduction attempting to reduce on-hand inventory below zero immediately aborts the transaction:
  ```typescript
  if (quantityAfter < 0) {
    throw new BadRequestException(
      `Insufficient stock. Current on-hand: ${quantityBefore}, attempted reduction: ${Math.abs(dto.quantityChange)}. Negative inventory is prohibited.`,
    );
  }
  ```

#### 2.2 Atomic Ledger Generation
Every modification generates a permanent `StockMovement` row recording:
- `quantityBefore` & `quantityAfter`
- Movement type (`INITIAL_STOCK`, `RESTOCK`, `PURCHASE_RESERVE`, `PURCHASE_FULFILL`, `RESERVATION_EXPIRED`)
- `createdById` (actor accountable for adjustment)
- Descriptive operational notes.

---

### 3. Low-Stock Alerts & Availability Calculation

#### 3.1 Real-Time Available Quantity
```
availableQuantity = MAX(0, quantityOnHand - reservedQuantity)
isInStock = availableQuantity > 0
```
- Available stock is queried via `GET /api/v1/inventory/availability/:variantId/:storeId`.

#### 3.2 Low-Stock Notification Dispatch
- When `quantityOnHand <= lowStockThreshold`, the system automatically sends a notification to the vendor:
  - Title: `"Low Stock Alert"`
  - Body: Specifying variant title, SKU, store name, and remaining units.
