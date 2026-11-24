# SUUQZO MALL — PRODUCT MANAGEMENT ARCHITECTURE
## Phase 05 Technical Specification

### 1. Architectural Overview

The SUUQZO MALL Product Catalog domain provides a multi-tenant, multi-variant, inventory-integrated catalog service. It links physical vendor storefronts (`Store`) to standardized platform taxonomy (`Category`, `Brand`), supporting rich product attributes, multiple image galleries, SKU variants, and real-time inventory tracking.

```
+------------------------------------+
|            model Store             |
|  id, sellerId, name, slug, status  |
+-----------------+------------------+
                  | 1:N
+-----------------v------------------+       +-------------------+
|           model Product            |       |  model Category   |
|  id, storeId, categoryId, brandId  +------>+  id, name, slug   |
|  title, slug, description, status  |       |  level, parentId  |
|  basePrice, compareAtPrice         |       +-------------------+
+--------+------------------+--------+
         | 1:N              | 1:N
+--------v-------+  +-------v--------+
| ProductVariant |  |  ProductImage  |
| sku, barcode   |  |  url, sortOrder|
| price, attrs   |  |  isPrimary     |
+--------+-------+  +----------------+
         | 1:N
+--------v-------+
| InventoryItem  |
| onHand, reserv |
+----------------+
```

---

### 2. Store Ownership & Tenant Isolation

1. **Client Identity Independence**: The system never trusts `sellerId`, `storeId`, or `ownerId` supplied in client payloads.
2. **Store Ownership Verification**:
   ```typescript
   const store = await this.prisma.store.findUnique({
     where: { id: dto.storeId },
     include: { seller: true },
   });
   if (userRole !== UserRole.ADMIN && store.seller.userId !== userId) {
     throw new ForbiddenException('Access denied. You do not own this store.');
   }
   ```
3. **Store Status Enforcement**: Products cannot be created or published in inactive or suspended stores (`store.status !== StoreStatus.ACTIVE`).
4. **Cross-Tenant Masking**: Suspended stores automatically mask all their published products from public catalog search and direct API lookups.

---

### 3. Product Status Lifecycle & State Machine

```
[ DRAFT ] ────────► POST /submit-review ──────► [ PENDING_REVIEW ]
    ▲                                                   │
    │ (REQUEST_CHANGES)                                 ├───────────┐
    │                                                   ▼ (APPROVE) │ (REJECT)
    └───────────────────────────────────────────── [ PUBLISHED ] [ REJECTED ]
                                                        │
                                                        ▼ (SUSPEND)
                                                   [ ARCHIVED ]
```

- **DRAFT**: Newly created product undergoing edits by the vendor.
- **PENDING_REVIEW**: Submitted for administrative review. Locked from unapproved public visibility.
- **PUBLISHED**: Formally approved by platform administrator. Available in public search and category browsing.
- **REJECTED**: Rejected with administrative feedback.
- **ARCHIVED**: Soft-deleted or suspended by platform operations.

---

### 4. Slug Uniqueness & Pricing Architecture

#### 4.1 Compound Store-Slug Scope
- Products enforce compound uniqueness: `@@unique([storeId, slug])`.
- Two distinct stores can independently sell products with the slug `macbook-pro-m3` without namespace collisions.
- Slugs are auto-generated from product titles and validated against lower-case alphanumeric-hyphen regex patterns.

#### 4.2 Decimal-Safe Pricing
- Uses PostgreSQL `DECIMAL(12, 2)` to eliminate JavaScript IEEE-754 floating-point precision loss.
- Invariants:
  - `basePrice >= 0`
  - `compareAtPrice >= basePrice` (representing discount or original list price).
