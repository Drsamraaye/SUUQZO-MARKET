# SUUQZO MALL — PRODUCT MODERATION WORKFLOW
## Phase 05 Technical Specification

### 1. Moderation State Machine

The product moderation lifecycle ensures catalog compliance, brand safety, and quality standards:

```
[ Vendor Draft ]
       │
       ▼ POST /api/v1/products/:id/submit-review
       │ (Requires >= 1 variant and >= 1 image)
       │
[ PENDING_REVIEW ] ◄─────────────────────────────────────────────┐
       │                                                         │
       ▼ PATCH /api/v1/products/:id/moderate (Admin)             │ Resubmit
       │                                                         │
       ├──────────────┬──────────────────┬─────────────────┐     │
       ▼ (APPROVE)    ▼ (REJECT)         ▼ (REQUEST_CHANGES)│   │
  [ PUBLISHED ]  [ REJECTED ]       [ DRAFT ] ─────────────┴─────┘
       │
       ▼ (SUSPEND)
  [ ARCHIVED ]
```

---

### 2. Moderation Gates & Actions

| Action | Target Status | Administrative Description | Notification to Vendor |
|---|---|---|---|
| `APPROVE` | `PUBLISHED` | Product meets catalog guidelines and is made visible in storefront search. | `"Your product has been approved and is now live!"` |
| `REJECT` | `REJECTED` | Product violates policy or prohibited items list. Mandatory reason recorded. | Explaining specific rejection rationale. |
| `REQUEST_CHANGES` | `DRAFT` | Minor modifications requested (e.g. clearer images, specifications). | Constructive feedback provided; vendor can edit and resubmit. |
| `SUSPEND` | `ARCHIVED` | Emergency suspension of published product due to copyright or counterfeit claim. | Notifying vendor of active investigation. |

---

### 3. Anti-Conflict & Privilege Protections

#### 3.1 Self-Approval Prevention
- Platform administrators who also hold seller accounts are **strictly forbidden** from moderating or approving products belonging to their own stores:
  ```typescript
  if (product.store.seller.userId === adminId) {
    throw new ForbiddenException(
      'Administrators cannot review or approve products belonging to their own store.',
    );
  }
  ```

#### 3.2 Public Catalog Isolation
- Only products where `status === PUBLISHED` AND `store.status === ACTIVE` are surfaced in public API routes (`GET /api/v1/products`, `GET /api/v1/products/:id`, `GET /api/v1/products/:storeSlug/:productSlug`).
- Products in `DRAFT`, `PENDING_REVIEW`, `REJECTED`, or `ARCHIVED` states, or products whose parent store is `SUSPENDED`, return `HTTP 404 Not Found` for public shoppers.
