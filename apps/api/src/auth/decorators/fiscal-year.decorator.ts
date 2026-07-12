import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from './current-user.decorator';

/**
 * The financial year this session is working in, e.g. "2026-27" — chosen at
 * login and carried in the access token.
 *
 * What it scopes: which year's documents a list or report shows, and which
 * year a new document is numbered in. What it does NOT scope: stock on hand and
 * customer/vendor outstanding. Those are cumulative by design — the books are
 * one continuous ledger, so an unpaid bill from last year still shows as due
 * this year, and closing stock carries forward without a year-end close.
 *
 * Undefined only for tokens issued before the year existed; callers treat that
 * as "no year filter".
 */
export const FiscalYear = createParamDecorator(
  (_: unknown, context: ExecutionContext): string | undefined => {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    return request.user?.fiscalYear;
  },
);
