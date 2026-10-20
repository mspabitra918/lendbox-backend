import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { SanitizeText } from '../../common/validators/sanitize';
import { ADMIN_SETTABLE_STATUSES, AdminSettableStatus } from '../application-status';

export class UpdateApplicationStatusDto {
  @ApiProperty({
    enum: ADMIN_SETTABLE_STATUSES,
    example: 'approved',
    description:
      'Admins may set only approved, declined, withdrawn or funded. pending_loan_agreement is set by send-agreement; ' +
      'loan_agreement_signed only by verified signature.',
  })
  @IsIn(ADMIN_SETTABLE_STATUSES, { message: `status must be one of: ${ADMIN_SETTABLE_STATUSES.join(', ')}` })
  status: AdminSettableStatus;

  @ApiPropertyOptional({ example: 'Income could not be verified.', description: 'Required for declined and withdrawn.' })
  @IsOptional() @SanitizeText() @IsString() @MaxLength(1000)
  reason?: string;

  @ApiPropertyOptional({
    example: { disbursementReference: 'ACH-EXAMPLE-0001' },
    description: 'Optional audit metadata (max 2 KB), e.g. an external disbursement reference when recording funding.',
  })
  @IsOptional() @IsObject()
  metadata?: Record<string, unknown>;
}
