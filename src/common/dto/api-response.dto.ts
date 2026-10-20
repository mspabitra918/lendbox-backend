import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorDetailDto {
  @ApiProperty({ example: 400 }) statusCode: number;
  @ApiProperty({ example: 'VALIDATION_ERROR' }) code: string;
  @ApiProperty({ example: 'Validation failed' }) message: string;
  @ApiPropertyOptional({ example: ['personal.email must be an email'], type: 'array', items: { type: 'string' } })
  details?: unknown;
  @ApiProperty({ example: '/api/v1/applications' }) path: string;
  @ApiProperty({ example: '2026-10-17T10:15:00.000Z' }) timestamp: string;
  @ApiPropertyOptional({ example: '3f1c2b7e-9a4d-4f7e-8c2a-1b2c3d4e5f60' }) requestId?: string;
}

export class ErrorResponseDto {
  @ApiProperty({ example: false }) success: false;
  @ApiProperty({ type: ErrorDetailDto }) error: ErrorDetailDto;
}

export class PaginationMetaDto {
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 20 }) limit: number;
  @ApiProperty({ example: 137 }) total: number;
  @ApiProperty({ example: 7 }) totalPages: number;
  @ApiProperty({ example: true }) hasNextPage: boolean;
  @ApiProperty({ example: false }) hasPreviousPage: boolean;
}
