import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AdminRole } from '../../admins/admin-role';
import { ErrorResponseDto } from '../../common/dto/api-response.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from './roles.decorator';

/**
 * Protects a controller or route: valid, unrevoked admin session + one of the
 * given roles (default: any admin role).
 */
export const AdminOnly = (...roles: AdminRole[]) =>
  applyDecorators(
    Roles(...(roles.length ? roles : [AdminRole.ADMIN, AdminRole.SUPER_ADMIN])),
    UseGuards(JwtAuthGuard, RolesGuard),
    ApiBearerAuth('admin-jwt'),
    ApiCookieAuth('admin-cookie'),
    ApiUnauthorizedResponse({ description: 'Missing, invalid, expired or revoked admin token', type: ErrorResponseDto }),
    ApiForbiddenResponse({ description: 'Authenticated but lacking the required admin role', type: ErrorResponseDto }),
  );
