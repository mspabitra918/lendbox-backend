import { AdminRole } from '../admins/admin-role';

export interface JwtPayload {
  sub: string;
  role: AdminRole;
  jti: string;
  typ: 'access';
  iat?: number;
  exp?: number;
}

/** Attached to request.user by the JWT strategy. */
export interface AuthenticatedAdmin {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  sessionId: string;
}
