import { ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { APP_CONFIG } from '../../config/config.module';
import type { AppConfig } from '../../config/configuration';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Authenticates via `Authorization: Bearer` or the HttpOnly session cookie.
 * Cookie-authenticated state-changing requests must also carry an Origin (or
 * Referer) on the admin allow-list — CSRF defence in addition to SameSite=Strict.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    super();
  }

  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Request>();
    const usesBearer = /^Bearer\s/i.test(req.get('authorization') ?? '');
    if (!usesBearer && !SAFE_METHODS.has(req.method)) {
      const origin = req.get('origin') ?? this.originOf(req.get('referer'));
      if (!origin || !this.config.frontend.adminOrigins.includes(origin.replace(/\/$/, ''))) {
        throw new ForbiddenException('Cross-site request rejected.');
      }
    }
    return super.canActivate(ctx);
  }

  handleRequest<T>(err: unknown, user: T): T {
    if (err || !user) throw new UnauthorizedException('Authentication required.');
    return user;
  }

  private originOf(url?: string) {
    if (!url) return undefined;
    try {
      return new URL(url).origin;
    } catch {
      return undefined;
    }
  }
}
