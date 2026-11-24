# SUUQZO MALL — PHASE 06 ORDER LIFECYCLE & STATE RECONCILIATION

---

## 1. SubOrder State Lifecycle

Each `SubOrder` progresses through well-defined operational states:

```mermaid
stateDiagram-v2
    [*] --> PENDING_ACCEPTANCE: Checkout Placed
    PENDING_ACCEPTANCE --> CONFIRMED: Seller Accepts
    PENDING_ACCEPTANCE --> CANCELLED: Seller Rejects / Customer Cancels
    CONFIRMED --> PROCESSING_PACKING: Seller Starts Packing
    CONFIRMED --> CANCELLED: Customer / Admin Cancels
    PROCESSING_PACKING --> READY_FOR_PICKUP: Seller Packed & Ready
    READY_FOR_PICKUP --> ASSIGNED_FOR_DELIVERY: Phase 08 Rider Assigned
    ASSIGNED_FOR_DELIVERY --> OUT_FOR_DELIVERY: Phase 08 Rider Picked Up
    OUT_FOR_DELIVERY --> DELIVERED: Phase 08 Customer Received
    DELIVERED --> [*]
    CANCELLED --> [*]
```

### Transition Validation Rules (Seller Actions):
- **PENDING_ACCEPTANCE**: May transition to `CONFIRMED` or `CANCELLED`.
- **CONFIRMED**: May transition to `PROCESSING_PACKING` or `CANCELLED`.
- **PROCESSING_PACKING**: May transition to `READY_FOR_PICKUP`.
- **READY_FOR_PICKUP**: Handed off to logistics (Phase 08).
- **Direct jumps (e.g. `PENDING_ACCEPTANCE -> DELIVERED`)**: Strictly forbidden with `BadRequestException`.

---

## 2. Parent Order State Reconciliation

The `ParentOrderStatus` dynamically reflects the aggregate progress of its suborders:

```mermaid
flowchart TD
    A[SubOrder Status Updated] --> B{Are ALL SubOrders Cancelled?}
    B -- Yes --> C[Parent Order = CANCELLED]
    B -- No --> D{Are ALL SubOrders Delivered?}
    D -- Yes --> E[Parent Order = FULFILLED]
    D -- No --> F{Any SubOrder Delivered or In Processing?}
    F -- Yes --> G[Parent Order = PARTIALLY_FULFILLED]
    F -- No --> H[Retain Existing Parent Order Status]
```

### Reconciliation Rules:
1. If **all** suborders reach `CANCELLED`, parent order moves to `CANCELLED`.
2. If **all** suborders reach `DELIVERED`, parent order moves to `FULFILLED`.
3. If **any** suborder is `DELIVERED`, `OUT_FOR_DELIVERY`, `READY_FOR_PICKUP`, or `PROCESSING_PACKING`, parent order transitions to `PARTIALLY_FULFILLED`.

---

## 3. Order Cancellation Logic

### Customer Cancellation
- Allowed only when order is in `PENDING_PAYMENT` or all suborders are in `PENDING_ACCEPTANCE` or `CONFIRMED`.
- Once any suborder enters `PROCESSING_PACKING`, customer cancellation is **blocked** to protect merchant inventory and preparation costs.

### Cancellation Effects:
1. Parent order status set to `CANCELLED`.
2. All active suborders set to `CANCELLED`.
3. Associated `InventoryReservation` records set to `RELEASED`.
4. `reservedQuantity` on `InventoryItem` decremented by the cancelled quantity.
5. `StockMovement` logged with `type: RETURN_RESTOCK`.
