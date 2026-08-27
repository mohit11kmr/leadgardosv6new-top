import tls from 'node:tls';
import type { Finding, ScannerContext } from '../types.js';

export interface TlsInspectionResult {
  findings: Finding[];
  isHttps: boolean;
  certificateValid: boolean;
  daysRemaining?: number;
  subject?: string;
  issuer?: string;
  error?: string;
  status: 'VALID' | 'INVALID' | 'EXPIRED' | 'HOSTNAME_MISMATCH' | 'CONNECTION_FAILED' | 'UNSUPPORTED';
}

export async function inspectTls(targetUrl: string, _context?: ScannerContext): Promise<TlsInspectionResult> {
  const findings: Finding[] = [];

  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    return {
      findings,
      isHttps: false,
      certificateValid: false,
      status: 'INVALID',
      error: 'Invalid URL provided',
    };
  }

  if (url.protocol !== 'https:') {
    findings.push({
      ruleId: 'LG-013',
      internalKey: 'TLS_ERROR',
      category: 'SECURITY',
      scope: 'WEBSITE',
      severity: 'CRITICAL',
      title: 'Website is not served over HTTPS',
      description: 'The website address uses unencrypted plain HTTP instead of secure HTTPS.',
      affectedUrl: targetUrl,
      evidence: {
        source: 'protocol',
        observed: url.protocol,
        location: targetUrl,
        why: 'HTTP transmits all visitor data in plaintext, exposing leads, credentials, and browsing activity to eavesdropping.',
        recommendation: 'Install an SSL/TLS certificate and configure an HTTP-to-HTTPS redirect.',
      },
      recommendation: 'Enable HTTPS across the entire website domain.',
      scoreImpact: 30,
      businessImpact: 'Browsers show "Not Secure" warning banners, causing significant drop-offs in customer trust and conversions.',
    });

    return {
      findings,
      isHttps: false,
      certificateValid: false,
      status: 'INVALID',
    };
  }

  const hostname = url.hostname;
  const port = url.port ? Number(url.port) : 443;

  return new Promise<TlsInspectionResult>((resolve) => {
    const timeout = 5000;
    let resolved = false;

    const socket = tls.connect(
      {
        host: hostname,
        port,
        servername: hostname,
        rejectUnauthorized: true, // Strictly enforce verification!
        timeout,
      },
      () => {
        if (resolved) return;
        resolved = true;

        const cert = socket.getPeerCertificate();
        const authorized = socket.authorized;
        const authError = socket.authorizationError;

        socket.end();

        if (!cert || Object.keys(cert).length === 0) {
          findings.push({
            ruleId: 'LG-013',
            internalKey: 'TLS_ERROR',
            category: 'SECURITY',
            scope: 'WEBSITE',
            severity: 'CRITICAL',
            title: 'SSL/TLS certificate not returned by server',
            description: 'The server accepted a TLS connection but did not supply a peer certificate.',
            affectedUrl: targetUrl,
            evidence: {
              source: 'tls_handshake',
              observed: 'No peer certificate presented',
              location: `${hostname}:${port}`,
              why: 'TLS handshake succeeded without a valid public certificate.',
              recommendation: 'Configure an SSL/TLS certificate on the web server.',
            },
            recommendation: 'Install a trusted SSL/TLS certificate.',
            scoreImpact: 30,
          });

          return resolve({
            findings,
            isHttps: true,
            certificateValid: false,
            status: 'INVALID',
            error: 'No peer certificate',
          });
        }

        const validTo = new Date(cert.valid_to);
        const now = new Date();
        const daysRemaining = Math.round((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        const formatCertField = (val: string | string[] | undefined): string | undefined =>
          Array.isArray(val) ? val.join(', ') : val;

        const subjectStr = formatCertField(cert.subject?.CN);
        const issuerStr = formatCertField(cert.issuer?.O ?? cert.issuer?.CN);

        if (!authorized) {
          const reason = authError ? String(authError) : 'Certificate verification failed';
          const isExpired = daysRemaining <= 0;
          const status = isExpired ? 'EXPIRED' : 'INVALID';

          findings.push({
            ruleId: 'LG-013',
            internalKey: 'TLS_ERROR',
            category: 'SECURITY',
            scope: 'WEBSITE',
            severity: 'CRITICAL',
            title: isExpired ? 'SSL/TLS certificate has expired' : 'SSL/TLS certificate verification failed',
            description: `The SSL certificate is invalid: ${reason}`,
            affectedUrl: targetUrl,
            evidence: {
              source: 'tls_handshake',
              observed: `Authorization error: ${reason}`,
              location: `${hostname}:${port}`,
              why: isExpired
                ? `Certificate expired on ${validTo.toISOString()}`
                : `Certificate failed verification: ${reason}`,
              recommendation: 'Renew or replace the SSL certificate with a valid certificate from a trusted Certificate Authority (CA).',
              metadata: {
                subject: subjectStr ?? cert.subjectaltname,
                issuer: issuerStr,
                validTo: cert.valid_to,
                daysRemaining,
              },
            },
            recommendation: 'Renew the SSL/TLS certificate immediately.',
            scoreImpact: 30,
            businessImpact: 'Browsers block visitor access with a full-page security warning.',
          });

          return resolve({
            findings,
            isHttps: true,
            certificateValid: false,
            daysRemaining,
            subject: subjectStr,
            issuer: issuerStr,
            status,
            error: reason,
          });
        }

        // Certificate is valid and authorized
        return resolve({
          findings,
          isHttps: true,
          certificateValid: true,
          daysRemaining,
          subject: subjectStr,
          issuer: issuerStr,
          status: 'VALID',
        });
      }
    );

    socket.on('error', (err) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();

      const errMsg = err.message || 'Connection error';
      findings.push({
        ruleId: 'LG-013',
        internalKey: 'TLS_ERROR',
        category: 'SECURITY',
        scope: 'WEBSITE',
        severity: 'CRITICAL',
        title: 'SSL/TLS connection failed',
        description: `Could not establish a secure TLS connection to ${hostname}:${port}: ${errMsg}`,
        affectedUrl: targetUrl,
        evidence: {
          source: 'tls_socket',
          observed: errMsg,
          location: `${hostname}:${port}`,
          why: 'The TLS handshake failed or the certificate was rejected by the TLS verifier.',
          recommendation: 'Verify port 443 is open and configured with a trusted SSL/TLS certificate.',
          metadata: { errorMessage: errMsg },
        },
        recommendation: 'Ensure your server has a valid SSL certificate and port 443 is accessible.',
        scoreImpact: 30,
        businessImpact: 'Visitors attempting to load HTTPS encounter connection failures or security blocks.',
      });

      return resolve({
        findings,
        isHttps: true,
        certificateValid: false,
        status: 'CONNECTION_FAILED',
        error: errMsg,
      });
    });

    socket.on('timeout', () => {
      if (resolved) return;
      resolved = true;
      socket.destroy();

      return resolve({
        findings,
        isHttps: true,
        certificateValid: false,
        status: 'CONNECTION_FAILED',
        error: 'TLS connection timeout',
      });
    });
  });
}
