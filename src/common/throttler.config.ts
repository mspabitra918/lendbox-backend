import { ExecutionContext } from '@nestjs/common';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import type { AppConfig } from '../config/configuration';
import { LOGIN_RATE_LIMIT, STRICT_RATE_LIMIT } from './decorators/rate-limit.decorator';

const marked = (key: string) => (ctx: ExecutionContext) =>
  !Reflect.getMetadata(key, ctx.getHandler()) && !Reflect.getMetadata(key, ctx.getClass());

/**
 * Three named throttlers (per client IP; set TRUST_PROXY behind Nginx):
 *  - default: every route unless @SkipThrottle()
 *  - login:   only routes marked @LoginRateLimit()
 *  - strict:  only routes marked @StrictRateLimit() (status lookup, signing)
 * In-memory storage: with several PM2 instances, each keeps its own counters.
 */
export const throttlerOptions = (c: AppConfig): ThrottlerModuleOptions => ({
  throttlers: [
    { name: 'default', ttl: c.rateLimit.ttlMs, limit: c.rateLimit.limit },
    { name: 'login', ttl: c.auth.loginRateTtlMs, limit: c.auth.loginRateLimit, skipIf: marked(LOGIN_RATE_LIMIT) },
    { name: 'strict', ttl: 60_000, limit: c.rateLimit.strictLimit, skipIf: marked(STRICT_RATE_LIMIT) },
  ],
  errorMessage: 'Too many requests. Please try again later.',
});
