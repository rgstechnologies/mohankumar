import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

/** Platform staff only — checked against the DB on every call, not the JWT. */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user: AuthUser }>();
    const user = await this.prisma.user.findUnique({
      where: { id: request.user.id },
      select: { isSuperAdmin: true, isBlocked: true },
    });
    if (!user?.isSuperAdmin || user.isBlocked) {
      throw new ForbiddenException('Super admin access required');
    }
    return true;
  }
}
