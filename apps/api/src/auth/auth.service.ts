import {
  BadRequestException,
  ConflictException,
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
import { LicensingService } from '../licensing/licensing.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

const BCRYPT_ROUNDS = 10;

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
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
      private readonly licensing: LicensingService,
  ) {}

  async register(
    name: string,
    email: string,
    phone: string,
    password: string,
    accountType: 'BUSINESS' | 'AUDITOR' = 'BUSINESS',
  ): Promise<AuthResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = this.normalizePhone(phone);
    if (!normalizedPhone) {
      throw new BadRequestException('Enter a valid phone number');
    }
    if (await this.prisma.user.findUnique({ where: { email: normalizedEmail } })) {
      throw new ConflictException('An account with this email already exists');
    }
    if (await this.prisma.user.findUnique({ where: { phone: normalizedPhone } })) {
      throw new ConflictException('An account with this phone number already exists');
    }

    const user = await this.prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        phone: normalizedPhone,
        passwordHash: await this.hashPassword(password),
        accountType,
      },
    });
    // Business accounts start on the free company trial; auditor accounts don't
    // run companies, so they don't need a company subscription.
    if (accountType !== 'AUDITOR') {
      await this.licensing.startTrial(user.id);
    }
    // Payroll employees registered with their work email get portal access.
    await this.prisma.employee.updateMany({
      where: { email: normalizedEmail, userId: null },
      data: { userId: user.id },
    });
    return this.buildAuthResult(user);
  }

  async login(
    identifier: string,
    password: string,
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
    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Invalid email/phone or password');
    }
    if (user.isBlocked) {
      throw new UnauthorizedException('This account is blocked — contact support');
    }
    if (user.totpEnabled) {
      // Password verified, but tokens only come after the TOTP step.
      const mfaToken = await this.jwt.signAsync(
        { sub: user.id, purpose: 'mfa' },
        {
          secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
          expiresIn: 300,
        },
      );
      return { mfaRequired: true as const, mfaToken };
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return this.buildAuthResult(user);
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
    let payload: { sub: string; purpose?: string };
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
    return this.buildAuthResult(user);
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
    return this.buildAuthResult(stored.user);
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
        accountType: true,
        isSuperAdmin: true,
        totpEnabled: true,
        memberships: {
          select: {
            role: true,
            company: { select: { id: true, name: true, gstin: true, stateCode: true } },
          },
        },
      },
    });
    const subscription = await this.licensing.summary(userId);
    return { ...user, subscription };
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

  private async buildAuthResult(user: User): Promise<AuthResult> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email },
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
        expiresAt: new Date(Date.now() + refreshTtlSeconds * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
