# SUUQZO MALL — PHASE 06 INVENTORY RESERVATION SPECIFICATION

---

## 1. Overview

Inventory integrity is preserved via a two-phase reservation pattern:
1. `quantityOnHand` represents physical inventory sitting in the store's warehouse.
2. `reservedQuantity` represents items currently locked in pending orders.
3. `availableQuantity = Math.max(0, quantityOnHand - reservedQuantity)`.

---

## 2. Reservation Workflow

### 2.1 Checkout Phase
1. At checkout, inside the database transaction, `availableQuantity` is validated for every line item.
2. An `InventoryReservation` record is inserted with:
   - `status: ACTIVE`
   - `quantity: item.quantity`
   - `orderId: parentOrder.id`
   - `subOrderId: subOrder.id`
   - `expiresAt: now + 30 minutes`
3. `reservedQuantity` on `InventoryItem` is incremented.
4. A `StockMovement` entry is recorded:
   - `type: PURCHASE_RESERVE`
   - `quantityChange: 0` (physical stock has not left warehouse yet)
   - `referenceType: 'CHECKOUT_RESERVATION'`

### 2.2 Order Cancellation Phase
When an order or suborder is cancelled:
1. The reservation status is updated to `RELEASED`.
2. `releasedAt` timestamp is set.
3. `reservedQuantity` on `InventoryItem` is decremented by the reserved amount.
4. A `StockMovement` entry is recorded:
   - `type: RETURN_RESTOCK`
   - `quantityChange: 0`
   - `referenceType: 'ORDER_CANCELLATION'`

### 2.3 Fulfillment Phase (Phase 07/08)
When payment is completed and goods are dispatched, physical `quantityOnHand` is deducted and `reservedQuantity` is decremented in tandem (`StockMovementType.SALE_DISPATCH`).
