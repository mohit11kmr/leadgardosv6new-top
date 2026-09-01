import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '@leadguard/config';

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export interface EmailProvider {
  sendEmail(message: EmailMessage): Promise<{ messageId: string; success: boolean }>;
}

export class ConsoleEmailProvider implements EmailProvider {
  async sendEmail(message: EmailMessage): Promise<{ messageId: string; success: boolean }> {
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log(
      JSON.stringify({
        level: 'info',
        service: 'worker',
        event: 'email_sent',
        messageId,
        to: message.to,
        subject: message.subject,
      })
    );
    return { messageId, success: true };
  }
}

export class SmtpEmailProvider implements EmailProvider {
  private transporter: Transporter;

  constructor() {
    // packages/config's superRefine already refuses to boot with
    // EMAIL_PROVIDER=SMTP unless SMTP_HOST/SMTP_USER/SMTP_PASS are set.
    this.transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
    });
  }

  async sendEmail(message: EmailMessage): Promise<{ messageId: string; success: boolean }> {
    const info = await this.transporter.sendMail({
      from: config.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.body,
    });
    console.log(
      JSON.stringify({
        level: 'info',
        service: 'worker',
        event: 'email_sent',
        messageId: info.messageId,
        to: message.to,
        subject: message.subject,
      })
    );
    return { messageId: info.messageId, success: true };
  }
}

export const emailProvider: EmailProvider =
  config.EMAIL_PROVIDER === 'SMTP' ? new SmtpEmailProvider() : new ConsoleEmailProvider();
