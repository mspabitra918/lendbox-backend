import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/** Return from a controller to produce `{ success, data: items, meta }`. */
export class Paginated<T> {
  constructor(
    public readonly items: T[],
    public readonly meta: PaginationMeta,
  ) {}

  static of<T>(items: T[], total: number, page: number, limit: number): Paginated<T> {
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return new Paginated(items, {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    });
  }
}

/** Wraps every successful response as `{ success: true, data, meta? }`. */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((value) =>
        value instanceof Paginated
          ? { success: true, data: value.items, meta: value.meta }
          : { success: true, data: value ?? null },
      ),
    );
  }
}
