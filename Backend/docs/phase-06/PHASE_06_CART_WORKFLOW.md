# SUUQZO MALL — PHASE 06 CART WORKFLOW SPECIFICATION

---

## 1. Overview

The shopping cart in SUUQZO MALL is a multi-vendor customer utility allowing shoppers to aggregate products from distinct merchants into a unified shopping cart.

---

## 2. Cart Operations & Logic

### 2.1 Add to Cart Workflow
1. **Customer Resolution**: Resolve or create customer profile (`CustomerProfile`).
2. **Active Cart Retrieval**: Retrieve current `Cart` with `status: ACTIVE`. If nonexistent, initialize a new cart.
3. **Product & Store Validation**:
   - `ProductVariant` must exist.
   - `Product.status` must equal `PUBLISHED`. If draft/archived, throw `BadRequestException`.
   - `Store.status` must equal `ACTIVE`. If suspended/inactive, throw `BadRequestException`.
4. **Inventory Availability Check**:
   - Check `quantityOnHand - reservedQuantity` on `InventoryItem`.
   - If requested addition exceeds available stock, reject with `BadRequestException`.
5. **Upsert Item**:
   - If variant already in cart, increment quantity (up to available limit).
   - If new variant, insert `CartItem` recording authoritative price.
6. **Store-Grouped Return**: Output cart aggregated by merchant store.

### 2.2 Live Cart Inspection
Whenever `GET /api/v1/cart` is requested:
- Real-time prices are loaded from `ProductVariant.price`.
- If prices changed since addition, `priceChanged: true` is flagged.
- Current live available stock is recalculated. If stock dropped below cart quantity, `stockWarning` is attached.

### 2.3 Item Quantity Mutation & Deletion
- **Quantity Update**: Re-validates that new quantity does not exceed current unreserved inventory.
- **Tenant Isolation**: Only the cart owner (`customerId === cart.customerId`) can update, remove, or clear cart items. Any other caller receives `ForbiddenException`.
- **Cart Clearing**: `DELETE /api/v1/cart` flushes all `CartItem` records for the active cart.
