import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { ContactQueryDto } from './dto/support.dto';

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /**
   * In-app "Contact us" query from a signed-in user. Emails the admin inbox
   * with the sender's identity attached, so support can reply directly.
   */
  async contact(user: AuthUser, dto: ContactQueryDto): Promise<{ ok: boolean }> {
    const record = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true, email: true },
    });
    await this.mail.sendContactQuery({
      fromName: record?.name ?? 'A user',
      fromEmail: record?.email ?? user.email,
      subject: dto.subject?.trim() || '',
      message: dto.message.trim(),
    });
    return { ok: true };
  }
}
