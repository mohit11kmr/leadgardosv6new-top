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

export const emailProvider: EmailProvider = new ConsoleEmailProvider();
