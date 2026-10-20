import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { requestContext } from '../utils/request-context';

/** Injects { ip, userAgent, requestId } for audit logging. */
export const Ctx = createParamDecorator((_: unknown, ctx: ExecutionContext) =>
  requestContext(ctx.switchToHttp().getRequest<Request>()),
);
