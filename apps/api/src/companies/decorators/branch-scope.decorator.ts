import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';

/**
 * The branch a request is confined to, or undefined for full-company access.
 *
 * Any member assigned a home branch (accountant, manager, cashier, employee,
 * auditor, branch manager) only sees/creates documents of that branch, so every
 * estimate / bill / purchase they raise is mapped to it automatically. OWNER and
 * ADMIN are company-wide and never branch-scoped; members with no branch set are
 * unscoped too.
 *
 * Requires CompanyRoleGuard on the route (it attaches the membership).
 */
const UNSCOPED_ROLES: ReadonlySet<Role> = new Set([Role.OWNER, Role.ADMIN]);

export const BranchScope = createParamDecorator(
  (_: unknown, context: ExecutionContext): string | undefined => {
    const request = context.switchToHttp().getRequest<
      Request & { membershipRole?: Role; membershipBranchId?: string | null }
    >();
    if (request.membershipRole && UNSCOPED_ROLES.has(request.membershipRole)) {
      return undefined;
    }
    return request.membershipBranchId ?? undefined;
  },
);
