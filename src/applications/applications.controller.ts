import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Res,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnprocessableEntityResponse,
} from "@nestjs/swagger";
import type { Response } from "express";
import { ErrorResponseDto } from "../common/dto/api-response.dto";
import { ApiWrapped } from "../common/decorators/api-wrapped.decorator";
import { Ctx } from "../common/decorators/ctx.decorator";
import { StrictRateLimit } from "../common/decorators/rate-limit.decorator";
import type { RequestContext } from "../common/utils/request-context";
import {
  ApplicationsService,
  IDEMPOTENCY_KEY_PATTERN,
} from "./applications.service";
import {
  ApplicationSubmittedDto,
  CreateApplicationDto,
  StatusLookupDto,
} from "./dto/create-application.dto";

@ApiTags("Loan applications (public)")
@Controller("applications")
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Post()
  @ApiOperation({
    summary: "Submit a loan application",
    description:
      "Accepts the exact `ApplicationFormData` object produced by the Lendbox frontend. The server assigns the id, " +
      "reference and `received` status. Sensitive identifiers are encrypted at rest; `bankPassword` and " +
      "`confirmAccountNumber` are validated but never stored.\n\n" +
      "**Duplicates:** send an `Idempotency-Key` header (8-100 chars, e.g. a UUID generated when the form loads). " +
      "Retrying with the same key returns the original application (HTTP 200, `duplicate: true`). Without a key, " +
      "an identical email+SSN+amount+purpose within the duplicate window is also treated as a duplicate.\n\n" +
      "**Email:** confirmation and admin emails are queued in the same transaction; delivery is asynchronous and " +
      "retried, so an email failure never affects the saved application.",
  })
  @ApiHeader({
    name: "Idempotency-Key",
    required: false,
    description: "Client-generated unique key for this submission",
    example: "5b0f6a2e-5d0c-4bd4-9f53-7f1d2f0b9c11",
  })
  @ApiWrapped(ApplicationSubmittedDto, {
    status: 201,
    description: "Application created",
  })
  @ApiWrapped(ApplicationSubmittedDto, {
    status: 200,
    description: "Duplicate submission — existing application returned",
  })
  @ApiBadRequestResponse({
    description: "Validation failed (details lists each field error)",
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description: "Idempotency-Key reused for different data",
    type: ErrorResponseDto,
  })
  @ApiTooManyRequestsResponse({
    description: "Rate limited",
    type: ErrorResponseDto,
  })
  async submit(
    @Body() dto: CreateApplicationDto,
    @Ctx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    if (
      idempotencyKey !== undefined &&
      !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)
    ) {
      throw new BadRequestException(
        'Idempotency-Key must be 8-100 characters of A-Z, a-z, 0-9, "-" or "_".',
      );
    }
    const result = await this.applications.submit(dto, ctx, idempotencyKey);
    res.status(result.duplicate ? 200 : 201);
    return result;
  }

  @Get(":applicationId")
  async findByApplicationId(@Param("applicationId") applicationId: string) {
    const application =
      await this.applications.findByApplicationId(applicationId);

    if (!application) {
      throw new NotFoundException("Application not found");
    }

    return {
      success: true,
      data: application,
    };
  }

  @Post("status-lookup")
  @HttpCode(200)
  @StrictRateLimit()
  @ApiOperation({
    summary: "Applicant status lookup",
    description:
      "Returns limited status information when both the applicationId and the applicant email match. POST keeps the email out of URLs and logs.",
  })
  @ApiWrapped(null, {
    example: {
      applicationId: "7NY1FD",
      status: "pending_loan_agreement",
      submittedAt: "2026-10-17T10:15:00.000Z",
      history: [
        { status: "received", at: "2026-10-17T10:15:00.000Z" },
        { status: "pending_loan_agreement", at: "2026-10-18T09:02:11.000Z" },
      ],
      applicant: { firstName: "Jane" },
      loan: { amount: 5000, purpose: "debt_consolidation" },
    },
  })
  @ApiNotFoundResponse({
    description: "No match for that applicationId + email",
    type: ErrorResponseDto,
  })
  lookup(@Body() dto: StatusLookupDto) {
    return this.applications.lookupStatus(dto.applicationId, dto.email);
  }
}
