import { Injectable } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { BatchesService } from '../inventory/batches.service';
import { PrismaService } from '../prisma/prisma.service';
import { PurchasesService } from '../purchases/purchases.service';

export interface Notification {
  id: string;
  severity: 'info' | 'warning' | 'urgent';
  title: string;
  detail: string;
  /** Workspace tab the notification links to. */
  tab: string;
  /** Whether the current user has already marked this alert read. */
  read?: boolean;
}

/** Stable fingerprint of an alert's content, so read-state invalidates on change. */
function contentHash(n: Notification): string {
  return createHash('sha1')
    .update(`${n.id}\n${n.title}\n${n.detail}`)
    .digest('hex');
}

const DAY = 24 * 3600 * 1000;

const inr = (n: number) =>
  n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly purchases: PurchasesService,
    private readonly batches: BatchesService,
  ) {}

  /** Computed alerts merged with the user's read-state. */
  async list(companyId: string, userId: string): Promise<Notification[]> {
    const notifications = await this.compute(companyId);
    return this.attachReadState(companyId, userId, notifications);
  }

  /** Mark a single alert read for this user (no-op if it no longer exists). */
  async markRead(
    companyId: string,
    userId: string,
    notificationId: string,
  ): Promise<Notification[]> {
    const notifications = await this.compute(companyId);
    const target = notifications.find((n) => n.id === notificationId);
    if (target) {
      await this.upsertRead(companyId, userId, target);
    }
    return this.attachReadState(companyId, userId, notifications);
  }

  /** Mark every current alert read for this user. */
  async markAllRead(companyId: string, userId: string): Promise<Notification[]> {
    const notifications = await this.compute(companyId);
    await Promise.all(
      notifications.map((n) => this.upsertRead(companyId, userId, n)),
    );
    return this.attachReadState(companyId, userId, notifications);
  }

  private async upsertRead(
    companyId: string,
    userId: string,
    n: Notification,
  ): Promise<void> {
    const hash = contentHash(n);
    await this.prisma.notificationRead.upsert({
      where: {
        companyId_userId_notificationId: {
          companyId,
          userId,
          notificationId: n.id,
        },
      },
      create: { companyId, userId, notificationId: n.id, contentHash: hash },
      update: { contentHash: hash, readAt: new Date() },
    });
  }

  private async attachReadState(
    companyId: string,
    userId: string,
    notifications: Notification[],
  ): Promise<Notification[]> {
    const reads = await this.prisma.notificationRead.findMany({
      where: { companyId, userId },
      select: { notificationId: true, contentHash: true },
    });
    const readByKey = new Map(reads.map((r) => [r.notificationId, r.contentHash]));
    return notifications.map((n) => ({
      ...n,
      read: readByKey.get(n.id) === contentHash(n),
    }));
  }

  private async compute(companyId: string): Promise<Notification[]> {
    const [stock, receivables, payables, expiry, openingDocs] =
      await Promise.all([
        this.purchases.stockReport(companyId),
        this.outstandingInvoices(companyId),
        this.outstandingBills(companyId),
        this.batches.expiryAlerts(companyId),
        this.outstandingOpeningDocs(companyId),
      ]);

    const notifications: Notification[] = [];
    const now = new Date();

    // ---- Receivables: overdue + due soon ----
    const overdue = receivables.filter(
      (inv) => inv.dueDate && inv.dueDate.getTime() < now.getTime(),
    );
    if (overdue.length > 0) {
      const total = overdue.reduce((s, inv) => s + inv.outstanding, 0);
      notifications.push({
        id: 'invoices-overdue',
        severity: 'urgent',
        title: `${overdue.length} invoice${overdue.length > 1 ? 's' : ''} overdue`,
        detail: `₹${inr(total)} receivable past due — ${overdue
          .slice(0, 3)
          .map((i) => i.partyName)
          .join(', ')}${overdue.length > 3 ? '…' : ''}`,
        tab: 'invoices',
      });
    }

    const dueSoon = receivables.filter(
      (inv) =>
        inv.dueDate &&
        inv.dueDate.getTime() >= now.getTime() &&
        inv.dueDate.getTime() <= now.getTime() + 7 * DAY,
    );
    if (dueSoon.length > 0) {
      const total = dueSoon.reduce((s, inv) => s + inv.outstanding, 0);
      notifications.push({
        id: 'invoices-due-soon',
        severity: 'warning',
        title: `${dueSoon.length} invoice${dueSoon.length > 1 ? 's' : ''} due within 7 days`,
        detail: `₹${inr(total)} expected — follow up with customers`,
        tab: 'invoices',
      });
    }

    // ---- Payables ----
    const billsOverdue = payables.filter(
      (bill) => bill.dueDate && bill.dueDate.getTime() < now.getTime(),
    );
    if (billsOverdue.length > 0) {
      const total = billsOverdue.reduce((s, bill) => s + bill.outstanding, 0);
      notifications.push({
        id: 'bills-overdue',
        severity: 'warning',
        title: `${billsOverdue.length} vendor bill${billsOverdue.length > 1 ? 's' : ''} past due`,
        detail: `₹${inr(total)} payable — avoid late fees and keep vendor terms healthy`,
        tab: 'purchases',
      });
    }

    // ---- Low stock ----
    const lowStock = stock.filter((s) => s.lowStock);
    if (lowStock.length > 0) {
      notifications.push({
        id: 'low-stock',
        severity: 'warning',
        title: `${lowStock.length} item${lowStock.length > 1 ? 's' : ''} below reorder level`,
        detail: lowStock
          .slice(0, 3)
          .map((s) => `${s.name} (${s.onHand} ${s.unit})`)
          .join(', ') + (lowStock.length > 3 ? '…' : ''),
        tab: 'stock',
      });
    }

    // ---- Batch expiry ----
    const expired = expiry.filter((b) => b.expired);
    const expiring = expiry.filter((b) => !b.expired);
    if (expired.length > 0) {
      notifications.push({
        id: 'batches-expired',
        severity: 'urgent',
        title: `${expired.length} batch${expired.length > 1 ? 'es' : ''} expired with stock on hand`,
        detail: expired
          .slice(0, 3)
          .map((b) => `${b.itemName} (${b.batchNo}: ${b.qty} ${b.unit})`)
          .join(', ') + (expired.length > 3 ? '…' : ''),
        tab: 'stock',
      });
    }
    if (expiring.length > 0) {
      notifications.push({
        id: 'batches-expiring',
        severity: 'warning',
        title: `${expiring.length} batch${expiring.length > 1 ? 'es' : ''} expiring within 30 days`,
        detail: expiring
          .slice(0, 3)
          .map((b) => `${b.itemName} (${b.batchNo})`)
          .join(', ') + (expiring.length > 3 ? '…' : ''),
        tab: 'stock',
      });
    }

    // ---- Migrated opening balances still uncollected/unpaid ----
    const openReceivable = openingDocs.filter((d) => d.kind === 'RECEIVABLE');
    if (openReceivable.length > 0) {
      const total = openReceivable.reduce((s, d) => s + d.outstanding, 0);
      notifications.push({
        id: 'opening-receivables',
        severity: 'warning',
        title: `${openReceivable.length} opening invoice${openReceivable.length > 1 ? 's' : ''} still uncollected`,
        detail: `₹${inr(total)} carried over from your previous system — ${openReceivable
          .slice(0, 3)
          .map((d) => `${d.partyName} (${d.refNo})`)
          .join(', ')}${openReceivable.length > 3 ? '…' : ''}`,
        tab: 'invoices',
      });
    }
    const openPayable = openingDocs.filter((d) => d.kind === 'PAYABLE');
    if (openPayable.length > 0) {
      const total = openPayable.reduce((s, d) => s + d.outstanding, 0);
      notifications.push({
        id: 'opening-payables',
        severity: 'info',
        title: `${openPayable.length} opening bill${openPayable.length > 1 ? 's' : ''} still unpaid`,
        detail: `₹${inr(total)} owed to suppliers from before migration`,
        tab: 'purchases',
      });
    }

    // ---- GST filing deadlines (monthly: GSTR-1 by the 11th, 3B by the 20th) ----
    for (const gst of this.gstDeadlines(now)) notifications.push(gst);

    const rank = { urgent: 0, warning: 1, info: 2 };
    return notifications.sort((a, b) => rank[a.severity] - rank[b.severity]);
  }

  /** Upcoming GST due dates within the next 7 days (monthly filers). */
  private gstDeadlines(now: Date): Notification[] {
    const result: Notification[] = [];
    const periodDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const period = periodDate.toLocaleString('en-IN', {
      month: 'long',
      year: 'numeric',
    });

    const deadlines: [string, number, string][] = [
      ['GSTR-1', 11, 'outward supplies'],
      ['GSTR-3B', 20, 'summary return & tax payment'],
    ];
    for (const [name, day, what] of deadlines) {
      const due = new Date(now.getFullYear(), now.getMonth(), day, 23, 59, 59);
      const daysLeft = Math.ceil((due.getTime() - now.getTime()) / DAY);
      if (daysLeft >= 0 && daysLeft <= 7) {
        result.push({
          id: `gst-${name.toLowerCase()}`,
          severity: daysLeft <= 2 ? 'urgent' : 'info',
          title: `${name} for ${period} due ${daysLeft === 0 ? 'today' : `in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`}`,
          detail: `File ${what} by the ${day}th. The export-ready data is in Reports.`,
          tab: 'reports',
        });
      }
    }
    return result;
  }

  private async outstandingInvoices(companyId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { companyId, status: InvoiceStatus.ISSUED },
      include: {
        party: { select: { name: true } },
        payments: { select: { amount: true } },
      },
    });
    return invoices
      .map((inv) => {
        const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
        return {
          partyName: inv.party.name,
          dueDate: inv.dueDate,
          outstanding: Math.round((Number(inv.total) - paid) * 100) / 100,
        };
      })
      .filter((inv) => inv.outstanding > 0);
  }

  private async outstandingOpeningDocs(companyId: string) {
    const docs = await this.prisma.openingDocument.findMany({
      where: { companyId },
      include: { party: { select: { name: true } } },
    });
    return docs
      .map((doc) => ({
        kind: doc.kind,
        refNo: doc.refNo,
        partyName: doc.party.name,
        outstanding:
          Math.round((Number(doc.amount) - Number(doc.settled)) * 100) / 100,
      }))
      .filter((doc) => doc.outstanding > 0);
  }

  private async outstandingBills(companyId: string) {
    const bills = await this.prisma.purchaseBill.findMany({
      where: { companyId, status: InvoiceStatus.ISSUED },
      include: { payments: { select: { amount: true } } },
    });
    return bills
      .map((bill) => {
        const paid = bill.payments.reduce((s, p) => s + Number(p.amount), 0);
        return {
          dueDate: bill.dueDate,
          outstanding: Math.round((Number(bill.total) - paid) * 100) / 100,
        };
      })
      .filter((bill) => bill.outstanding > 0);
  }
}
