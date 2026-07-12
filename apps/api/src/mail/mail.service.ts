import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly salesNotifyEmail: string;

  constructor(config: ConfigService) {
    this.from = config.getOrThrow<string>('SMTP_FROM');
    this.salesNotifyEmail = config.get<string>('SALES_NOTIFY_EMAIL') ?? '';
    this.transporter = nodemailer.createTransport({
      host: config.getOrThrow<string>('SMTP_HOST'),
      port: config.getOrThrow<number>('SMTP_PORT'),
      secure: config.get<boolean>('SMTP_SECURE') ?? false,
      auth: config.get<string>('SMTP_USER')
        ? {
            user: config.getOrThrow<string>('SMTP_USER'),
            pass: config.getOrThrow<string>('SMTP_PASSWORD'),
          }
        : undefined,
    });
  }

  async sendPasswordReset(options: { to: string; resetUrl: string }): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: options.to,
        subject: 'Reset your RGS password',
        text: [
          'We received a request to reset your RGS password.',
          '',
          `Reset it here: ${options.resetUrl}`,
          '',
          'This link expires in 1 hour. If you did not request this, you can safely ignore this email.',
        ].join('\n'),
        html: `
          <p>We received a request to reset your RGS password.</p>
          <p><a href="${options.resetUrl}">Reset your password</a></p>
          <p style="color:#64748b;font-size:12px">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
        `,
      });
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${options.to}`, error);
    }
  }

  async sendInvite(options: {
    to: string;
    companyName: string;
    role: string;
    inviterName: string;
    acceptUrl: string;
  }): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: options.to,
        subject: `${options.inviterName} invited you to ${options.companyName} on RGS`,
        text: [
          `${options.inviterName} has invited you to join "${options.companyName}" as ${options.role}.`,
          '',
          `Accept the invitation: ${options.acceptUrl}`,
          '',
          'This link expires in 7 days.',
        ].join('\n'),
        html: `
          <p><strong>${options.inviterName}</strong> has invited you to join
          <strong>${options.companyName}</strong> as <strong>${options.role}</strong>.</p>
          <p><a href="${options.acceptUrl}">Accept the invitation</a></p>
          <p style="color:#64748b;font-size:12px">This link expires in 7 days.</p>
        `,
      });
    } catch (error) {
      // Email failure must not break the API flow — the invite link can be re-sent.
      this.logger.error(`Failed to send invite email to ${options.to}`, error);
    }
  }

  /**
   * Alerts platform staff that a new enterprise "Contact sales" enquiry arrived.
   * No-op when SALES_NOTIFY_EMAIL is unset, so the lead is still saved either way.
   */
  async sendSalesLeadNotification(lead: {
    name: string;
    companyName: string;
    email: string;
    phone: string;
    requirements?: string | null;
  }): Promise<void> {
    if (!this.salesNotifyEmail) return;
    const reqLine = lead.requirements?.trim() || '—';
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: this.salesNotifyEmail,
        replyTo: lead.email,
        subject: `New sales enquiry — ${lead.companyName}`,
        text: [
          'A new Enterprise enquiry was submitted from the pricing page.',
          '',
          `Company:      ${lead.companyName}`,
          `Contact:      ${lead.name}`,
          `Email:        ${lead.email}`,
          `Phone:        ${lead.phone}`,
          `Requirements: ${reqLine}`,
          '',
          'Open the Leads tab in the admin console to follow up.',
        ].join('\n'),
        html: `
          <p>A new <strong>Enterprise enquiry</strong> was submitted from the pricing page.</p>
          <table style="border-collapse:collapse;font-size:14px">
            <tr><td style="padding:2px 12px 2px 0;color:#64748b">Company</td><td><strong>${lead.companyName}</strong></td></tr>
            <tr><td style="padding:2px 12px 2px 0;color:#64748b">Contact</td><td>${lead.name}</td></tr>
            <tr><td style="padding:2px 12px 2px 0;color:#64748b">Email</td><td><a href="mailto:${lead.email}">${lead.email}</a></td></tr>
            <tr><td style="padding:2px 12px 2px 0;color:#64748b">Phone</td><td><a href="tel:${lead.phone}">${lead.phone}</a></td></tr>
            <tr><td style="padding:2px 12px 2px 0;color:#64748b;vertical-align:top">Requirements</td><td>${reqLine}</td></tr>
          </table>
          <p style="color:#64748b;font-size:12px">Open the Leads tab in the admin console to follow up.</p>
        `,
      });
    } catch (error) {
      // Notification failure must not break the public enquiry submission.
      this.logger.error('Failed to send sales lead notification', error);
    }
  }

  /**
   * In-app "Contact us" query from a signed-in user, delivered to the admin
   * inbox (SALES_NOTIFY_EMAIL). Reply-To is the sender so support can respond
   * with one click.
   */
  async sendContactQuery(query: {
    fromName: string;
    fromEmail: string;
    subject: string;
    message: string;
  }): Promise<void> {
    if (!this.salesNotifyEmail) {
      this.logger.warn('Contact query received but SALES_NOTIFY_EMAIL is unset — not delivered');
      return;
    }
    const subject = query.subject
      ? `Support query: ${query.subject} — ${query.fromName}`
      : `Support query from ${query.fromName}`;
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: this.salesNotifyEmail,
        replyTo: query.fromEmail,
        subject,
        text: [
          'A user sent a query from inside RGS ERP.',
          '',
          `From:    ${query.fromName} <${query.fromEmail}>`,
          query.subject ? `Subject: ${query.subject}` : null,
          '',
          query.message,
        ]
          .filter((l) => l !== null)
          .join('\n'),
        html: `
          <p>A user sent a query from inside RGS ERP.</p>
          <p style="font-size:14px">
            <strong>From:</strong> ${query.fromName}
            &lt;<a href="mailto:${query.fromEmail}">${query.fromEmail}</a>&gt;
            ${query.subject ? `<br/><strong>Subject:</strong> ${query.subject}` : ''}
          </p>
          <p style="white-space:pre-wrap;font-size:14px">${query.message}</p>
        `,
      });
    } catch (error) {
      this.logger.error('Failed to send contact query', error);
    }
  }
}
