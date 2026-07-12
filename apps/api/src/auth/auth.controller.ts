import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService, type AuthResult } from './auth.service';
import { CurrentUser, type AuthUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import {
  ForgotPasswordDto,
  LoginDto,
  MfaCodeDto,
  MfaVerifyDto,
  RefreshDto,
  ResetPasswordDto,
} from './dto/auth.dto';

export const ACCESS_COOKIE = 'sa_access';
export const REFRESH_COOKIE = 'sa_refresh';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Browser sessions ride on httpOnly cookies (immune to XSS token theft);
   * the body still carries the tokens for API clients and mobile apps.
   * SameSite=Lax blocks the cookies on cross-site POSTs (CSRF), and
   * production runs same-origin behind nginx anyway.
   */
  private setAuthCookies(res: Response, result: AuthResult): void {
    const secure = this.config.get('NODE_ENV') === 'production';
    res.cookie(ACCESS_COOKIE, result.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      maxAge: this.config.getOrThrow<number>('JWT_ACCESS_TTL') * 1000,
      path: '/',
    });
    res.cookie(REFRESH_COOKIE, result.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      maxAge: this.config.getOrThrow<number>('JWT_REFRESH_TTL') * 1000,
      // The refresh token is only ever needed by the auth endpoints.
      path: '/api/v1/auth',
    });
  }

  private clearAuthCookies(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  }

  // No public /register route: this is a single-business install and accounts
  // are provisioned by the operator, so self-signup would only be a way in.

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('fiscal-years')
  @ApiOperation({
    summary: 'Financial years this business has books for (login year picker)',
  })
  fiscalYears() {
    return this.auth.fiscalYears();
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email or phone + password + financial year' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.identifier, dto.password, dto.fiscalYear);
    if ('mfaRequired' in result) return result; // cookies only after the code
    this.setAuthCookies(res, result);
    return result;
  }

  // ---- Two-factor authentication ----

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete an MFA login with a TOTP or recovery code' })
  async mfaVerify(
    @Body() dto: MfaVerifyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.mfaVerify(dto.mfaToken, dto.code);
    this.setAuthCookies(res, result);
    return result;
  }

  @Post('mfa/setup')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start enabling 2FA — returns the QR to scan' })
  mfaSetup(@CurrentUser() user: AuthUser) {
    return this.auth.mfaSetup(user.id);
  }

  @Post('mfa/enable')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm the first code — returns recovery codes ONCE' })
  mfaEnable(@CurrentUser() user: AuthUser, @Body() dto: MfaCodeDto) {
    return this.auth.mfaEnable(user.id, dto.code);
  }

  @Post('mfa/disable')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Turn 2FA off (needs a valid TOTP or recovery code)' })
  mfaDisable(@CurrentUser() user: AuthUser, @Body() dto: MfaCodeDto) {
    return this.auth.mfaDisable(user.id, dto.code);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token (cookie or body) for a new pair' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: RefreshDto,
  ) {
    const token =
      dto.refreshToken ??
      (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    const result = await this.auth.refresh(token ?? '');
    this.setAuthCookies(res, result);
    return result;
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the session and clear cookies' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: RefreshDto,
  ): Promise<void> {
    const token =
      dto.refreshToken ??
      (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (token) await this.auth.logout(token);
    this.clearAuthCookies(res);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Email a password reset link (always 204 — no account enumeration)',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Set a new password using an emailed reset token' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.auth.resetPassword(dto.token, dto.password);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user profile + company memberships' })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
