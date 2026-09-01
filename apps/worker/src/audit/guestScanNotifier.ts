import { config } from '@leadguard/config';
import { emailProvider } from '../monitoring/notifications/emailProvider.js';

/**
 * Emails a guest (unauthenticated free-scan) visitor their report link once
 * the scan completes. Only ever called when Audit.guestEmail was captured
 * at scan-creation time (public/free-scan) — best-effort, non-fatal: a
 * delivery failure must never fail the audit itself.
 */
export async function sendGuestScanReadyEmail(params: {
  email: string;
  auditId: string;
  domain: string;
  overallScore: number | null;
  totalFindings: number;
}): Promise<void> {
  const { email, auditId, domain, overallScore, totalFindings } = params;
  const reportUrl = `${config.APP_URL}/scan/${auditId}`;

  const scoreText = overallScore !== null ? `${overallScore}/100` : 'N/A';
  const findingsText =
    totalFindings > 0
      ? `We found ${totalFindings} issue${totalFindings === 1 ? '' : 's'} that may be costing ${domain} leads.`
      : `No major issues found — nice work keeping ${domain} healthy.`;

  await emailProvider.sendEmail({
    to: email,
    subject: `Your free scan for ${domain} is ready (score: ${scoreText})`,
    body: [
      `Your LeadGuard scan for ${domain} is complete.`,
      '',
      findingsText,
      '',
      `View your full report: ${reportUrl}`,
      '',
      'Sign up for a free account to unlock every finding, get fix guidance, and set up continuous monitoring.',
    ].join('\n'),
    metadata: { auditId, domain, kind: 'guest_scan_ready' },
  });
}
