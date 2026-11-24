# SUUQZO MALL — STORE MANAGEMENT ARCHITECTURE
## Phase 04 Technical Specification

### 1. Architectural Overview & Domain Relationships

The Store Management domain models physical and digital vendor storefronts operating within SUUQZO MALL. Each store belongs to a verified `SellerProfile` and serves as the container for catalog products, inventory stock movements, and sub-orders.

```
+------------------------------------+
|         model SellerProfile        |
|  verificationStatus: VERIFIED      |
+-----------------+------------------+
                  | 1:N
+-----------------v------------------+
|            model Store             |
|  id, sellerId, name, slug          |
|  status: ACTIVE | INACTIVE | ...   |
|  city, district, address           |
|  latitude, longitude, phone, email |
|  openingHours, isFeatured          |
+--------+------------------+--------+
         | 1:N              | 1:N
+--------v-------+  +-------v--------+
|    Product     |  |    SubOrder    |
+----------------+  +----------------+
```

---

### 2. Store Creation & Eligibility Gates

#### 2.1 Verification Gate
- To create a store, a user must have an active `SellerProfile` in `VERIFIED` status:
  ```typescript
  if (seller.verificationStatus !== SellerVerificationStatus.VERIFIED) {
    throw new ForbiddenException(
      `Seller verification is required to create a store. Current status: ${seller.verificationStatus}.`,
    );
  }
  ```
- Unverified users, applicants in `PENDING_REVIEW`, or suspended sellers are strictly blocked from provisioning storefronts (`HTTP 403 Forbidden`).

#### 2.2 Slug Normalization & Collision Defense
- Stores require a globally unique URL slug (e.g. `hodan-electronics`).
- When a custom slug is provided, it is validated against alphanumeric-hyphen regex `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`. If a collision is detected, `HTTP 409 Conflict` is returned.
- If omitted, a slug is automatically generated from the store name, appending a pseudo-random suffix on collisions to guarantee uniqueness.

---

### 3. Multi-Tenant Ownership & Isolation

Multi-tenant security ensures complete operational separation between competing vendors:

#### 3.1 Strict Ownership Validation
Every modification request (`PATCH /api/v1/stores/:id`) verifies ownership:
```typescript
const isOwner = store.seller.userId === actorId;
const isAdmin = actorRole === UserRole.ADMIN || actorRole === UserRole.SUPER_ADMIN;

if (!isOwner && !isAdmin) {
  throw new ForbiddenException('Access denied. You do not own this store.');
}
```
Attempted cross-tenant modifications immediately throw `HTTP 403 Forbidden`.

#### 3.2 Suspension & Reinstatement Lock
When a store is suspended by platform administration (e.g., due to dispute investigations, non-compliance, or counterfeit listings):
- The store status is updated to `SUSPENDED`.
- Vendors are strictly prevented from changing the store status back to `ACTIVE`:
  ```typescript
  if (store.status === StoreStatus.SUSPENDED && dto.status !== StoreStatus.SUSPENDED && !isAdmin) {
    throw new ForbiddenException(
      'A suspended store can only be reinstated by a platform administrator.',
    );
  }
  ```
- Reinstatement requires explicit administrative review via `PATCH /api/v1/stores/:id/admin-review`.

---

### 4. Public Catalog Discovery vs. Private Store Operations

| Feature | Endpoint | Access Level | Description |
|---|---|---|---|
| Public Store Directory | `GET /api/v1/stores` | Public (`@Public()`) | Returns active stores with city filter, search, and featured store ordering. |
| Store Details by Slug | `GET /api/v1/stores/slug/:slug` | Public (`@Public()`) | Returns store profile, location, business hours, and seller reputation rating. |
| Seller Stores | `GET /api/v1/stores/seller/my-stores` | Seller (`@CurrentUser()`) | Lists all stores owned by the authenticated vendor. |
| Admin Store Directory | `GET /api/v1/stores/admin/all` | Admin (`admin.stores.view`) | Lists all stores regardless of status (`ACTIVE`, `INACTIVE`, `SUSPENDED`). |
| Administrative Review | `PATCH /api/v1/stores/:id/admin-review` | Admin (`admin.stores.approve`) | Controls status transitions and toggles `isFeatured` flag. |
