import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { InjectModel } from '@nestjs/sequelize';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';
import { AdminSession } from '../admins/models/admin-session.model';
import { Admin } from '../admins/models/admin.model';
import type { AuthenticatedAdmin, JwtPayload } from './auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    @InjectModel(AdminSession) private readonly sessions: typeof AdminSession,
  ) {
    const fromCookie = (req: Request) => (req?.cookies?.[config.auth.cookieName] as string | undefined) ?? null;
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([ExtractJwt.fromAuthHeaderAsBearerToken(), fromCookie]),
      ignoreExpiration: false,
      secretOrKey: config.auth.jwtSecret,
      issuer: config.auth.jwtIssuer,
      audience: config.auth.jwtAudience,
      algorithms: ['HS256'],
    });
  }

  /** Signature and expiry are already verified; now enforce revocation and account state. */
  async validate(payload: JwtPayload): Promise<AuthenticatedAdmin> {
    if (payload.typ !== 'access' || !payload.jti || !payload.sub) throw new UnauthorizedException();
    const session = await this.sessions.findByPk(payload.jti, { include: [Admin] });
    const admin = session?.admin;
    if (!session || !admin || session.adminId !== payload.sub) throw new UnauthorizedException();
    if (session.revokedAt || session.expiresAt.getTime() <= Date.now()) throw new UnauthorizedException();
    if (!admin.isActive) throw new UnauthorizedException();
    // Tokens issued before a password change are invalid.
    if (payload.iat && payload.iat * 1000 < admin.passwordChangedAt.getTime() - 1000) throw new UnauthorizedException();
    return { id: admin.id, email: admin.email, name: admin.name, role: admin.role, sessionId: session.id };
  }
}
