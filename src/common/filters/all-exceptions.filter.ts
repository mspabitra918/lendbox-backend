import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { BaseError, UniqueConstraintError } from 'sequelize';

export interface ErrorBody {
  success: false;
  error: {
    statusCode: number;
    code: string;
    message: string;
    details?: unknown;
    path: string;
    timestamp: string;
    requestId?: string;
  };
}

const CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  410: 'GONE',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  503: 'SERVICE_UNAVAILABLE',
};

/**
 * Single error format for the whole API. Unexpected errors are logged with a
 * request id and returned as a generic 500 — internal details never leak.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred.';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = CODE_BY_STATUS[status] ?? `HTTP_${status}`;
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        if (typeof b.code === 'string') code = b.code;
        if (Array.isArray(b.message)) {
          message = 'Validation failed';
          code = b.code === undefined ? 'VALIDATION_ERROR' : code;
          details = b.message;
        } else if (typeof b.message === 'string') {
          message = b.message;
        }
        if (b.details !== undefined) details = b.details;
      }
    } else if (exception instanceof UniqueConstraintError) {
      status = HttpStatus.CONFLICT;
      code = 'CONFLICT';
      message = 'The request conflicts with existing data.';
    } else if ((exception as { type?: string })?.type === 'entity.too.large') {
      status = HttpStatus.PAYLOAD_TOO_LARGE;
      code = 'PAYLOAD_TOO_LARGE';
      message = 'Request body is too large.';
    } else if ((exception as { type?: string })?.type === 'entity.parse.failed') {
      status = HttpStatus.BAD_REQUEST;
      code = 'MALFORMED_JSON';
      message = 'Request body is not valid JSON.';
    }

    if (status >= 500) {
      const name = exception instanceof BaseError ? `DB:${exception.name}` : (exception as Error)?.name;
      this.logger.error(
        `Unhandled ${name ?? 'error'} on ${req.method} ${req.path} id=${req.id}: ${(exception as Error)?.message}`,
        (exception as Error)?.stack,
      );
    }

    const payload: ErrorBody = {
      success: false,
      error: {
        statusCode: status,
        code,
        message,
        ...(details !== undefined ? { details } : {}),
        path: req.path,
        timestamp: new Date().toISOString(),
        requestId: req.id,
      },
    };
    res.status(status).json(payload);
  }
}
