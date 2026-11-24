# Threat Model — SUUQZO MALL Backend

**Phase**: 03  
**Date**: 2026-11-23  
**Classification**: Internal Security Reference

---

## Assets

| Asset | Sensitivity | Protection |
|-------|-------------|------------|
| User passwords | CRITICAL | Argon2id m=64MB, t=3, p=4 |
| Access tokens | HIGH | HS256 JWT, 15-min TTL, session-bound |
| Refresh tokens | HIGH | SHA-256 hashed in DB, family rotation |
| TOTP secrets | HIGH | AES-256-GCM encrypted at rest |
| OTP codes | MEDIUM | SHA-256 hashed, 5-min TTL, single-use |
| PII (phone, email) | HIGH | Stored in DB; never logged |
| Payment data | CRITICAL | (Phase 04 scope) |
| Seller financials | HIGH | RBAC + ownership isolation |

---

## Threat Catalogue

### T1 — Credential Theft (Phishing / Breach)

**Attack**: Attacker obtains user password via phishing or DB breach.  
**Mitigation**:
- Argon2id makes offline brute-force computationally infeasible
- Passwords never stored plaintext
- 2FA adds second factor even if password compromised
- Account lockout after 5 failures (15 min) limits online brute-force

### T2 — JWT Forgery

**Attack**: Attacker crafts a valid-looking JWT without the signing key.  
**Mitigation**:
- `algorithms: ['HS256']` allowlist in `jwt.verify()` prevents algorithm confusion (`alg: none`)
- Short 15-minute TTL limits exposure window
- Session table validated on every request — revoked sessions reject valid JWTs

### T3 — Refresh Token Theft & Reuse

**Attack**: Attacker steals a refresh token and uses it after victim has already rotated.  
**Mitigation**:
- Family-based reuse detection: using a revoked token revokes the entire family
- Victim is immediately logged out of that session family
- 48-byte random tokens have 384 bits of entropy (not guessable)

### T4 — Session Fixation / Hijacking

**Attack**: Attacker injects a known session ID or intercepts a valid session token.  
**Mitigation**:
- Session tokens are 32-byte random hex (256 bits entropy)
- SHA-256 hashed before storage — DB breach doesn't expose raw tokens
- IP address and User-Agent logged per session for audit

### T5 — OTP Bypass / Enumeration

**Attack**: Attacker brute-forces OTP or enumerates phone numbers via error messages.  
**Mitigation**:
- 5-attempt limit with block after exhaustion
- 60-second resend cooldown prevents rapid generation
- Timing-safe comparison (`timingSafeEqual`) prevents timing attacks
- Enumeration-resistant responses on registration/forgot-password

### T6 — TOTP Secret Exposure

**Attack**: DB breach exposes TOTP secrets, allowing attacker to generate valid TOTP codes.  
**Mitigation**:
- Secrets encrypted with AES-256-GCM before storage
- Encryption key stored in environment variable (not in DB)
- Recovery codes individually SHA-256 hashed, single-use

### T7 — Role Escalation via API

**Attack**: Attacker sends `x-active-role: SUPER_ADMIN` header to escalate privileges.  
**Mitigation**:
- `RoleContextMiddleware` reads header for preference only
- `JwtAuthGuard` sets `request.user` from DB-verified JWT claims
- `RolesGuard` checks DB-sourced `user.role` and `user.assignedRoles`, never client headers
- SUPER_ADMIN role cannot be self-assigned via public registration

### T8 — Horizontal Privilege Escalation (Cross-Tenant)

**Attack**: Seller A accesses Seller B's data by guessing an ID.  
**Mitigation**:
- All data queries must include `userId` or `sellerProfileId` ownership check
- `SessionsService.revokeSession()` enforces `userId` ownership
- Authorization layer with resource ownership checks (enforced per module in Phase 04+)

### T9 — Clickjacking

**Attack**: Embeds SUUQZO MALL in an iframe to hijack clicks.  
**Mitigation**: `X-Frame-Options: DENY` and `frame-ancestors 'none'` in CSP

### T10 — MIME Confusion / XSS

**Attack**: Attacker uploads a file, tricks browser into executing it as script.  
**Mitigation**: `X-Content-Type-Options: nosniff`, restrictive CSP

### T11 — Timing Attack on Password Verification

**Attack**: Measure response time difference between "user not found" vs "wrong password".  
**Mitigation**: On login failure (user not found), `passwordService.hash()` is called with a dummy value to burn equivalent CPU time before returning `401`

---

## Out-of-Scope (Future Phases)

- Payment fraud (Phase 04)
- Inventory manipulation (Phase 04)
- SQL injection (mitigated by Prisma parameterized queries — always active)
- DDoS (infrastructure layer — load balancer / WAF)
