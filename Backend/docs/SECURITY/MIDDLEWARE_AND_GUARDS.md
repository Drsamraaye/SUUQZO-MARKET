# Middleware and Guards Reference — SUUQZO MALL

**Phase**: 03  
**Date**: 2026-11-23

---

## Middleware Execution Order

All middleware runs on `*` routes in this order:

```
Request
  │
  ▼
SecurityHeadersMiddleware     → Sets HSTS, CSP, X-Frame-Options, etc.
  │
  ▼
RequestContextMiddleware      → Generates requestId (UUID), attaches req.context
  │
  ▼
AuthenticationContextMiddleware → Decodes Bearer token (no verification), attaches req.authContext
  │
  ▼
RoleContextMiddleware         → Reads x-active-role header, validates allowlist, stores req.requestedActiveRole
  │
  ▼
[Guard Chain]
```

## Guard Execution Order (APP_GUARD, all routes)

```
JwtAuthGuard          → Verifies JWT signature, validates session, attaches req.user
  │
  ▼
RolesGuard            → Checks @Roles() metadata against req.user.role / assignedRoles
  │
  ▼
PermissionsGuard      → Checks @RequirePermissions() metadata against AdminProfile.permissions
  │
  ▼
Route Handler
```

## Security Headers Set

| Header | Value |
|--------|-------|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `X-XSS-Protection` | `1; mode=block` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` |
| `Content-Security-Policy` | Restrictive CSP (no inline scripts) |

## Guard Bypass Conditions

| Guard | Bypass Condition |
|-------|-----------------|
| `JwtAuthGuard` | Route has `@Public()` metadata |
| `RolesGuard` | `@Public()` OR no `@Roles()` metadata |
| `PermissionsGuard` | `@Public()` OR no `@RequirePermissions()` metadata OR `role === SUPER_ADMIN` |

## Registration as Global Guards

```typescript
// app.module.ts providers[]
{ provide: APP_GUARD, useClass: JwtAuthGuard },      // runs first
{ provide: APP_GUARD, useClass: RolesGuard },         // runs second
{ provide: APP_GUARD, useClass: PermissionsGuard },   // runs third
```

## Role Escalation Prevention

- `x-active-role` header is read by `RoleContextMiddleware` for preference only
- Final authority on role is `request.user.role` from DB (set by `JwtAuthGuard`)
- `RolesGuard` checks `user.role` and `user.assignedRoles` (DB-sourced), never client headers
- SUPER_ADMIN is never granted via public registration (`auth.service.ts` guards)
