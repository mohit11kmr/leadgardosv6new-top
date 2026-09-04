import { db } from '@leadguard/database';
import { config } from '@leadguard/config';
import { emailProvider } from '@leadguard/shared/dist/server-only/email-provider.js';
import {
  generateSecureToken,
  hashPassword,
  hashToken,
  recordSecurityEvent,
} from '../auth.js';

export class AuthSecurityService {
  /**
   * Dispatches password reset request and stores secure hashed token
   * Returns a generic message to prevent account enumeration
   */
  async requestPasswordReset(email: string, ipAddress?: string | null) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await db.user.findUnique({ where: { email: normalizedEmail } });

    let rawToken: string | null = null;

    if (user) {
      rawToken = generateSecureToken(32);
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });

      await recordSecurityEvent('PASSWORD_RESET_REQUEST', user.id, ipAddress, {
        email: normalizedEmail,
      });

      // Awaited (not fire-and-forget) so the caller/tests can rely on the
      // send having actually completed by the time this method returns, but
      // wrapped so a delivery failure (e.g. SMTP down) never throws past
      // this point — that would either leak account existence (error only
      // for real accounts) or leak infrastructure problems to an
      // unauthenticated caller. The generic response is returned regardless
      // of email outcome; the outcome is only ever observable via the
      // structured log. NEVER log rawToken/the reset URL itself.
      const resetUrl = `${config.APP_URL}/reset-password?token=${rawToken}`;
      try {
        await emailProvider.sendEmail({
          to: normalizedEmail,
          subject: 'Reset your LeadGuard password',
          body: `We received a request to reset your LeadGuard password. This link expires in 1 hour and can only be used once:\n\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
        });
        console.log(
          JSON.stringify({ level: 'info', service: 'api', event: 'password_reset_email_sent', userId: user.id })
        );
      } catch (err) {
        console.error(
          JSON.stringify({
            level: 'error',
            service: 'api',
            event: 'password_reset_email_failed',
            userId: user.id,
            error: err instanceof Error ? err.message : 'Unknown error',
          })
        );
      }
    }

    return {
      message: 'If an account exists with this email address, password reset instructions have been dispatched.',
      // In development/test mode, return rawToken for automated verification
      ...(process.env.NODE_ENV === 'test' && rawToken ? { debugToken: rawToken } : {}),
    };
  }

  /**
   * Confirms password reset with single-use token and invalidates all existing sessions
   */
  async confirmPasswordReset(rawToken: string, newPassword: string, ipAddress?: string | null) {
    const tokenHash = hashToken(rawToken);

    const resetToken = await db.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new Error('Password reset token is invalid or has expired');
    }

    const passwordHash = await hashPassword(newPassword);

    await db.$transaction([
      // Update password
      db.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      // Mark token as used (single-use guarantee)
      db.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      // Invalidate all active sessions for this user across all devices
      db.session.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await recordSecurityEvent('PASSWORD_RESET', resetToken.userId, ipAddress);

    return { success: true };
  }

  /**
   * Requests email verification token
   */
  async requestEmailVerification(userId: string, ipAddress?: string | null) {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    if (user.emailVerifiedAt) {
      return { message: 'This email address is already verified.', alreadyVerified: true };
    }

    const rawToken = generateSecureToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db.emailVerificationToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    const verifyUrl = `${config.APP_URL}/verify-email?token=${rawToken}`;
    try {
      await emailProvider.sendEmail({
        to: user.email,
        subject: 'Verify your LeadGuard email address',
        body: `Please confirm your email address to finish setting up your LeadGuard account. This link expires in 24 hours and can only be used once:\n\n${verifyUrl}`,
      });
      console.log(
        JSON.stringify({ level: 'info', service: 'api', event: 'verification_email_sent', userId })
      );
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'error',
          service: 'api',
          event: 'verification_email_failed',
          userId,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      );
    }

    return {
      message: 'Verification link dispatched.',
      ...(process.env.NODE_ENV === 'test' ? { debugToken: rawToken } : {}),
    };
  }

  /**
   * Confirms email verification with single-use token
   */
  async confirmEmailVerification(rawToken: string, ipAddress?: string | null) {
    const tokenHash = hashToken(rawToken);

    const tokenRecord = await db.emailVerificationToken.findUnique({
      where: { tokenHash },
    });

    if (!tokenRecord || tokenRecord.usedAt || tokenRecord.expiresAt < new Date()) {
      throw new Error('Email verification token is invalid or has expired');
    }

    await db.$transaction([
      db.user.update({
        where: { id: tokenRecord.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      db.emailVerificationToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: new Date() },
      }),
    ]);

    await recordSecurityEvent('EMAIL_VERIFIED', tokenRecord.userId, ipAddress);

    return { success: true };
  }
}

export const authSecurityService = new AuthSecurityService();
