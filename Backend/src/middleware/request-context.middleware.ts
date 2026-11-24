import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    (req as any).context = {
      requestId,
      ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
      userAgent: req.headers['user-agent'] ?? 'unknown',
      startTime,
    };

    // Echo request ID in response header for tracing
    res.setHeader('X-Request-Id', requestId);

    next();
  }
}
