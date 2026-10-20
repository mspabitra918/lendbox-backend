import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsBoolean, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { SanitizeText } from '../../common/validators/sanitize';

export class SendAgreementDto {
  @ApiPropertyOptional({
    example: false,
    description: 'If an open agreement already exists, the request is idempotent and returns it. Set true to void it and issue a new one (e.g. after the link expired).',
  })
  @IsOptional() @IsBoolean()
  resend?: boolean;

  @ApiPropertyOptional({ example: 'Applicant requested a new link.' })
  @IsOptional() @SanitizeText() @IsString() @MaxLength(500)
  reason?: string;
}

export class SigningTokenDto {
  @ApiProperty({ description: 'Token from the emailed signing link (?token=…). Never logged.', example: 'q9N3…base64url…' })
  @IsString() @Matches(/^[A-Za-z0-9_-]{40,64}$/, { message: 'token is invalid' })
  token: string;
}

export class SignAgreementDto extends SigningTokenDto {
  @ApiProperty({ example: 'Jane Doe', description: 'Typed full legal name; must match the application.' })
  @SanitizeText() @IsString() @Length(3, 201)
  fullName: string;

  @ApiProperty({ example: '6789', description: 'Last 4 digits of SSN (identity check)' })
  @IsString() @Matches(/^\d{4}$/)
  ssnLast4: string;

  @ApiProperty({ example: '1988-04-15', description: 'Date of birth YYYY-MM-DD (identity check)' })
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateOfBirth: string;

  @ApiProperty({ example: true, description: 'Applicant consents to electronic records and signatures' })
  @IsBoolean() @Equals(true, { message: 'consentToElectronicRecords must be accepted' })
  consentToElectronicRecords: boolean;

  @ApiProperty({ example: true, description: 'Applicant intends to sign this agreement' })
  @IsBoolean() @Equals(true, { message: 'agreeToTerms must be accepted' })
  agreeToTerms: boolean;
}

export class VoidAgreementDto {
  @ApiProperty({ example: 'Terms changed; a new agreement will be issued.' })
  @SanitizeText() @IsString() @Length(3, 500)
  reason: string;
}
