# Role and Permission Matrix — SUUQZO MALL

**Phase**: 03  
**Date**: 2026-11-23

---

## Roles

| Role | Description | Registration | Notes |
|------|-------------|--------------|-------|
| `CUSTOMER` | End customer | ✅ Public | Default role |
| `SELLER` | Marketplace vendor | ✅ Public | Requires seller profile approval |
| `RIDER` | Delivery rider | ✅ Public | Requires rider verification |
| `ADMIN` | Platform admin | ❌ Internal only | Assigned by SUPER_ADMIN |
| `SUPER_ADMIN` | Root admin | ❌ Internal only | Maximum privileges |

## Endpoint Role Matrix

| Endpoint | Method | Public | CUSTOMER | SELLER | RIDER | ADMIN | SUPER_ADMIN |
|----------|--------|--------|----------|--------|-------|-------|-------------|
| `/api/v1/auth/register` | POST | ✅ | — | — | — | — | — |
| `/api/v1/auth/login` | POST | ✅ | — | — | — | — | — |
| `/api/v1/auth/refresh` | POST | ✅ | — | — | — | — | — |
| `/api/v1/auth/verify-phone` | POST | ✅ | — | — | — | — | — |
| `/api/v1/auth/forgot-password` | POST | ✅ | — | — | — | — | — |
| `/api/v1/auth/reset-password` | POST | ✅ | — | — | — | — | — |
| `/api/v1/auth/me` | GET | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/api/v1/auth/logout` | POST | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/api/v1/auth/logout-all` | POST | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/api/v1/auth/change-password` | POST | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/api/v1/auth/2fa/enroll` | POST | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/api/v1/auth/2fa/confirm` | POST | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/api/v1/auth/2fa/disable` | POST | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |

## Admin Permission Constants

Defined in `src/authorization/permissions/permission.constants.ts`:

| Permission Key | Value | Description |
|----------------|-------|-------------|
| `ADMIN_USERS_VIEW` | `admin.users.view` | View user accounts |
| `ADMIN_USERS_CREATE` | `admin.users.create` | Create user accounts |
| `ADMIN_USERS_EDIT` | `admin.users.edit` | Edit user accounts |
| `ADMIN_USERS_DELETE` | `admin.users.delete` | Delete user accounts |
| `ADMIN_USERS_SUSPEND` | `admin.users.suspend` | Suspend/ban accounts |
| `ADMIN_SELLERS_VIEW` | `admin.sellers.view` | View seller applications |
| `ADMIN_SELLERS_APPROVE` | `admin.sellers.approve` | Approve seller KYC |
| `ADMIN_SELLERS_SUSPEND` | `admin.sellers.suspend` | Suspend seller stores |
| `ADMIN_ORDERS_VIEW` | `admin.orders.view` | View all orders |
| `ADMIN_ORDERS_MANAGE` | `admin.orders.manage` | Manage order states |
| `ADMIN_ORDERS_REFUND` | `admin.orders.refund` | Issue refunds |
| `ADMIN_PAYMENTS_VIEW` | `admin.payments.view` | View payment records |
| `ADMIN_PAYMENTS_MANAGE` | `admin.payments.manage` | Manage payment states |
| `ADMIN_PAYOUTS_VIEW` | `admin.payouts.view` | View payout records |
| `ADMIN_PAYOUTS_APPROVE` | `admin.payouts.approve` | Approve seller payouts |
| `ADMIN_DISPUTES_VIEW` | `admin.disputes.view` | View disputes |
| `ADMIN_DISPUTES_RESOLVE` | `admin.disputes.resolve` | Resolve disputes |
| `ADMIN_CONFIG_VIEW` | `admin.config.view` | View platform config |
| `ADMIN_CONFIG_EDIT` | `admin.config.edit` | Edit platform settings |
| `ADMIN_AUDIT_VIEW` | `admin.audit.view` | View audit logs |
| `ADMIN_ROLES_VIEW` | `admin.roles.view` | View roles |
| `ADMIN_ROLES_EDIT` | `admin.roles.edit` | Edit role assignments |
| `ADMIN_REPORTS_VIEW` | `admin.reports.view` | View reports |
| `ADMIN_REPORTS_EXPORT` | `admin.reports.export` | Export report data |

## SUPER_ADMIN Bypass

`SUPER_ADMIN` bypasses **all** permission checks in `PermissionsGuard` and **all** role checks in `RolesGuard`. This is enforced in both guards before any DB lookup.
