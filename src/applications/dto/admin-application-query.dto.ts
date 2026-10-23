import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { sanitizeText } from '../../common/validators/sanitize';
import { APPLICATION_STATUSES, ApplicationStatus } from '../application-status';

export const SORTABLE_FIELDS = ['submittedAt', 'updatedAt', 'statusChangedAt', 'loanAmount', 'lastName', 'firstName', 'status', 'id', 'reference'] as const;
export type SortableField = (typeof SORTABLE_FIELDS)[number];

const toList = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : (Array.isArray(value) ? value : String(value).split(',')).map((v) => String(v).trim()).filter(Boolean);
const text = ({ value }: { value: unknown }) => {
  const s = sanitizeText(value);
  return s === '' ? undefined : s;
};

export class ApplicationFiltersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SORTABLE_FIELDS, default: 'submittedAt' })
  @IsOptional() @IsIn(SORTABLE_FIELDS)
  sortBy: SortableField = 'submittedAt';

  @ApiPropertyOptional({ description: 'One or more statuses, comma-separated', example: 'received,approved', enum: APPLICATION_STATUSES, isArray: true })
  @IsOptional() @Transform(toList) @IsArray() @ArrayMaxSize(7) @IsIn(APPLICATION_STATUSES, { each: true })
  status?: ApplicationStatus[];

  @ApiPropertyOptional({ description: 'Public reference (case-insensitive exact match)', example: 'LB-7K3M9QX2' })
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value)) @IsString() @Matches(/^[A-Z0-9-]{1,20}$/)
  reference?: string;

  @ApiPropertyOptional({ description: 'Application id (6 letters/digits, case-insensitive)', example: '56T65T' })
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString() @Matches(/^[0-9A-Z]{6}$/, { message: 'id must be 6 letters or digits' })
  id?: string;

  @ApiPropertyOptional({ description: 'Internal application UUID', example: '1b4e28ba-2fa1-41d2-883f-0016d3cca427' })
  @IsOptional() @IsUUID()
  uuid?: string;

  @ApiPropertyOptional({ description: 'Applicant email, case-insensitive partial match', example: 'jane.doe@' })
  @IsOptional() @Transform(text) @IsString() @Length(1, 254)
  email?: string;

  @ApiPropertyOptional({ description: 'First name, case-insensitive partial match', example: 'jan' })
  @IsOptional() @Transform(text) @IsString() @Length(1, 100)
  firstName?: string;

  @ApiPropertyOptional({ description: '"First Last", case-insensitive partial match', example: 'jane doe' })
  @IsOptional() @Transform(text) @IsString() @Length(1, 201)
  fullName?: string;

  @ApiPropertyOptional({ description: 'Free-text search across reference, application id, uuid, email, first and full name', example: 'doe' })
  @IsOptional() @Transform(text) @IsString() @Length(1, 254)
  q?: string;

  @ApiPropertyOptional({ example: '2026-10-01', description: 'Submitted on/after (ISO date)' })
  @IsOptional() @IsDateString()
  submittedFrom?: string;

  @ApiPropertyOptional({ example: '2026-10-31', description: 'Submitted on/before (ISO date, inclusive)' })
  @IsOptional() @IsDateString()
  submittedTo?: string;

  @ApiPropertyOptional({ example: 1000 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  minAmount?: number;

  @ApiPropertyOptional({ example: 20000 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  maxAmount?: number;
}

export class SearchQueryDto extends ApplicationFiltersDto {
  @ApiPropertyOptional({ description: 'Search term (required)', example: 'LB-7K3M9QX2' })
  @Transform(text) @IsString() @Length(1, 254)
  declare q: string;
}

