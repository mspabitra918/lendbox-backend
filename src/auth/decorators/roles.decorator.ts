import { SetMetadata } from '@nestjs/common';
import { AdminRole } from '../../admins/admin-role';

export const ROLES_KEY = 'lendbox:roles';
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);
