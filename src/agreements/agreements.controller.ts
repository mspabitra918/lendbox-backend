import { Body, Controller, Headers, HttpCode, Param, Post, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiConflictResponse, ApiForbiddenResponse, ApiGoneResponse, ApiNotFoundResponse, ApiOperation,
  ApiParam, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { IncomingHttpHeaders } from 'http';
import { ErrorResponseDto } from '../common/dto/api-response.dto';
import { ApiWrapped } from '../common/decorators/api-wrapped.decorator';
import { Ctx } from '../common/decorators/ctx.decorator';
import { StrictRateLimit } from '../common/decorators/rate-limit.decorator';
import type { RequestContext } from '../common/utils/request-context';
import { AgreementsService } from './agreements.service';
import { SignAgreementDto, SigningTokenDto } from './dto/agreement.dto';

@ApiTags('Loan agreements (applicant + webhooks)')
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
      'to sign (`mode: internal`) or a provider-hosted signing URL (`mode: redirect`). **Opening is never treated as signing.** ' +
      'The token is sent in the body so it does not appear in API access logs.',
  })
  @ApiWrapped(null, {
    example: {
      agreementId: '9a8b7c6d-1111-4222-8333-944455556666', reference: 'LB-7K3M9QX2', firstName: 'Jane', expiresAt: '2026-10-20T09:02:11.000Z',
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
    summary: 'Sign (internal provider)',
    description:
      'Requires the single-use token plus identity verification (full legal name, SSN last 4, date of birth) and explicit ' +
      'consent to electronic records and intent to sign. On success the agreement is marked signed with an evidence record ' +
      '(document hash, IP, user agent, timestamp) and the application moves to `loan_agreement_signed`. ' +
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

  @Post('webhooks/:provider')
  @HttpCode(200)
  @SkipThrottle()
  @ApiParam({ name: 'provider', example: 'docusign' })
  @ApiOperation({
    summary: 'E-signature provider webhook',
    description:
      '**Authentication:** the exact raw request body must carry a valid provider signature. DocuSign Connect: enable HMAC, ' +
      'set DOCUSIGN_WEBHOOK_SECRET; the server verifies `X-DocuSign-Signature-1..N` = base64(HMAC-SHA256(secret, body)). ' +
      'Unsigned/invalid requests get 401 and change nothing.\n\n' +
      '**Idempotency:** events are recorded in `webhook_events` keyed by (provider, envelopeId:event). Redeliveries return ' +
      '200 `{ duplicate: true }` with no side effects. Failed processing returns 500 so the provider retries.\n\n' +
      '**Completion** is re-confirmed with the provider API before the agreement is marked signed.',
  })
  @ApiWrapped(null, { example: { received: true, duplicate: false, outcome: 'signed' } })
  @ApiUnauthorizedResponse({ description: 'INVALID_WEBHOOK_SIGNATURE', type: ErrorResponseDto })
  @ApiBadRequestResponse({ description: 'UNSUPPORTED_WEBHOOK_PAYLOAD', type: ErrorResponseDto })
  webhook(
    @Param('provider') provider: string,
    @Req() req: Request & { rawBody?: Buffer },
    @Headers() headers: IncomingHttpHeaders,
    @Body() body: unknown,
  ) {
    return this.agreements.handleWebhook(provider, req.rawBody, headers, body);
  }
}
