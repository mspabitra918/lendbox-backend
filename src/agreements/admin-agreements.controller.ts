import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { ApiConflictResponse, ApiNotFoundResponse, ApiOperation, ApiParam, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import { AdminOnly } from '../auth/decorators/admin-only.decorator';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import { ErrorResponseDto } from '../common/dto/api-response.dto';
import { ApiWrapped } from '../common/decorators/api-wrapped.decorator';
import { Ctx } from '../common/decorators/ctx.decorator';
import { ApplicationIdPipe } from '../common/pipes/application-id.pipe';
import type { RequestContext } from '../common/utils/request-context';
import { AgreementsService } from './agreements.service';
import { SendAgreementDto, VoidAgreementDto } from './dto/agreement.dto';

@ApiTags('Admin: loan agreements')
@AdminOnly()
@Controller('admin')
export class AdminAgreementsController {
  constructor(private readonly agreements: AgreementsService) {}

  @Post('applications/:id/send-agreement')
  @ApiParam({ name: 'id', example: '56T65T' })
  @ApiOperation({
    summary: 'Send loan agreement',
    description:
      'Allowed when the application is `received` or `pending_loan_agreement`. Creates the agreement, registers it with the ' +
      'configured e-signature provider, generates a single-use signing token (only its SHA-256 is stored), queues the ' +
      'invitation email and moves the application to `pending_loan_agreement` — atomically.\n\n' +
      'Idempotent: if an open, unexpired agreement exists it is returned (`created: false`) and no email is sent. ' +
      'Use `resend: true` to void it and issue a new one. Expired agreements are replaced automatically.',
  })
  @ApiWrapped(null, {
    status: 201,
    example: {
      created: true, message: 'Loan agreement created and invitation email queued.', applicationStatus: 'pending_loan_agreement',
      agreement: { id: '9a8b7c6d-1111-4222-8333-944455556666', applicationId: '56T65T', provider: 'internal', status: 'sent', sentAt: '2026-10-18T09:02:11.000Z', expiresAt: '2026-10-21T09:02:11.000Z' },
    },
  })
  @ApiConflictResponse({ description: 'AGREEMENT_NOT_ALLOWED for the current status', type: ErrorResponseDto })
  @ApiServiceUnavailableResponse({ description: 'Provider not configured / template not approved', type: ErrorResponseDto })
  async send(
    @Param('id', ApplicationIdPipe) id: string,
    @Body() dto: SendAgreementDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ctx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.agreements.sendAgreement(id, dto, admin, ctx);
    res.status(result.created ? 201 : 200);
    return result;
  }

  @Get('applications/:id/agreements')
  @ApiParam({ name: 'id', example: '56T65T' })
  @ApiOperation({ summary: 'Agreements for an application, with audit trail' })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  list(@Param('id', ApplicationIdPipe) id: string) {
    return this.agreements.listForApplication(id);
  }

  @Post('agreements/:agreementId/void')
  @ApiParam({ name: 'agreementId', format: 'uuid' })
  @ApiOperation({ summary: 'Void an open agreement', description: 'The signing link stops working immediately. The application status is unchanged; send a new agreement or decline.' })
  @ApiConflictResponse({ description: 'AGREEMENT_NOT_OPEN', type: ErrorResponseDto })
  void(
    @Param('agreementId', new ParseUUIDPipe()) agreementId: string,
    @Body() dto: VoidAgreementDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ctx() ctx: RequestContext,
  ) {
    return this.agreements.voidAgreement(agreementId, dto.reason, admin, ctx);
  }
}
