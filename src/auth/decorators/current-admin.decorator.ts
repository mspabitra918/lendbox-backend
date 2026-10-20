import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedAdmin } from '../auth.types';

export const CurrentAdmin = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedAdmin => ctx.switchToHttp().getRequest().user,
);
