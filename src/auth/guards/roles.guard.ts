import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminRole } from '../../admins/admin-role';
import type { AuthenticatedAdmin } from '../auth.types';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AdminRole[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    // Deny by default: a route guarded by RolesGuard must declare its roles.
    if (!required?.length) throw new ForbiddenException('Insufficient permissions.');
    const user = ctx.switchToHttp().getRequest<{ user?: AuthenticatedAdmin }>().user;
    if (!user || !required.includes(user.role)) throw new ForbiddenException('Insufficient permissions.');
    return true;
  }
}
