import React from 'react';
import { Link } from 'react-router-dom';

function LegalLayout({ title, subtitle, lastUpdated, children }: { title: string; subtitle: string; lastUpdated: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#0b0f19', color: '#e2e8f0', fontFamily: 'Inter, -apple-system, sans-serif' }}>
      <header style={{ borderBottom: '1px solid #1e293b', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0f172a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '28px', height: '28px', background: '#2563eb', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#fff', fontSize: '14px' }}>LG</div>
            <span style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>LeadGuard OS</span>
          </Link>
        </div>
        <div style={{ display: 'flex', gap: '20px', fontSize: '14px' }}>
          <Link to="/login" style={{ color: '#94a3b8', textDecoration: 'none' }}>Sign In</Link>
          <Link to="/register" style={{ color: '#38bdf8', textDecoration: 'none', fontWeight: '600' }}>Get Started</Link>
        </div>
      </header>

      <main style={{ maxWidth: '840px', margin: '0 auto', padding: '60px 24px 100px' }}>
        <div style={{ marginBottom: '40px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '800', color: '#fff', marginBottom: '8px', letterSpacing: '-0.02em' }}>{title}</h1>
          <p style={{ fontSize: '16px', color: '#94a3b8', margin: 0 }}>{subtitle}</p>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '12px' }}>Last Updated: {lastUpdated}</p>
        </div>

        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '40px', lineHeight: '1.7', fontSize: '15px', color: '#cbd5e1' }}>
          {children}
        </div>

        <footer style={{ marginTop: '60px', paddingTop: '30px', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: '#64748b' }}>
          <div>© {new Date().getFullYear()} LeadGuard OS. All rights reserved.</div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <Link to="/privacy" style={{ color: '#64748b', textDecoration: 'none' }}>Privacy</Link>
            <Link to="/terms" style={{ color: '#64748b', textDecoration: 'none' }}>Terms</Link>
            <Link to="/cookies" style={{ color: '#64748b', textDecoration: 'none' }}>Cookies</Link>
            <Link to="/refund" style={{ color: '#64748b', textDecoration: 'none' }}>Refunds</Link>
          </div>
        </footer>
      </main>
    </div>
  );
}

export function PrivacyPolicyView() {
  return (
    <LegalLayout title="Privacy Policy" subtitle="How LeadGuard OS collects, protects, and handles your diagnostic data." lastUpdated="August 28, 2026">
      <h3 style={{ color: '#fff', marginTop: 0 }}>1. Information We Collect</h3>
      <p>LeadGuard OS collects diagnostic information required to inspect websites, identify lead leakage, and verify marketing tracking tags. This includes:</p>
      <ul>
        <li>Account Information: Name, work email address, and authentication credentials.</li>
        <li>Website Diagnostics: URLs submitted for audit, public HTML metadata, response headers, and performance telemetry.</li>
        <li>Billing Details: Payment transaction IDs and subscription statuses processed securely via authorized payment gateways (e.g. Razorpay). We do not store raw card numbers.</li>
      </ul>

      <h3 style={{ color: '#fff', marginTop: '32px' }}>2. How We Use Information</h3>
      <p>Diagnostic data is used exclusively to generate technical reports, power continuous Watchdog monitoring, provide security alerts, and improve automated scanning precision.</p>

      <h3 style={{ color: '#fff', marginTop: '32px' }}>3. Data Isolation & Multi-Tenancy</h3>
      <p>Every organization operates within an isolated tenant boundary. Diagnostic findings, report snapshots, and webhook endpoints are protected by server-side authorization gates.</p>

      <h3 style={{ color: '#fff', marginTop: '32px' }}>4. Security & Retention</h3>
      <p>We enforce TLS encryption in transit and AES-256 / scrypt security at rest. Raw API telemetry is retained for 90 days before automated lifecycle purging.</p>
    </LegalLayout>
  );
}

export function TermsOfServiceView() {
  return (
    <LegalLayout title="Terms of Service" subtitle="Agreement governing the use of LeadGuard OS diagnostic and monitoring services." lastUpdated="August 28, 2026">
      <h3 style={{ color: '#fff', marginTop: 0 }}>1. Acceptance of Terms</h3>
      <p>By registering for or utilizing LeadGuard OS, you agree to be bound by these Terms of Service. If you are using the service on behalf of an organization, you represent that you have authority to bind that entity.</p>

      <h3 style={{ color: '#fff', marginTop: '32px' }}>2. Permitted Diagnostic Usage</h3>
      <p>You agree to only perform diagnostic audits and monitoring on websites, web applications, and domains that you own or have explicit authorization to inspect. Submitting unauthorized targets or attempting SSRF exploitation is strictly prohibited.</p>

      <h3 style={{ color: '#fff', marginTop: '32px' }}>3. Subscriptions & Rate Limits</h3>
      <p>Services are provided according to your plan quota (e.g., Free, Pro, Agency, Enterprise). API access is governed by sliding-window rate limits and concurrency controls.</p>

      <h3 style={{ color: '#fff', marginTop: '32px' }}>4. Limitation of Liability</h3>
      <p>LeadGuard OS provides automated diagnostic intelligence on an "as is" and "as available" basis without warranties of uninterrupted uptime or error-free crawling of dynamic third-party scripts.</p>
    </LegalLayout>
  );
}

export function CookiePolicyView() {
  return (
    <LegalLayout title="Cookie Policy" subtitle="Understanding session authentication and security cookies." lastUpdated="August 28, 2026">
      <h3 style={{ color: '#fff', marginTop: 0 }}>1. Essential Security Cookies</h3>
      <p>LeadGuard OS uses strictly necessary cookies to provide secure authentication and session persistence:</p>
      <ul>
        <li><strong>refreshToken</strong>: A secure, HttpOnly, SameSite=Strict cookie used solely for token rotation and authenticated API access. It is inaccessible to client-side JavaScript.</li>
        <li><strong>__Host-session</strong>: Used to protect session identity across multi-tenant workspaces.</li>
      </ul>

      <h3 style={{ color: '#fff', marginTop: '32px' }}>2. No Third-Party Advertising Cookies</h3>
      <p>We do not deploy third-party advertising trackers or behavioral profiling cookies on our authenticated platform.</p>
    </LegalLayout>
  );
}

export function RefundPolicyView() {
  return (
    <LegalLayout title="Refund Policy" subtitle="Commercial guidelines for subscriptions and one-time diagnostic packs." lastUpdated="August 28, 2026">
      <h3 style={{ color: '#fff', marginTop: 0 }}>1. Subscription Cancellations</h3>
      <p>You may cancel your monthly or annual subscription at any time via the Billing Dashboard. Upon cancellation, your access remains active until the conclusion of the current billing cycle.</p>

      <h3 style={{ color: '#fff', marginTop: '32px' }}>2. Express Fix & One-Time Diagnostic Credits</h3>
      <p>One-time products (such as Express Fix verification credits) are eligible for a full refund within 7 days of purchase if no diagnostic scan was successfully executed using those credits.</p>

      <h3 style={{ color: '#fff', marginTop: '32px' }}>3. Contact & Support</h3>
      <p>For refund inquiries or billing disputes, contact support through your organization dashboard or email billing@leadguard.io.</p>
    </LegalLayout>
  );
}
