import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

const VALID_ID = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Assigns a request id (honours a well-formed inbound X-Request-Id) and logs a
 * single access line. The query string is deliberately omitted from logs since
 * it may carry personal data.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request & { id?: string }, res: Response, next: NextFunction) {
    const inbound = req.get('x-request-id');
    req.id = inbound && VALID_ID.test(inbound) ? inbound : randomUUID();
    res.setHeader('X-Request-Id', req.id);
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const path = (req.originalUrl || req.url).split('?')[0];
      this.logger.log(`${req.method} ${path} ${res.statusCode} ${ms.toFixed(1)}ms id=${req.id}`);
    });
    next();
  }
}
