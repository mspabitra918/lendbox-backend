import type { Request } from 'express';

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export function requestContext(req: Request): RequestContext {
  return {
    ip: (req.ip ?? null)?.slice(0, 64) ?? null,
    userAgent: (req.get('user-agent') ?? null)?.slice(0, 255) ?? null,
    requestId: ((req as Request & { id?: string }).id ?? null),
  };
}
