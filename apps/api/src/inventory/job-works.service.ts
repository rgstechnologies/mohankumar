import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  JobWorkProcess,
  JobWorkStatus,
  PartyType,
} from '@prisma/client';
import { fiscalYearOf } from '../accounting/fiscal-year.util';
import { PrismaService } from '../prisma/prisma.service';

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export interface JobWorkLineInput {
  itemId: string;
  quantity: number;
}

export interface JobWorkReceiptInput {
  date: string;
  itemId: string;
  quantity: number;
  wastageQty?: number;
  notes?: string;
}

@Injectable()
export class JobWorksService {
  constructor(private readonly prisma: PrismaService) {}

  private displayNo(fiscalYear: string, jobNo: number): string {
    return `JW/${fiscalYear}/${String(jobNo).padStart(4, '0')}`;
  }

  private async serialize(jobWork: {
    id: string;
    jobNo: number;
    fiscalYear: string;
    process: JobWorkProcess;
    status: JobWorkStatus;
    issueDate: Date;
    dueDate: Date | null;
    notes: string | null;
    party: { id: string; name: string };
    issues: {
      lineNo: number;
      quantity: unknown;
      item: { id: string; name: string; unit: string };
    }[];
    receipts: {
      id: string;
      date: Date;
      quantity: unknown;
      wastageQty: unknown;
      notes: string | null;
      item: { id: string; name: string; unit: string };
    }[];
  }) {
    const issuedTotal = jobWork.issues.reduce((s, l) => s + Number(l.quantity), 0);
    const receivedTotal = jobWork.receipts.reduce((s, l) => s + Number(l.quantity), 0);
    const wastageTotal = jobWork.receipts.reduce((s, l) => s + Number(l.wastageQty), 0);
    return {
      id: jobWork.id,
      jobNo: this.displayNo(jobWork.fiscalYear, jobWork.jobNo),
      process: jobWork.process,
      status: jobWork.status,
      issueDate: jobWork.issueDate,
      dueDate: jobWork.dueDate,
      notes: jobWork.notes,
      party: jobWork.party,
      issues: jobWork.issues.map((l) => ({
        lineNo: l.lineNo,
        item: l.item,
        quantity: Number(l.quantity),
      })),
      receipts: jobWork.receipts.map((l) => ({
        id: l.id,
        date: l.date,
        item: l.item,
        quantity: Number(l.quantity),
        wastageQty: Number(l.wastageQty),
        notes: l.notes,
      })),
      totals: {
        issued: r3(issuedTotal),
        received: r3(receivedTotal),
        wastage: r3(wastageTotal),
        // Indicative only — issue and receipt items may differ (grey → dyed).
        pending: r3(Math.max(0, issuedTotal - receivedTotal - wastageTotal)),
      },
    };
  }

  private readonly fullInclude = {
    party: { select: { id: true, name: true } },
    issues: {
      orderBy: { lineNo: 'asc' as const },
      include: { item: { select: { id: true, name: true, unit: true } } },
    },
    receipts: {
      orderBy: { date: 'asc' as const },
      include: { item: { select: { id: true, name: true, unit: true } } },
    },
  };

  async list(companyId: string) {
    const jobs = await this.prisma.jobWork.findMany({
      where: { companyId },
      include: this.fullInclude,
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return Promise.all(jobs.map((j) => this.serialize(j)));
  }

  async getOne(companyId: string, jobWorkId: string) {
    const job = await this.prisma.jobWork.findFirst({
      where: { id: jobWorkId, companyId },
      include: this.fullInclude,
    });
    if (!job) throw new NotFoundException('Job work not found');
    return this.serialize(job);
  }

  async create(
    companyId: string,
    userId: string,
    input: {
      partyId: string;
      process: JobWorkProcess;
      issueDate: string;
      dueDate?: string;
      notes?: string;
      lines: JobWorkLineInput[];
    },
  ) {
    const party = await this.prisma.party.findFirst({
      where: { id: input.partyId, companyId, isActive: true },
    });
    if (!party) throw new BadRequestException('Unknown job worker');
    if (party.type !== PartyType.VENDOR) {
      throw new BadRequestException('Job workers must be vendors');
    }

    const itemIds = [...new Set(input.lines.map((l) => l.itemId))];
    const items = await this.prisma.item.count({
      where: { id: { in: itemIds }, companyId, isActive: true },
    });
    if (items !== itemIds.length) {
      throw new BadRequestException('One or more items are invalid');
    }

    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { fyStartMonth: true },
    });
    const issueDate = new Date(input.issueDate);
    const fiscalYear = fiscalYearOf(issueDate, company.fyStartMonth);

    const created = await this.prisma.$transaction(async (tx) => {
      const counter = await tx.jobWorkCounter.upsert({
        where: { companyId_fiscalYear: { companyId, fiscalYear } },
        create: { companyId, fiscalYear, nextNo: 2 },
        update: { nextNo: { increment: 1 } },
      });
      return tx.jobWork.create({
        data: {
          companyId,
          jobNo: counter.nextNo - 1,
          fiscalYear,
          partyId: input.partyId,
          process: input.process,
          issueDate,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          notes: input.notes,
          createdById: userId,
          issues: {
            create: input.lines.map((line, i) => ({
              lineNo: i + 1,
              itemId: line.itemId,
              quantity: line.quantity,
            })),
          },
        },
        include: this.fullInclude,
      });
    });
    return this.serialize(created);
  }

  async addReceipt(
    companyId: string,
    jobWorkId: string,
    input: JobWorkReceiptInput,
  ) {
    const job = await this.prisma.jobWork.findFirst({
      where: { id: jobWorkId, companyId },
    });
    if (!job) throw new NotFoundException('Job work not found');
    if (job.status === JobWorkStatus.CLOSED || job.status === JobWorkStatus.CANCELLED) {
      throw new BadRequestException(`A ${job.status.toLowerCase()} job cannot receive goods`);
    }
    const item = await this.prisma.item.findFirst({
      where: { id: input.itemId, companyId, isActive: true },
    });
    if (!item) throw new BadRequestException('Unknown item');

    await this.prisma.$transaction([
      this.prisma.jobWorkReceiptLine.create({
        data: {
          jobWorkId: job.id,
          date: new Date(input.date),
          itemId: input.itemId,
          quantity: input.quantity,
          wastageQty: input.wastageQty ?? 0,
          notes: input.notes,
        },
      }),
      this.prisma.jobWork.update({
        where: { id: job.id },
        data: { status: JobWorkStatus.PARTIAL },
      }),
    ]);
    return this.getOne(companyId, jobWorkId);
  }

  /** Close = nothing more expected; leftover issued material counts as consumed. */
  async close(companyId: string, jobWorkId: string) {
    const job = await this.prisma.jobWork.findFirst({
      where: { id: jobWorkId, companyId },
    });
    if (!job) throw new NotFoundException('Job work not found');
    if (job.status === JobWorkStatus.CANCELLED) {
      throw new BadRequestException('This job was cancelled');
    }
    await this.prisma.jobWork.update({
      where: { id: job.id },
      data: { status: JobWorkStatus.CLOSED },
    });
    return this.getOne(companyId, jobWorkId);
  }

  /** Cancel restores the issued stock — only possible before any receipt. */
  async cancel(companyId: string, jobWorkId: string) {
    const job = await this.prisma.jobWork.findFirst({
      where: { id: jobWorkId, companyId },
      include: { receipts: { select: { id: true }, take: 1 } },
    });
    if (!job) throw new NotFoundException('Job work not found');
    if (job.receipts.length > 0) {
      throw new BadRequestException(
        'Goods were already received against this job — close it instead',
      );
    }
    await this.prisma.jobWork.update({
      where: { id: job.id },
      data: { status: JobWorkStatus.CANCELLED },
    });
    return this.getOne(companyId, jobWorkId);
  }

  /** Per-item job-work movement, for the stock report. */
  async stockEffect(companyId: string) {
    const [issued, received, issuedOpen] = await Promise.all([
      this.prisma.jobWorkIssueLine.groupBy({
        by: ['itemId'],
        where: { jobWork: { companyId, status: { not: JobWorkStatus.CANCELLED } } },
        _sum: { quantity: true },
      }),
      this.prisma.jobWorkReceiptLine.groupBy({
        by: ['itemId'],
        where: { jobWork: { companyId, status: { not: JobWorkStatus.CANCELLED } } },
        _sum: { quantity: true },
      }),
      this.prisma.jobWorkIssueLine.groupBy({
        by: ['itemId'],
        where: {
          jobWork: {
            companyId,
            status: { in: [JobWorkStatus.OPEN, JobWorkStatus.PARTIAL] },
          },
        },
        _sum: { quantity: true },
      }),
    ]);
    return {
      issuedByItem: new Map(issued.map((r) => [r.itemId, Number(r._sum.quantity ?? 0)])),
      receivedByItem: new Map(received.map((r) => [r.itemId, Number(r._sum.quantity ?? 0)])),
      withWorkerByItem: new Map(
        issuedOpen.map((r) => [r.itemId, Number(r._sum.quantity ?? 0)]),
      ),
    };
  }
}
