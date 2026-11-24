# Authentication Architecture — SUUQZO MALL

**Phase**: 03  
**Date**: 2026-11-23  
**Status**: IMPLEMENTED

---

## Overview

SUUQZO MALL uses a layered, stateful authentication system built on JWT access tokens, database-backed refresh token families, and PostgreSQL-persisted sessions.

## Token Architecture

| Token | Algorithm | Lifetime | Storage |
|-------|-----------|----------|---------|
| Access Token | JWT HS256 | 15 minutes | Client memory / Authorization header |
| Refresh Token | 48-byte random hex | 30 days | Server DB (SHA-256 hashed) |
| Session | 32-byte random hex | 30 days | Server DB (SHA-256 hashed) |

### Access Token Claims (`JwtPayload`)

```json
{
  "sub": "<userId>",
  "phone": "<phone>",
  "email": "<email|null>",
  "role": "CUSTOMER|SELLER|RIDER|ADMIN|SUPER_ADMIN",
  "activeRole": "<role>",
  "sessionId": "<sessionId>",
  "iat": 1234567890,
  "exp": 1234568790,
  "iss": "suuqzo-mall",
  "aud": "suuqzo-client"
}
```

## Password Security

- **Algorithm**: Argon2id
- **Parameters**: `m=65536` (64 MB), `t=3`, `p=4`
- **Strength Policy**: min 8 chars, uppercase, lowercase, digit, special character
- **Never** stored in plaintext, never logged, never returned in API responses

## OTP Security

- 6-digit numeric code (`crypto.randomInt`)
- Stored as `SHA-256(target:purpose:code)` — never plaintext
- 5-minute TTL, max 5 attempts, 60-second resend cooldown
- Single-use: consumed on first valid verification
- `timingSafeEqual` comparison to prevent timing attacks

## Two-Factor Authentication (TOTP)

- RFC 6238 TOTP, SHA-1, 30-second window, ±1 step tolerance
- Secret: AES-256-GCM encrypted at rest with `TWO_FACTOR_ENCRYPTION_KEY`
- 10 single-use recovery codes (8-char hex uppercase), individually SHA-256 hashed
- Disable requires password re-verification

## Refresh Token Rotation & Family Security

```
Login → create family F1 → issue RT_1 (family=F1)
Refresh with RT_1 → revoke RT_1 → issue RT_2 (family=F1)
Refresh with RT_2 → revoke RT_2 → issue RT_3 (family=F1)

If RT_1 (already revoked) is used again:
  → Revoke ALL tokens in family F1
  → CompromisedTokenFamilyException
  → User must re-login
```

## Account Lockout Policy

- 5 consecutive failed login attempts → 15-minute lockout
- Lockout enforced server-side (`lockoutUntil` column)
- Counter resets on successful login

## Session Lifecycle

1. Created on successful login (IP + User-Agent recorded)
2. `lastActiveAt` updated on each authenticated request
3. Revoked on logout
4. All sessions revoked on `logout-all`
5. Session validity checked on every protected request (via `SessionsService.validateSession`)

## Environment Variables Required

```env
JWT_SECRET=                     # HS256 signing secret (min 32 chars)
JWT_EXPIRATION=900              # access token TTL seconds
JWT_REFRESH_SECRET=             # (optional separate secret for refresh)
JWT_REFRESH_EXPIRATION=2592000  # refresh token TTL seconds
TWO_FACTOR_ENCRYPTION_KEY=      # 32-byte AES-256-GCM key for TOTP secrets
CORS_ORIGINS=                   # comma-separated allowed origins
DATABASE_URL=                   # Supabase transaction pooler (port 6543)
DIRECT_URL=                     # Supabase direct connection (port 5432)
```
