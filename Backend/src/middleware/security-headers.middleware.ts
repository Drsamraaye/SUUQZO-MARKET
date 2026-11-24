import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  use(_req: Request, res: Response, next: NextFunction): void {
    // Prevent MIME-type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');

    // Legacy XSS filter (belt-and-suspenders)
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // HSTS — 1 year, includeSubDomains
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    );

    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions policy — restrict sensitive APIs
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=()',
    );

    // Content Security Policy
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'none'",
        "script-src 'self'",
        "connect-src 'self'",
        "img-src 'self' data:",
        "style-src 'self' 'unsafe-inline'",
        "frame-ancestors 'none'",
        'upgrade-insecure-requests',
      ].join('; '),
    );

    next();
  }
}
