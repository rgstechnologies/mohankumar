import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as QRCode from 'qrcode';
import {
  generateTotpSecret,
  otpauthUri,
  verifyTotp,
} from './totp';
import type { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { fiscalYearOf, fiscalYearsSince } from '../accounting/fiscal-year.util';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

const BCRYPT_ROUNDS = 10;

/**
 * Brute-force defence for a single shared login.
 *
 * The per-IP throttler already caps attempts, but it is per-IP: a slow attack
 * spread across many addresses walks straight past it. Locking the account after
 * a handful of wrong passwords caps the total guess rate no matter where the
 * attempts come from. The window is short enough that a legitimate user who
 * fat-fingers their password waits minutes, not hours.
 */
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface MfaChallenge {
  mfaRequired: true;
  /** Short-lived proof that the password step succeeded. */
  mfaToken: string;
}

export interface AuthResult extends TokenPair {
  user: { id: string; email: string; name: string };
  /** The financial year this session is working in, e.g. "2026-27". */
  fiscalYear: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  /**
   * There is deliberately no public self-registration in this build. It is a
   * single-business install: accounts are provisioned by the operator (see the
   * seed script), so an open sign-up route would only be a way in for strangers.
   */

  async login(
    identifier: string,
    password: string,
    fiscalYear?: string,
  ): Promise<AuthResult | MfaChallenge> {
    // The identifier is an email or a phone number — match either.
    const trimmed = identifier.trim();
    const user = trimmed.includes('@')
      ? await this.prisma.user.findUnique({
          where: { email: trimmed.toLowerCase() },
        })
      : await this.prisma.user.findUnique({
          where: { phone: this.normalizePhone(trimmed) },
        });
    // Same error for unknown account and wrong password — no account enumeration.
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email/phone or password');
    }
    // Check the lock BEFORE the password: a locked account must not become an
    // oracle that says "right password, but locked".
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.max(
        1,
        Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000),
      );
      throw new UnauthorizedException(
        `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      );
    }

    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      await this.registerFailedLogin(user.id, user.failedLoginAttempts);
      throw new UnauthorizedException('Invalid email/phone or password');
    }
    if (user.isBlocked) {
      throw new UnauthorizedException('This account is blocked — contact support');
    }
    // Validate the requested year here, at the password step, so the choice is
    // already trusted by the time tokens are issued.
    const fy = await this.resolveFiscalYear(fiscalYear);

    if (user.totpEnabled) {
      // Password verified, but tokens only come after the TOTP step. The chosen
      // year rides on the mfaToken rather than being re-sent by the client.
      const mfaToken = await this.jwt.signAsync(
        { sub: user.id, purpose: 'mfa', fy },
        {
          secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
          expiresIn: 300,
        },
      );
      return { mfaRequired: true as const, mfaToken };
    }
    // A good password clears the failure count — the lock only ever punishes a
    // run of wrong guesses, never a user who eventually gets it right.
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
    });
    return this.buildAuthResult(user, fy);
  }

  /** Counts a wrong password and locks the account once they pile up. */
  private async registerFailedLogin(userId: string, current: number): Promise<void> {
    const attempts = current + 1;
    const locked = attempts >= MAX_FAILED_LOGINS;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: locked ? 0 : attempts,
        lockedUntil: locked
          ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
          : undefined,
      },
    });
  }

  /**
   * The financial years this business has books for — oldest first, with the
   * current one last. Used by the login screen's year picker.
   *
   * Single-business install: there is exactly one company, so this needs no
   * authentication. It exposes nothing but year labels.
   */
  async fiscalYears(): Promise<{ fiscalYears: string[]; current: string }> {
    const company = await this.prisma.company.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, fyStartMonth: true },
    });
    const now = new Date();
    if (!company) {
      const only = fiscalYearOf(now, 4);
      return { fiscalYears: [only], current: only };
    }
    const years = fiscalYearsSince(company.createdAt, now, company.fyStartMonth);
    return { fiscalYears: years, current: years[years.length - 1] };
  }

  /** Defaults to the current year; rejects a year the business has no books for. */
  private async resolveFiscalYear(requested?: string): Promise<string> {
    const { fiscalYears, current } = await this.fiscalYears();
    if (!requested) return current;
    if (!fiscalYears.includes(requested)) {
      throw new BadRequestException(
        `${requested} is not one of this business's financial years`,
      );
    }
    return requested;
  }

  // -------------------------------------------------------------
  // MFA (TOTP)
  // -------------------------------------------------------------

  /** Step 1: stage a secret. Not active until a code confirms it. */
  async mfaSetup(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.totpEnabled) {
      throw new BadRequestException('Two-factor authentication is already enabled');
    }
    const secret = generateTotpSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: secret, totpEnabled: false },
    });
    const uri = otpauthUri(secret, user.email);
    return {
      secret,
      otpauthUri: uri,
      qrDataUrl: await QRCode.toDataURL(uri, { width: 220, margin: 1 }),
    };
  }

  /** Step 2: confirm with a live code → enabled + one-time recovery codes. */
  async mfaEnable(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.totpEnabled) {
      throw new BadRequestException('Two-factor authentication is already enabled');
    }
    if (!user.totpSecret || !verifyTotp(user.totpSecret, code)) {
      throw new BadRequestException('That code is not valid — check your authenticator app');
    }
    const recoveryCodes = Array.from({ length: 8 }, () =>
      randomBytes(5).toString('hex'),
    );
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpEnabled: true,
        mfaRecoveryCodes: recoveryCodes.map((c) => this.hashToken(c)),
      },
    });
    // Shown exactly once — only hashes are stored.
    return { enabled: true, recoveryCodes };
  }

  async mfaDisable(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpEnabled || !user.totpSecret) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }
    const valid =
      verifyTotp(user.totpSecret, code) || this.consumeRecoveryCode(user, code) !== null;
    if (!valid) {
      throw new BadRequestException('That code is not valid');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: null, totpEnabled: false, mfaRecoveryCodes: [] },
    });
    return { enabled: false };
  }

  /** Step 2 of login: exchange password-proof + TOTP/recovery code for tokens. */
  async mfaVerify(mfaToken: string, code: string): Promise<AuthResult> {
    let payload: { sub: string; purpose?: string; fy?: string };
    try {
      payload = await this.jwt.verifyAsync(mfaToken, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('The sign-in attempt expired — log in again');
    }
    if (payload.purpose !== 'mfa') {
      throw new UnauthorizedException('The sign-in attempt expired — log in again');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive || user.isBlocked || !user.totpEnabled || !user.totpSecret) {
      throw new UnauthorizedException('The sign-in attempt expired — log in again');
    }

    if (!verifyTotp(user.totpSecret, code)) {
      const remaining = this.consumeRecoveryCode(user, code);
      if (remaining === null) {
        throw new UnauthorizedException('Invalid code');
      }
      await this.prisma.user.update({
        where: { id: user.id },
        data: { mfaRecoveryCodes: remaining },
      });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return this.buildAuthResult(user, await this.resolveFiscalYear(payload.fy));
  }

  /** Returns the remaining hashes when the code matched, else null. */
  private consumeRecoveryCode(
    user: { mfaRecoveryCodes: string[] },
    code: string,
  ): string[] | null {
    const hash = this.hashToken(code.trim().toLowerCase());
    if (!user.mfaRecoveryCodes.includes(hash)) return null;
    return user.mfaRecoveryCodes.filter((h) => h !== hash);
  }

  /** Rotate: every refresh invalidates the presented token and issues a new pair. */
  async refresh(refreshToken: string): Promise<AuthResult> {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !stored ||
      stored.revokedAt !== null ||
      stored.expiresAt < new Date() ||
      !stored.user.isActive
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    // Rotating the session must not silently move the user to another year.
    return this.buildAuthResult(
      stored.user,
      await this.resolveFiscalYear(stored.fiscalYear ?? undefined),
    );
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        totpEnabled: true,
        memberships: {
          select: {
            role: true,
            company: { select: { id: true, name: true, gstin: true, stateCode: true } },
          },
        },
      },
    });
    return user;
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  /**
   * Strip formatting so the same number always stores/matches identically:
   * keep digits and an optional leading "+". Returns '' when nothing usable
   * remains (so callers can reject it).
   */
  private normalizePhone(phone: string): string {
    const trimmed = phone.trim();
    const plus = trimmed.startsWith('+') ? '+' : '';
    const digits = trimmed.replace(/[^0-9]/g, '');
    return digits ? plus + digits : '';
  }

  /**
   * Always succeeds from the caller's perspective — whether or not the
   * email exists — so the endpoint can't be used to enumerate accounts.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user || !user.isActive) return;

    const token = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour
      },
    });

    const resetUrl = `${this.config.getOrThrow<string>('WEB_ORIGIN')}/reset-password/${token}`;
    await this.mail.sendPasswordReset({ to: user.email, resetUrl });
  }

  /** Sets the new password and revokes every active session. */
  async resetPassword(token: string, password: string): Promise<void> {
    const reset = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hashToken(token) },
    });
    if (!reset || reset.usedAt !== null || reset.expiresAt < new Date()) {
      throw new UnauthorizedException('This reset link is invalid or has expired');
    }

    const passwordHash = await this.hashPassword(password);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: reset.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: reset.id },
        data: { usedAt: new Date() },
      }),
      // A password reset invalidates every existing session.
      this.prisma.refreshToken.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private async buildAuthResult(user: User, fiscalYear: string): Promise<AuthResult> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, fy: fiscalYear },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.getOrThrow<number>('JWT_ACCESS_TTL'),
      },
    );

    const refreshToken = randomBytes(48).toString('hex');
    const refreshTtlSeconds = this.config.getOrThrow<number>('JWT_REFRESH_TTL');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        fiscalYear,
        expiresAt: new Date(Date.now() + refreshTtlSeconds * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      fiscalYear,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
