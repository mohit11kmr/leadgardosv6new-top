import { db } from '@leadguard/database';
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
