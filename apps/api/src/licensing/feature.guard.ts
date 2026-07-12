import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { LicensingService } from './licensing.service';

export const REQUIRES_FEATURE_KEY = 'requiresFeature';

/** Gate a controller/route on a plan feature switch, e.g. @RequiresFeature('payroll'). */
export const RequiresFeature = (feature: string) =>
  SetMetadata(REQUIRES_FEATURE_KEY, feature);

/** Use AFTER CompanyRoleGuard — relies on :companyId in the route. */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly licensing: LicensingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRES_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!feature) return true;
    const request = context.switchToHttp().getRequest<Request>();
    const companyId = request.params.companyId;
    if (typeof companyId !== 'string' || companyId.length === 0) return true;
    await this.licensing.assertCompanyFeature(companyId, feature);
    return true;
  }
}
