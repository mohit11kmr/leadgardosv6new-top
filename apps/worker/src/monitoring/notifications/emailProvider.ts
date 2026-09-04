// Re-exported for backward compatibility — apps/api's authSecurityService
// also needs this to send password-reset/email-verification mail through
// the exact same provider Watchdog alerts already use (see
// packages/shared/src/server-only/email-provider.ts for why the shared
// abstraction lives there rather than duplicated per-app).
export {
  emailProvider,
  ConsoleEmailProvider,
  SmtpEmailProvider,
  type EmailProvider,
  type EmailMessage,
} from '@leadguard/shared/dist/server-only/email-provider.js';
