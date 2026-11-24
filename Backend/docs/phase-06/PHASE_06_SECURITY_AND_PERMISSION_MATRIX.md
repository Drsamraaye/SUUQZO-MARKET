# SUUQZO MALL — PHASE 06 SECURITY & PERMISSION MATRIX

---

## 1. Access Control Matrix

| Endpoint | Method | Public | Customer | Seller | Admin | Super Admin | Enforced Guard / Permission |
|---|---|:---:|:---:|:---:|:---:|:---:|---|
| `/api/v1/cart/items` | `POST` | ❌ | ✅ | ❌ | ❌ | ❌ | `@Roles(CUSTOMER)` |
| `/api/v1/cart` | `GET` | ❌ | ✅ | ❌ | ❌ | ❌ | `@Roles(CUSTOMER)` |
| `/api/v1/cart/items/:itemId` | `PATCH` | ❌ | ✅ | ❌ | ❌ | ❌ | `@Roles(CUSTOMER)` + Ownership Check |
| `/api/v1/cart/items/:itemId` | `DELETE` | ❌ | ✅ | ❌ | ❌ | ❌ | `@Roles(CUSTOMER)` + Ownership Check |
| `/api/v1/cart` | `DELETE` | ❌ | ✅ | ❌ | ❌ | ❌ | `@Roles(CUSTOMER)` |
| `/api/v1/checkout` | `POST` | ❌ | ✅ | ❌ | ❌ | ❌ | `@Roles(CUSTOMER)` |
| `/api/v1/orders` | `GET` | ❌ | ✅ | ❌ | ❌ | ❌ | `@Roles(CUSTOMER)` |
| `/api/v1/orders/:id` | `GET` | ❌ | ✅ | ❌ | ❌ | ❌ | `@Roles(CUSTOMER)` + Customer IDOR Check |
| `/api/v1/orders/:id/cancel` | `POST` | ❌ | ✅ | ❌ | ❌ | ❌ | `@Roles(CUSTOMER)` + Customer IDOR Check |
| `/api/v1/orders/:id/tracking` | `GET` | ❌ | ✅ | ❌ | ❌ | ❌ | `@Roles(CUSTOMER)` + Customer IDOR Check |
| `/api/v1/seller/orders` | `GET` | ❌ | ❌ | ✅ | ❌ | ❌ | `@Roles(SELLER)` |
| `/api/v1/seller/orders/:id` | `GET` | ❌ | ❌ | ✅ | ❌ | ❌ | `@Roles(SELLER)` + Store Ownership Check |
| `/api/v1/seller/orders/:id/status` | `PATCH` | ❌ | ❌ | ✅ | ❌ | ❌ | `@Roles(SELLER)` + Store Ownership Check |
| `/api/v1/seller/orders/:id/reject` | `POST` | ❌ | ❌ | ✅ | ❌ | ❌ | `@Roles(SELLER)` + Store Ownership Check |
| `/api/v1/admin/orders` | `GET` | ❌ | ❌ | ❌ | ✅ | ✅ | `@RequirePermissions(ADMIN_ORDERS_VIEW)` |
| `/api/v1/admin/orders/:id` | `GET` | ❌ | ❌ | ❌ | ✅ | ✅ | `@RequirePermissions(ADMIN_ORDERS_VIEW)` |
| `/api/v1/admin/orders/:id/status` | `PATCH` | ❌ | ❌ | ❌ | ✅ | ✅ | `@RequirePermissions(ADMIN_ORDERS_MANAGE)` |
| `/api/v1/admin/orders/:id/cancel` | `POST` | ❌ | ❌ | ❌ | ✅ | ✅ | `@RequirePermissions(ADMIN_ORDERS_MANAGE)` |

---

## 2. Security Boundary Protections

### 2.1 Insecure Direct Object Reference (IDOR)
- **Customer Protection**: A customer attempting to access, track, or cancel an order placed by another customer receives an immediate `ForbiddenException`.
- **Seller Isolation**: A merchant attempting to inspect, update the status of, or reject a suborder belonging to another store receives `ForbiddenException`.

### 2.2 Price Tampering Protection
- Request bodies for checkout require only shipping address and optional notes.
- Unit prices, discounts, delivery fees, and order totals submitted in client payloads are strictly ignored.
- The backend queries PostgreSQL directly for active variant prices and calculates subtotals.

### 2.3 Status Escalation Protection
- Merchants cannot skip required operational steps (e.g. attempting to jump from `PENDING_ACCEPTANCE` directly to `DELIVERED`).
- Any non-sequential state transition triggers `BadRequestException`.
