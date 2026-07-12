import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import type { AuthUser } from '../../auth/decorators/current-user.decorator';
import { LicensingService } from '../../licensing/licensing.service';
import { PrismaService } from '../../prisma/prisma.service';
import { COMPANY_ROLES_KEY } from '../decorators/company-roles.decorator';

/**
 * Tenancy boundary: verifies the authenticated user is a member of the
 * company in the route (:companyId) and, when @CompanyRoles(...) is present,
 * that their role is allowed. Attaches the membership to the request.
 */
@Injectable()
export class CompanyRoleGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    private readonly licensing: LicensingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<
      Request & {
        user: AuthUser;
        membershipRole?: Role;
        membershipBranchId?: string | null;
      }
    >();
    const companyId = request.params.companyId;
    if (typeof companyId !== 'string' || companyId.length === 0) {
      throw new ForbiddenException('Missing company context');
    }

    const membership = await this.prisma.companyUser.findUnique({
      where: {
        userId_companyId: { userId: request.user.id, companyId },
      },
    });
    if (!membership) {
      // Super-admins may VIEW any company for monitoring, but read-only:
      // only safe GET requests are allowed; all writes are blocked.
      const u = await this.prisma.user.findUnique({
        where: { id: request.user.id },
        select: { isSuperAdmin: true },
      });
      if (u?.isSuperAdmin) {
        if (request.method !== 'GET') {
          throw new ForbiddenException('Admin access to this company is read-only');
        }
        request.membershipRole = Role.AUDITOR;
        request.membershipBranchId = null;
        return true;
      }
      throw new ForbiddenException('You are not a member of this company');
    }

    const allowedRoles = this.reflector.getAllAndOverride<Role[] | undefined>(
      COMPANY_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowedRoles?.length && !allowedRoles.includes(membership.role)) {
      throw new ForbiddenException(
        `Requires one of roles: ${allowedRoles.join(', ')}`,
      );
    }

    // Licence gate: once the owner's trial/plan lapses the company is read-only
    // (GET still works) — any write is blocked until they renew.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      await this.licensing.assertCompanyActive(companyId);
    }

    request.membershipRole = membership.role;
    request.membershipBranchId = membership.branchId;
    return true;
  }
}
