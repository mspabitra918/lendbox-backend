import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Res,
} from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from "@nestjs/swagger";
import type { Response } from "express";
import { APP_CONFIG } from "../config/config.module";
import type { AppConfig } from "../config/configuration";
import { ErrorResponseDto } from "../common/dto/api-response.dto";
import { Ctx } from "../common/decorators/ctx.decorator";
import { LoginRateLimit } from "../common/decorators/rate-limit.decorator";
import type { RequestContext } from "../common/utils/request-context";
import { AuthService } from "./auth.service";
import type { AuthenticatedAdmin } from "./auth.types";
import { AdminOnly } from "./decorators/admin-only.decorator";
import { CurrentAdmin } from "./decorators/current-admin.decorator";
import {
  AdminLoginDto,
  AdminProfileDto,
  LoginResponseDto,
} from "./dto/login.dto";

@ApiTags("Admin authentication")
@Controller("auth/admin")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post("login")
  @HttpCode(200)
  @LoginRateLimit()
  @ApiOperation({
    summary: "Admin login",
    description:
      "Verifies credentials and issues a short-lived JWT. The token is returned in the body (for `Authorization: Bearer`) " +
      "and set as an HttpOnly, SameSite=Strict cookie. Rate-limited per IP. There is no public registration endpoint.",
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({
    description: "Invalid email or password",
    type: ErrorResponseDto,
  })
  @ApiForbiddenResponse({
    description: "Account disabled",
    type: ErrorResponseDto,
  })
  @ApiTooManyRequestsResponse({
    description: "Too many login attempts",
    type: ErrorResponseDto,
  })
  async login(
    @Body() dto: AdminLoginDto,
    @Ctx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto.email, dto.password, ctx);
    res.cookie(this.config.auth.cookieName, result.accessToken, {
      httpOnly: true,
      secure: this.config.auth.cookieSecure,
      sameSite: "strict",
      path: `/${this.config.apiPrefix}`,
      maxAge: this.auth.tokenTtlMs,
    });
    res.setHeader("Cache-Control", "no-store");
    return result;
  }

  @Get("me")
  @AdminOnly()
  @ApiOperation({ summary: "Current admin profile" })
  @ApiOkResponse({ type: AdminProfileDto })
  me(@CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.auth.profile(admin.id);
  }

  @Post("logout")
  @HttpCode(200)
  @AdminOnly()
  @ApiOperation({
    summary: "Logout",
    description:
      "Revokes the current session server-side (the JWT stops working immediately) and clears the cookie.",
  })
  async logout(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ctx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(admin.id, admin.sessionId, ctx);
    res.clearCookie(this.config.auth.cookieName, {
      path: `/${this.config.apiPrefix}`,
      httpOnly: true,
      sameSite: "strict",
      secure: this.config.auth.cookieSecure,
    });
    return { message: "Logged out." };
  }
}
