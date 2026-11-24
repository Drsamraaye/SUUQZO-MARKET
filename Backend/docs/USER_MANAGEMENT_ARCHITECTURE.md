# SUUQZO MALL — USER MANAGEMENT ARCHITECTURE
## Phase 04 Technical Specification

### 1. Architectural Overview

The SUUQZO MALL User Management domain provides a unified, secure, and multi-tenant identity administration service. It builds directly upon the Phase 03 Authentication & Authorization foundation, decoupling core credentials (`User`) from domain-specific profile records (`CustomerProfile`, `SellerProfile`, `AdminProfile`, `RiderProfile`).

```
                +------------------------------------+
                |            model User              |
                |  id, phone, email, passwordHash    |
                |  role, assignedRoles, status       |
                +-----------------+------------------+
                                  | 1:1
        +-------------------------+-------------------------+
        |                         |                         |
+-------v---------+       +-------v---------+       +-------v---------+
| CustomerProfile |       |  SellerProfile  |       |  AdminProfile   |
| firstName       |       |  businessName   |       |  fullName       |
| lastName        |       |  taxId, status  |       |  department     |
| preferences     |       |  commissionRate |       |  permissions    |
+-----------------+       +-----------------+       +-----------------+
```

---

### 2. Core Capabilities

#### 2.1 Paginated User Ingestion & Multi-field Search
- **Endpoint**: `GET /api/v1/users`
- **Guards**: `@Roles(ADMIN, SUPER_ADMIN)`, `@RequirePermissions('admin.users.view')`
- **Features**:
  - Pagination parameters (`page` with default 1, `limit` with min 1, max 100).
  - Filtering by `status` (`PENDING_VERIFICATION`, `ACTIVE`, `SUSPENDED`, `BANNED`, `DEACTIVATED`).
  - Filtering by `role` (matches primary role or any element in `assignedRoles`).
  - Multi-field search querying phone numbers, email addresses, and names across customer and seller profiles.

#### 2.2 Safe User Profile Projections
- Public and administrative retrieval endpoints strictly exclude sensitive authentication secrets:
  - `passwordHash` (Argon2id digest) is **never** projected.
  - `twoFactorSecret` (AES-256-GCM ciphertext) is **never** projected.
- Returns comprehensive user identity metadata along with joined customer, seller, rider, and admin profile data.

#### 2.3 Profile Modifications & Ownership Gates
- Standard users are strictly restricted to modifying their own profile:
  - Validates `targetUserId === actorId`.
  - Ensures unique email address across all accounts if modified.
  - Updates customer profile attributes: `firstName`, `lastName`, `avatarUrl`, `preferredLanguage`, `preferredCurrency`.
  - Generates immutable `AuditLog` entry detailing old and new values.

---

### 3. Account Status Lifecycle & Session Invalidation

Accounts progress through distinct operational states:

```
[ PENDING_VERIFICATION ]
         │
         ▼ (Phone / Email verified)
    [ ACTIVE ] ◄──────────────────────────────┐
         │                                    │ Reinstate
         ├──────────────┬─────────────────┐   │ (Admin audit required)
         ▼              ▼                 ▼   │
   [ SUSPENDED ]    [ BANNED ]     [ DEACTIVATED ]
         │              │                 │
         └──────────────┴─────────────────┴─── All active sessions & tokens revoked
```

#### 3.1 Session & Refresh Token Revocation
When an administrator suspends, bans, or deactivates an account:
1. `User.status` is updated within a Prisma transaction.
2. All active `UserSession` records where `isRevoked: false` are set to `isRevoked: true`.
3. All active `RefreshToken` records where `isRevoked: false` are set to `isRevoked: true`.
4. Subsequent requests using existing bearer tokens or attempting refresh token rotation fail immediately.

#### 3.2 Defensive Privilege Constraints
- **Self-Status Modification**: Administrators are forbidden from changing their own status (prevents accidental lockout or rogue state manipulation).
- **Super Admin Protection**: `SUPER_ADMIN` accounts cannot be suspended or banned by regular `ADMIN` accounts.
- **Audit Logging**: Every status transition logs `actorId`, `oldStatus`, `newStatus`, and the mandatory `reason`.
- **User Notification**: Targeted notification is automatically dispatched to the affected user explaining the action.

---

### 4. Role Assignment & Escalation Defense

The platform uses a hybrid primary/assigned roles model (`user.role: UserRole`, `user.assignedRoles: UserRole[]`):

1. **Self-Escalation Barrier**: Users (customers, sellers, riders, admins) cannot add or remove roles from their own account.
2. **Super Admin Guard**: Only accounts with `SUPER_ADMIN` can assign or remove administrative roles (`ADMIN`, `SUPER_ADMIN`).
3. **Non-Empty Role Set**: Users cannot have their last remaining role removed.
4. **Primary Role Synchronization**: When a role is removed, if it was the primary role, the system atomically promotes an remaining assigned role to primary.
5. **Auditing**: All role modifications are recorded in `AuditLog` with action `USER_ROLE_ADD` or `USER_ROLE_REMOVE`.
