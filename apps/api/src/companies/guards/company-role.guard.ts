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
    // No bypass. Membership of the company is the only way in — there is no
    // super-admin backdoor, because there is no console left to administer one
    // and a standing privilege nobody can see is a privilege nobody can revoke.
    if (!membership) {
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

    request.membershipRole = membership.role;
    request.membershipBranchId = membership.branchId;
    return true;
  }
}
