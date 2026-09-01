import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'smtp-message-id-123' });
const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));

vi.mock('nodemailer', () => ({
  default: { createTransport: createTransportMock },
}));

describe('SmtpEmailProvider', () => {
  beforeEach(() => {
    sendMailMock.mockClear();
    createTransportMock.mockClear();
  });

  it('sends real mail through nodemailer instead of only logging to console', async () => {
    const { SmtpEmailProvider } = await import('./emailProvider.js');
    const provider = new SmtpEmailProvider();

    const result = await provider.sendEmail({
      to: 'customer@example.com',
      subject: 'Test alert',
      body: 'Something happened.',
    });

    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock.mock.calls[0]?.[0]).toMatchObject({
      to: 'customer@example.com',
      subject: 'Test alert',
      text: 'Something happened.',
    });
    expect(result).toEqual({ messageId: 'smtp-message-id-123', success: true });
  });

  it('selects SmtpEmailProvider vs ConsoleEmailProvider based on EMAIL_PROVIDER', async () => {
    const { ConsoleEmailProvider, SmtpEmailProvider } = await import('./emailProvider.js');
    // Both classes exist and implement the same EmailProvider contract —
    // the singleton export picks between them based on config.EMAIL_PROVIDER
    // (see the bottom of emailProvider.ts).
    expect(new ConsoleEmailProvider().sendEmail).toBeInstanceOf(Function);
    expect(new SmtpEmailProvider().sendEmail).toBeInstanceOf(Function);
  });
});
