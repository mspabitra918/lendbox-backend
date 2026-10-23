import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiConflictResponse, ApiForbiddenResponse, ApiGoneResponse, ApiNotFoundResponse, ApiOperation, ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/api-response.dto';
import { ApiWrapped } from '../common/decorators/api-wrapped.decorator';
import { Ctx } from '../common/decorators/ctx.decorator';
import { StrictRateLimit } from '../common/decorators/rate-limit.decorator';
import type { RequestContext } from '../common/utils/request-context';
import { AgreementsService } from './agreements.service';
import { SignAgreementDto, SigningTokenDto } from './dto/agreement.dto';

@ApiTags('Loan agreements (applicant)')
@Controller('agreements')
export class AgreementsController {
  constructor(private readonly agreements: AgreementsService) {}

  @Post('session')
  @HttpCode(200)
  @StrictRateLimit()
  @ApiOperation({
    summary: 'Open a signing session',
    description:
      'Called by the frontend signing page with the token from the emailed link. Validates the token (exists, ' +
      'not expired, not used, not voided), records that the agreement was **viewed** and returns either the document ' +
      'to sign. **Opening is never treated as signing.** ' +
      'The token is sent in the body so it does not appear in API access logs.',
  })
  @ApiWrapped(null, {
    example: {
      agreementId: '9a8b7c6d-1111-4222-8333-944455556666', applicationId: '56T65T', firstName: 'Jane', expiresAt: '2026-10-20T09:02:11.000Z',
      mode: 'internal', document: { html: '<!doctype html>…', sha256: 'e3b0c442…' },
      requiredVerification: ['fullName', 'ssnLast4', 'dateOfBirth', 'consentToElectronicRecords', 'agreeToTerms'],
    },
  })
  @ApiNotFoundResponse({ description: 'INVALID_SIGNING_LINK', type: ErrorResponseDto })
  @ApiGoneResponse({ description: 'SIGNING_LINK_EXPIRED or AGREEMENT_VOIDED', type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'AGREEMENT_ALREADY_SIGNED', type: ErrorResponseDto })
  openSession(@Body() dto: SigningTokenDto, @Ctx() ctx: RequestContext) {
    return this.agreements.openSession(dto.token, ctx);
  }

  @Post('sign')
  @HttpCode(200)
  @StrictRateLimit()
  @ApiOperation({
    summary: 'Sign the agreement',
    description:
      'Requires the single-use token plus identity verification (full legal name, SSN last 4, date of birth) and explicit ' +
      'consent to electronic records and intent to sign. On success the agreement is marked signed with an evidence record ' +
      '(document hash, IP, user agent, timestamp). The application status is not changed. ' +
      'This does **not** approve the loan. After SIGNING_MAX_VERIFICATION_ATTEMPTS failures the link is locked.',
  })
  @ApiWrapped(null, {
    example: {
      agreementId: '9a8b7c6d-1111-4222-8333-944455556666', status: 'signed', signedAt: '2026-10-18T15:40:00.000Z',
      message: 'Thank you. Your signed agreement has been received. This is not a loan approval; we will contact you with a decision.',
    },
  })
  @ApiUnauthorizedResponse({ description: 'IDENTITY_VERIFICATION_FAILED', type: ErrorResponseDto })
  @ApiForbiddenResponse({ description: 'SIGNING_LOCKED', type: ErrorResponseDto })
  @ApiGoneResponse({ description: 'SIGNING_LINK_EXPIRED or AGREEMENT_VOIDED', type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'AGREEMENT_ALREADY_SIGNED', type: ErrorResponseDto })
  sign(@Body() dto: SignAgreementDto, @Ctx() ctx: RequestContext) {
    return this.agreements.sign(dto, ctx);
  }
}
