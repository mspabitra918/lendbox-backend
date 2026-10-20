import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectModel } from "@nestjs/sequelize";
import * as bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { APP_CONFIG } from "../config/config.module";
import type { AppConfig } from "../config/configuration";
import { AdminsService } from "../admins/admins.service";
import { AdminSession } from "../admins/models/admin-session.model";
import { AuditService } from "../audit/audit.service";
import { parseDurationMs } from "../common/utils/duration";
import { maskEmail } from "../common/utils/mask";
import type { RequestContext } from "../common/utils/request-context";
import type { JwtPayload } from "./auth.types";
import { LoginResponseDto } from "./dto/login.dto";

// Valid bcrypt hash of a random string: compared against when the email is
// unknown so response timing doesn't reveal which emails exist.
const DUMMY_HASH =
  "$2b$12$.cTxaU6ZDJ5/ocN4FNqxNOwB7QVWIG2noghl99bBLwJJdvMzO9tA2";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly ttlMs: number;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly admins: AdminsService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    @InjectModel(AdminSession) private readonly sessions: typeof AdminSession,
  ) {
    this.ttlMs = parseDurationMs(config.auth.jwtExpiresIn);
  }

  get tokenTtlMs() {
    return this.ttlMs;
  }

  async login(
    email: string,
    password: string,
    ctx: RequestContext,
  ): Promise<LoginResponseDto> {
    const admin = await this.admins.findByEmail(email);
    const ok = await bcrypt.compare(
      password,
      admin?.passwordHash ?? DUMMY_HASH,
    );

    if (!admin || !ok) {
      this.logger.warn(
        `Failed admin login for ${maskEmail(email)} ip=${ctx.ip}`,
      );
      await this.audit.recordSafe({
        actorType: "anonymous",
        action: "admin.login_failed",
        entityType: "admin",
        entityId: admin?.id ?? null,
        metadata: { email: maskEmail(email) },
        ctx,
      });
      throw new UnauthorizedException("Invalid email or password.");
    }
    if (!admin.isActive) {
      await this.audit.recordSafe({
        actorType: "admin",
        actorId: admin.id,
        action: "admin.login_rejected_inactive",
        entityType: "admin",
        entityId: admin.id,
        ctx,
      });
      throw new ForbiddenException("This admin account is disabled.");
    }

    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + this.ttlMs);
    await this.sessions.create({
      id: jti,
      adminId: admin.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      expiresAt,
    });
    const payload: JwtPayload = {
      sub: admin.id,
      role: admin.role,
      jti,
      typ: "access",
    };
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: Math.floor(this.ttlMs / 1000),
    });

    await admin.update({ lastLoginAt: new Date() });
    await this.audit.record({
      actorType: "admin",
      actorId: admin.id,
      action: "admin.login",
      entityType: "admin",
      entityId: admin.id,
      ctx,
    });
    this.logger.log(`Admin login ${admin.id}`);

    return {
      accessToken,
      tokenType: "Bearer",
      expiresIn: Math.floor(this.ttlMs / 1000),
      expiresAt: expiresAt.toISOString(),
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        lastLoginAt: admin.lastLoginAt,
      },
    };
  }

  async logout(adminId: string, sessionId: string, ctx: RequestContext) {
    await this.sessions.update(
      { revokedAt: new Date() },
      { where: { id: sessionId, adminId, revokedAt: null } },
    );
    await this.audit.record({
      actorType: "admin",
      actorId: adminId,
      action: "admin.logout",
      entityType: "admin",
      entityId: adminId,
      ctx,
    });
  }

  async profile(adminId: string) {
    const admin = await this.admins.findById(adminId);
    if (!admin) throw new UnauthorizedException();
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      lastLoginAt: admin.lastLoginAt,
    };
  }
}
