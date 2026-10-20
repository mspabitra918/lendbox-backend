import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { PaginationMetaDto } from '../dto/api-response.dto';

/** Documents the `{ success: true, data, meta? }` envelope around a DTO. */
export function ApiWrapped(model: Type<unknown> | null, opts: { status?: number; description?: string; paginated?: boolean; example?: unknown } = {}) {
  const data = model
    ? opts.paginated
      ? { type: 'array', items: { $ref: getSchemaPath(model) } }
      : { $ref: getSchemaPath(model) }
    : { type: 'object', example: opts.example };
  return applyDecorators(
    ...(model ? [ApiExtraModels(model, PaginationMetaDto)] : [ApiExtraModels(PaginationMetaDto)]),
    ApiResponse({
      status: opts.status ?? 200,
      description: opts.description,
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data,
          ...(opts.paginated ? { meta: { $ref: getSchemaPath(PaginationMetaDto) } } : {}),
        },
      },
    }),
  );
}
