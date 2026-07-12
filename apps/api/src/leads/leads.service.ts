import { Injectable } from '@nestjs/common';
import { SalesLeadStatus } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadDto, UpdateLeadStatusDto } from './dto/lead.dto';

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async create(dto: CreateLeadDto) {
    const data = {
      name: dto.name.trim(),
      companyName: dto.companyName.trim(),
      email: dto.email.trim().toLowerCase(),
      phone: dto.phone.trim(),
      requirements: dto.requirements?.trim() || null,
      plan: dto.plan ?? 'ENTERPRISE',
    };
    const lead = await this.prisma.salesLead.create({ data, select: { id: true } });
    // Fire-and-forget: a mail failure must never fail the public submission.
    void this.mail.sendSalesLeadNotification(data);
    return lead;
  }

  list(status?: SalesLeadStatus) {
    return this.prisma.salesLead.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  updateStatus(id: string, dto: UpdateLeadStatusDto) {
    return this.prisma.salesLead.update({
      where: { id },
      data: { status: dto.status },
    });
  }
}
