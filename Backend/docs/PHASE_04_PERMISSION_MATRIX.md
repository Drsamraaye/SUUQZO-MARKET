# SUUQZO MALL — PHASE 04 PERMISSION & RBAC MATRIX
## Role-Based Access Control and Granular Authorization Mapping

### 1. Role Hierarchy & Built-In Capabilities

| Role | Target Persona | Scope & Inherent Permissions |
|---|---|---|
| `SUPER_ADMIN` | Executive Platform Owners | Unrestricted bypass across all endpoints, guards, and administrative actions. Exclusively authorizes administrative role assignments (`ADMIN`, `SUPER_ADMIN`). |
| `ADMIN` | Platform Operations & Security | Full administrative operational access gated by granular `admin.*` permissions stored in `AdminProfile.permissions`. Protected from status manipulation by regular admins. |
| `SUPPORT` | Customer Care & Operations | Read-only inspection of accounts and ticketing context; cannot suspend, ban, or approve applications. |
| `SELLER` | Verified Vendors | Authorized to manage owned stores, upload products, manage inventory and fulfill sub-orders. Cannot modify platform config or escalate roles. |
| `CUSTOMER` | Marketplace Consumers | Standard buyer role. Authorized to manage self profile, view catalog, submit seller onboarding application. |

---

### 2. Phase 04 Granular Permission Catalog

| Permission Identifier | Domain | Scope Description |
|---|---|---|
| `admin.users.view` | Users | List platform users with pagination, multi-field search, and role/status filtering. |
| `admin.users.edit` | Users | Modify profile fields on any user account. |
| `admin.users.suspend` | Users | Transition user accounts to `SUSPENDED`, `BANNED`, or `DEACTIVATED`. |
| `admin.users.ban` | Users | Permanent ban enforcement against malicious users. |
| `admin.users.roles` | Users | Administrative role allocation (restricted to `SUPER_ADMIN`). |
| `admin.sellers.view` | Sellers | View seller onboarding applications and KYC verification pipelines. |
| `admin.sellers.review` | Sellers | Review and adjudicate KYC legal documents (`APPROVED` / `REJECTED`). |
| `admin.sellers.approve` | Sellers | Formally approve seller applications and trigger transactional role elevation. |
| `admin.sellers.reject` | Sellers | Reject seller applications with formal justification. |
| `admin.sellers.suspend` | Sellers | Suspend verified seller accounts due to policy infractions. |
| `admin.sellers.docs.view` | Sellers | Inspect private KYC identity documents and registration certificates. |
| `admin.stores.view` | Stores | Inspect all stores across all statuses (`ACTIVE`, `INACTIVE`, `SUSPENDED`). |
| `admin.stores.review` | Stores | Review store details and compliance. |
| `admin.stores.approve` | Stores | Reinstate, suspend, or feature stores on the platform. |
| `admin.stores.suspend` | Stores | Suspend rogue storefronts and freeze listings. |

---

### 3. Endpoint-to-Permission Matrix

| Endpoint | Method | Required Roles | Required Permission | Ownership Rule |
|---|---|---|---|---|
| `/api/v1/users` | `GET` | `ADMIN`, `SUPER_ADMIN` | `admin.users.view` | N/A |
| `/api/v1/users/:id` | `GET` | Any Authenticated | None | Caller must be self user OR `ADMIN`/`SUPER_ADMIN` |
| `/api/v1/users/:id` | `PATCH` | Any Authenticated | `admin.users.edit` (if not self) | Caller must be self user OR `ADMIN`/`SUPER_ADMIN` |
| `/api/v1/users/:id/status` | `PATCH` | `ADMIN`, `SUPER_ADMIN` | `admin.users.suspend` | Self-modification blocked. Admin cannot ban `SUPER_ADMIN`. |
| `/api/v1/users/:id/roles` | `POST` | `SUPER_ADMIN` | `admin.users.roles` | Only `SUPER_ADMIN`. Self-modification blocked. |
| `/api/v1/users/:id/audit` | `GET` | Any Authenticated | None | Caller must be self user OR `ADMIN`/`SUPER_ADMIN` |
| `/api/v1/sellers/apply` | `POST` | Any Authenticated | None | Applies to caller account. Cannot re-apply if `VERIFIED`. |
| `/api/v1/sellers/me` | `GET` | Any Authenticated | None | Scoped strictly to caller's `SellerProfile`. |
| `/api/v1/sellers/kyc-documents` | `POST` | Any Authenticated | None | Links to caller's seller application. |
| `/api/v1/sellers/applications` | `GET` | `ADMIN`, `SUPER_ADMIN` | `admin.sellers.view` | N/A |
| `/api/v1/sellers/applications/:id` | `GET` | `ADMIN`, `SUPER_ADMIN` | `admin.sellers.view` | N/A |
| `/api/v1/sellers/applications/:id/review` | `PATCH` | `ADMIN`, `SUPER_ADMIN` | `admin.sellers.approve` | Admin cannot approve own application (anti-conflict). |
| `/api/v1/sellers/kyc-documents/:id/review` | `PATCH` | `ADMIN`, `SUPER_ADMIN` | `admin.sellers.review` | Admin cannot verify own document. |
| `/api/v1/sellers/:id/documents` | `GET` | Any Authenticated | `admin.sellers.docs.view` | Caller must own seller profile OR `ADMIN`/`SUPER_ADMIN`. |
| `/api/v1/stores` | `GET` | Public | None | Returns active stores only. |
| `/api/v1/stores/slug/:slug` | `GET` | Public | None | Returns store details. |
| `/api/v1/stores/:id` | `GET` | Public | None | Returns store details. |
| `/api/v1/stores/seller/my-stores` | `GET` | `SELLER` | None | Scoped strictly to caller's stores. |
| `/api/v1/stores` | `POST` | `SELLER`, `ADMIN`, `SUPER_ADMIN` | None | Seller must have `SellerProfile.verificationStatus === VERIFIED`. |
| `/api/v1/stores/:id` | `PATCH` | Any Authenticated | None | Caller must own store OR `ADMIN`/`SUPER_ADMIN`. Seller cannot unsuspend. |
| `/api/v1/stores/admin/all` | `GET` | `ADMIN`, `SUPER_ADMIN` | `admin.stores.view` | N/A |
| `/api/v1/stores/:id/admin-review` | `PATCH` | `ADMIN`, `SUPER_ADMIN` | `admin.stores.approve` | N/A |
