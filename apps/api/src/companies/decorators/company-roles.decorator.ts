import { SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';

export const COMPANY_ROLES_KEY = 'companyRoles';

/**
 * Restricts a company-scoped route (with :companyId param) to the given roles.
 * Used together with CompanyRoleGuard.
 */
export const CompanyRoles = (...roles: Role[]) =>
  SetMetadata(COMPANY_ROLES_KEY, roles);
