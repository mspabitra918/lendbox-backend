import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Query,
} from "@nestjs/common";
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { AdminRole } from "../admins/admin-role";
import type { AuthenticatedAdmin } from "../auth/auth.types";
import { AdminOnly } from "../auth/decorators/admin-only.decorator";
import { CurrentAdmin } from "../auth/decorators/current-admin.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { ErrorResponseDto } from "../common/dto/api-response.dto";
import { ApiWrapped } from "../common/decorators/api-wrapped.decorator";
import { Ctx } from "../common/decorators/ctx.decorator";
import { ApplicationIdPipe } from "../common/pipes/application-id.pipe";
import type { RequestContext } from "../common/utils/request-context";
import { AdminApplicationsService } from "./admin-applications.service";
import { TRANSITIONS } from "./application-status";
import {
  ApplicationFiltersDto,
  SearchQueryDto,
} from "./dto/admin-application-query.dto";
import { UpdateApplicationStatusDto } from "./dto/update-status.dto";

const summaryExample = {
  id: "56T65T",
  uuid: "1b4e28ba-2fa1-41d2-883f-0016d3cca427",
  status: "received",
  applicant: {
    firstName: "Jane",
    lastName: "Doe",
    fullName: "Jane Doe",
    email: "jane.doe@example.com",
  },
  loan: { amount: 5000, purpose: "debt_consolidation" },
  submittedAt: "2026-10-17T10:15:00.000Z",
  statusChangedAt: "2026-10-17T10:15:00.000Z",
  updatedAt: "2026-10-17T10:15:00.000Z",
};

const idParam = ApiParam({
  name: "id",
  description: "Application id (6 letters/digits)",
  example: "56T65T",
});

@ApiTags("Admin: applications")
@AdminOnly()
@Controller("admin/applications")
export class AdminApplicationsController {
  constructor(private readonly service: AdminApplicationsService) {}

  @Get()
  @ApiOperation({
    summary: "List applications",
    description:
      "Paginated, sortable list. All filters combine with AND. Text filters are case-insensitive partial matches.",
  })
  @ApiWrapped(null, { paginated: true, example: [summaryExample] })
  list(@Query() query: ApplicationFiltersDto) {
    return this.service.list(query);
  }

  @Get("search")
  @ApiOperation({
    summary: "Search applications",
    description:
      "`q` matches an exact reference (LB-XXXXXXXX) or reference prefix, an exact 6-character application id (e.g. 56T65T), an exact UUID, or a " +
      "case-insensitive partial email / first name / full name. Other list filters (status, dates, …) can be combined.",
  })
  @ApiWrapped(null, { paginated: true, example: [summaryExample] })
  search(@Query() query: SearchQueryDto) {
    return this.service.list(query);
  }

  // @Get('status-workflow')
  // @ApiOperation({ summary: 'Status values and allowed transitions', description: 'Machine-readable copy of the transition table enforced by the server.' })
  // workflow() {
  //   return TRANSITIONS;
  // }

  @Get(":id")
  @idParam
  @ApiOperation({
    summary: "View one application",
    description:
      "Sensitive identifiers are masked (last 4 only). Includes agreements and email delivery status.",
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  findOne(
    @Param("id", ApplicationIdPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ctx() ctx: RequestContext,
  ) {
    return this.service.findOne(id, admin, ctx);
  }

  @Get(":id/sensitive")
  @idParam
  @Roles(AdminRole.SUPER_ADMIN)
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Reveal decrypted identifiers (super_admin only, audited)",
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  sensitive(
    @Param("id", ApplicationIdPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ctx() ctx: RequestContext,
  ) {
    return this.service.revealSensitive(id, admin, ctx);
  }

  @Get(":id/history")
  @idParam
  @ApiOperation({
    summary: "Status history",
    description: "Append-only; oldest first.",
  })
  @ApiWrapped(null, {
    example: [
      {
        id: "c1d2…",
        fromStatus: null,
        toStatus: "received",
        actorType: "submission",
        admin: null,
        reason: null,
        metadata: {},
        createdAt: "2026-10-17T10:15:00.000Z",
      },
      {
        id: "e3f4…",
        fromStatus: "received",
        toStatus: "approved",
        actorType: "admin",
        admin: {
          id: "7d0c…",
          name: "Alex Example",
          email: "ops.admin@example.com",
        },
        reason: null,
        metadata: {},
        createdAt: "2026-10-18T09:02:11.000Z",
      },
    ],
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  history(@Param("id", ApplicationIdPipe) id: string) {
    return this.service.getHistory(id);
  }

  @Patch(":id/status")
  @idParam
  @ApiOperation({
    summary: "Update application status",
    description:
      "Allowed admin transitions:\n" +
      "- received → approved | declined | withdrawn\n" +
      "- approved → funded | declined | withdrawn\n\n" +
      "declined, withdrawn and funded are terminal. `reason` is required for declined/withdrawn. Setting the current " +
      "status again is an idempotent no-op (`changed: false`). `funded` records that disbursement happened outside " +
      "this system; it does not move money. The applicant is emailed when the status changes.",
  })
  @ApiConflictResponse({
    description: "INVALID_STATUS_TRANSITION",
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  updateStatus(
    @Param("id", ApplicationIdPipe) id: string,
    @Body() dto: UpdateApplicationStatusDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ctx() ctx: RequestContext,
  ) {
    return this.service.updateStatus(id, dto, admin, ctx);
  }
}
