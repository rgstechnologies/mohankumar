import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Path → stable action key: ids collapsed, prefix stripped. */
export function actionOf(path: string): string {
  return path
    .split('?')[0]
    .replace(/^\/api\/v\d+\//, '')
    .replace(UUID_RE, ':id');
}

/**
 * Writes one audit row per mutating request — who, what, from where, and
 * whether it succeeded. Fire-and-forget: the trail must never slow down or
 * break the request itself. Bodies are deliberately not recorded.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: { id: string; email?: string } }>();
    if (!MUTATING.has(req.method)) return next.handle();
    const action = actionOf(req.originalUrl ?? req.url);
    if (action.startsWith('health')) return next.handle();

    const record = (status: number) => {
      const companyId =
        (req.params as Record<string, string> | undefined)?.companyId ??
        /companies\/([0-9a-f-]{36})/i.exec(req.originalUrl ?? '')?.[1] ??
        null;
      this.prisma.auditLog
        .create({
          data: {
            companyId,
            userId: req.user?.id ?? null,
            userEmail: req.user?.email ?? null,
            method: req.method,
            action,
            path: (req.originalUrl ?? req.url).slice(0, 500),
            status,
            ip: req.ip ?? null,
          },
        })
        .catch((error) =>
          this.logger.warn(`audit write failed: ${String(error)}`),
        );
    };

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<Response>();
          record(res.statusCode);
        },
        error: (error: { status?: number }) => record(error?.status ?? 500),
      }),
    );
  }
}
