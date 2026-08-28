import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  IconDashboard,
  IconWebsites,
  IconAudits,
  IconMonitoring,
  IconAgency,
  IconDeveloper,
  IconShield,
} from '../../components/ui/Icons.js';

export function LandingPageView() {
  const [testUrl, setTestUrl] = useState('');
  const navigate = useNavigate();

  const handleQuickAudit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testUrl.trim()) return;
    navigate(`/register?url=${encodeURIComponent(testUrl.trim())}`);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0b0f19', color: '#f8fafc', fontFamily: 'Inter, -apple-system, sans-serif' }}>
      {/* Top Navigation Bar */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #1e293b',
        padding: '16px 32px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              background: 'linear-gradient(135deg, #2563eb, #38bdf8)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '800',
              color: '#fff',
              fontSize: '15px',
              boxShadow: '0 0 16px rgba(56, 189, 248, 0.35)'
            }}>
              LG
            </div>
            <span style={{ fontSize: '19px', fontWeight: '800', color: '#fff', letterSpacing: '-0.02em' }}>
              LeadGuard <span style={{ color: '#38bdf8' }}>OS</span>
            </span>
          </Link>

          <nav style={{ display: 'flex', gap: '24px', fontSize: '14px', fontWeight: '500' }}>
            <a href="#features" style={{ color: '#94a3b8', textDecoration: 'none', transition: 'color 0.2s' }}>Features</a>
            <a href="#monitoring" style={{ color: '#94a3b8', textDecoration: 'none', transition: 'color 0.2s' }}>Watchdog</a>
            <a href="#agency" style={{ color: '#94a3b8', textDecoration: 'none', transition: 'color 0.2s' }}>Agency Suite</a>
            <a href="#pricing" style={{ color: '#94a3b8', textDecoration: 'none', transition: 'color 0.2s' }}>Pricing</a>
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '14px' }}>
          <Link to="/login" style={{
            color: '#cbd5e1',
            textDecoration: 'none',
            fontWeight: '600',
            padding: '8px 16px',
            borderRadius: '6px',
            transition: 'background 0.2s',
          }}>
            Sign In
          </Link>
          <Link to="/register" style={{
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            color: '#fff',
            textDecoration: 'none',
            fontWeight: '600',
            padding: '8px 20px',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
            transition: 'opacity 0.2s',
          }}>
            Start Free Trial
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '80px 24px 60px', textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 14px',
          borderRadius: '9999px',
          background: 'rgba(56, 189, 248, 0.1)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          color: '#38bdf8',
          fontSize: '13px',
          fontWeight: '600',
          marginBottom: '28px',
        }}>
          <IconShield size={16} />
          <span>LeadGuard OS V6 — Enterprise Diagnostic Engine</span>
        </div>

        <h1 style={{
          fontSize: '56px',
          fontWeight: '900',
          lineHeight: '1.15',
          letterSpacing: '-0.03em',
          maxWidth: '960px',
          margin: '0 auto 24px',
          color: '#ffffff',
        }}>
          Detect Lead Leakage. <br />
          <span style={{
            background: 'linear-gradient(135deg, #38bdf8, #818cf8)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Protect Revenue. Automate Audits.
          </span>
        </h1>

        <p style={{
          fontSize: '19px',
          color: '#94a3b8',
          maxWidth: '740px',
          margin: '0 auto 40px',
          lineHeight: '1.6',
        }}>
          The all-in-one diagnostic intelligence platform for revenue leaders and agencies. Continuously monitor tracking tag health, broken lead forms, click-to-call links, and technical SEO regressions.
        </p>

        {/* Quick URL Scanner Bar */}
        <form onSubmit={handleQuickAudit} style={{
          maxWidth: '620px',
          margin: '0 auto 50px',
          display: 'flex',
          gap: '8px',
          background: '#0f172a',
          padding: '8px',
          borderRadius: '10px',
          border: '1px solid #334155',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)',
        }}>
          <input
            type="url"
            placeholder="Enter your website URL (e.g. https://example.com)"
            value={testUrl}
            onChange={(e) => setTestUrl(e.target.value)}
            required
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              padding: '12px 16px',
              color: '#fff',
              fontSize: '15px',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            style={{
              background: 'linear-gradient(135deg, #2563eb, #38bdf8)',
              color: '#fff',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: '700',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'opacity 0.2s',
            }}
          >
            Scan Free Now
          </button>
        </form>

        {/* Trust Badges */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '32px', color: '#64748b', fontSize: '13px', fontWeight: '500' }}>
          <span>✓ Zero Firebase Dependency</span>
          <span>✓ Sub-second Telemetry</span>
          <span>✓ SSRF-Hardened Scanning</span>
          <span>✓ 100% Deterministic Scopes</span>
        </div>
      </section>

      {/* Live Product Dashboard Preview */}
      <section style={{ maxWidth: '1100px', margin: '0 auto 100px', padding: '0 24px' }}>
        <div style={{
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
        }}>
          <div style={{ background: '#1e293b', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444' }}></div>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#f59e0b' }}></div>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#10b981' }}></div>
            <span style={{ marginLeft: '12px', fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace' }}>
              app.leadguard.io/dashboard — Executive Revenue Intelligence
            </span>
          </div>

          <div style={{ padding: '32px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '32px' }}>
              <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
                <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>Lead Capture Health</div>
                <div style={{ fontSize: '32px', fontWeight: '800', color: '#10b981' }}>94 <span style={{ fontSize: '16px', color: '#64748b' }}>/ 100</span></div>
                <div style={{ fontSize: '12px', color: '#38bdf8', marginTop: '4px' }}>✓ Zero Broken CTAs</div>
              </div>
              <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
                <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>Recovered Revenue Value</div>
                <div style={{ fontSize: '32px', fontWeight: '800', color: '#38bdf8' }}>₹3,42,000</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Across 14 websites</div>
              </div>
              <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
                <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>Watchdog Monitors</div>
                <div style={{ fontSize: '32px', fontWeight: '800', color: '#a855f7' }}>24 / 24</div>
                <div style={{ fontSize: '12px', color: '#10b981', marginTop: '4px' }}>● 100% Up & Healthy</div>
              </div>
              <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
                <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>Pixel & Tag Attribution</div>
                <div style={{ fontSize: '32px', fontWeight: '800', color: '#f59e0b' }}>GA4 + Meta</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Verified Live</div>
              </div>
            </div>

            <div style={{ background: '#131c31', padding: '20px', borderRadius: '12px', border: '1px solid #1e293b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 style={{ margin: 0, fontSize: '16px', color: '#fff' }}>Priority Diagnostic Action Items</h4>
                <span style={{ fontSize: '12px', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '4px 10px', borderRadius: '6px' }}>Automated Fix Guide Ready</span>
              </div>
              <div style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: '1.7' }}>
                • <strong>Security:</strong> Missing <code>Content-Security-Policy</code> header on checkout page (Impact: +3 pts).<br />
                • <strong>Lead:</strong> Add instant <code>tel:</code> click-to-call link for mobile traffic (Est. Value: +12% conversion).<br />
                • <strong>Watchdog:</strong> Next automated hourly multi-page check scheduled in 14 minutes.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Pillar Section */}
      <section id="features" style={{ maxWidth: '1200px', margin: '0 auto 100px', padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '60px' }}>
          <h2 style={{ fontSize: '36px', fontWeight: '800', color: '#fff', marginBottom: '12px' }}>
            Built for Revenue Teams, Developers & Agencies
          </h2>
          <p style={{ fontSize: '17px', color: '#94a3b8', maxWidth: '600px', margin: '0 auto' }}>
            A complete technical infrastructure to safeguard conversions, audit lead funnels, and scale client retainers.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '28px' }}>
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '14px', padding: '32px' }}>
            <div style={{ color: '#38bdf8', marginBottom: '16px' }}><IconAudits size={32} /></div>
            <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#fff', marginBottom: '8px' }}>Full-Stack Audit Engine</h3>
            <p style={{ fontSize: '15px', color: '#94a3b8', lineHeight: '1.6' }}>
              Multi-category diagnostics across Lead forms, GA4/Meta Pixel tags, SEO meta, HTTP security headers, and page speed.
            </p>
          </div>

          <div id="monitoring" style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '14px', padding: '32px' }}>
            <div style={{ color: '#10b981', marginBottom: '16px' }}><IconMonitoring size={32} /></div>
            <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#fff', marginBottom: '8px' }}>Continuous Watchdog</h3>
            <p style={{ fontSize: '15px', color: '#94a3b8', lineHeight: '1.6' }}>
              Automated 5-minute to hourly health check scheduler with baseline diffing, regression tracking, and instant alerts.
            </p>
          </div>

          <div id="agency" style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '14px', padding: '32px' }}>
            <div style={{ color: '#a855f7', marginBottom: '16px' }}><IconAgency size={32} /></div>
            <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#fff', marginBottom: '8px' }}>Agency Growth Suite</h3>
            <p style={{ fontSize: '15px', color: '#94a3b8', lineHeight: '1.6' }}>
              Client workspace delegation, CSV prospect discovery, competitor radar benchmarks, and automated sales pitch generator.
            </p>
          </div>

          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '14px', padding: '32px' }}>
            <div style={{ color: '#f59e0b', marginBottom: '16px' }}><IconDeveloper size={32} /></div>
            <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#fff', marginBottom: '8px' }}>Developer REST API</h3>
            <p style={{ fontSize: '15px', color: '#94a3b8', lineHeight: '1.6' }}>
              Scoped API keys, OpenAPI 3.1 schema, tuple cursor pagination, and transactional outbox webhooks with HMAC-SHA256 signatures.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" style={{ maxWidth: '1100px', margin: '0 auto 120px', padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '60px' }}>
          <h2 style={{ fontSize: '36px', fontWeight: '800', color: '#fff', marginBottom: '12px' }}>
            Transparent, Honest Pricing
          </h2>
          <p style={{ fontSize: '17px', color: '#94a3b8' }}>
            Scale from single website diagnostics to enterprise multi-tenant agency retainers.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px' }}>
          {/* Free Plan */}
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '14px', padding: '32px', display: 'flex', flexDirection: 'column' }}>
            <h4 style={{ fontSize: '18px', fontWeight: '700', color: '#fff', margin: 0 }}>Free Starter</h4>
            <div style={{ fontSize: '36px', fontWeight: '900', color: '#fff', margin: '16px 0 8px' }}>₹0 <span style={{ fontSize: '14px', color: '#64748b' }}>/ mo</span></div>
            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '24px' }}>Essential technical health scan for 1 website.</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', fontSize: '14px', color: '#cbd5e1', lineHeight: '2' }}>
              <li>✓ 1 Active Website</li>
              <li>✓ 3 Diagnostic Scans / mo</li>
              <li>✓ Core Lead & SEO Checks</li>
              <li>✓ Daily Health Monitor</li>
            </ul>
            <Link to="/register" style={{ marginTop: 'auto', textAlign: 'center', background: '#1e293b', color: '#fff', padding: '10px', borderRadius: '8px', textDecoration: 'none', fontWeight: '600', fontSize: '14px' }}>
              Get Started Free
            </Link>
          </div>

          {/* Pro Plan */}
          <div style={{ background: '#131c31', border: '2px solid #2563eb', borderRadius: '14px', padding: '32px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '-12px', right: '20px', background: '#2563eb', color: '#fff', fontSize: '11px', fontWeight: '700', padding: '4px 10px', borderRadius: '9999px', letterSpacing: '0.05em' }}>POPULAR</div>
            <h4 style={{ fontSize: '18px', fontWeight: '700', color: '#fff', margin: 0 }}>Professional</h4>
            <div style={{ fontSize: '36px', fontWeight: '900', color: '#fff', margin: '16px 0 8px' }}>₹2,900 <span style={{ fontSize: '14px', color: '#64748b' }}>/ mo</span></div>
            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '24px' }}>For growing marketing teams & businesses.</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', fontSize: '14px', color: '#cbd5e1', lineHeight: '2' }}>
              <li>✓ 5 Active Websites</li>
              <li>✓ Unlimited Diagnostic Scans</li>
              <li>✓ 15-Minute Watchdog Checks</li>
              <li>✓ PDF Deliverables & Shares</li>
              <li>✓ Priority Email Alerts</li>
            </ul>
            <Link to="/register" style={{ marginTop: 'auto', textAlign: 'center', background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#fff', padding: '10px', borderRadius: '8px', textDecoration: 'none', fontWeight: '700', fontSize: '14px', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)' }}>
              Start Pro Trial
            </Link>
          </div>

          {/* Agency Plan */}
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '14px', padding: '32px', display: 'flex', flexDirection: 'column' }}>
            <h4 style={{ fontSize: '18px', fontWeight: '700', color: '#fff', margin: 0 }}>Agency</h4>
            <div style={{ fontSize: '36px', fontWeight: '900', color: '#fff', margin: '16px 0 8px' }}>₹7,900 <span style={{ fontSize: '14px', color: '#64748b' }}>/ mo</span></div>
            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '24px' }}>Complete growth toolkit for marketing agencies.</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', fontSize: '14px', color: '#cbd5e1', lineHeight: '2' }}>
              <li>✓ 25 Client Workspaces</li>
              <li>✓ Whitelabel Reports & Branding</li>
              <li>✓ Prospect Radar & CSV Ingestion</li>
              <li>✓ AI Pitch Generation Engine</li>
              <li>✓ Embeddable Lead Capture Widget</li>
            </ul>
            <Link to="/register" style={{ marginTop: 'auto', textAlign: 'center', background: '#1e293b', color: '#fff', padding: '10px', borderRadius: '8px', textDecoration: 'none', fontWeight: '600', fontSize: '14px' }}>
              Start Agency Trial
            </Link>
          </div>

          {/* Enterprise Plan */}
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '14px', padding: '32px', display: 'flex', flexDirection: 'column' }}>
            <h4 style={{ fontSize: '18px', fontWeight: '700', color: '#fff', margin: 0 }}>Enterprise</h4>
            <div style={{ fontSize: '36px', fontWeight: '900', color: '#fff', margin: '16px 0 8px' }}>Custom</div>
            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '24px' }}>High-volume infrastructure with custom SLA.</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', fontSize: '14px', color: '#cbd5e1', lineHeight: '2' }}>
              <li>✓ Unlimited Workspaces & Sites</li>
              <li>✓ Full Developer REST API Access</li>
              <li>✓ Outbox Webhook Integrations</li>
              <li>✓ Dedicated Enterprise Support</li>
            </ul>
            <Link to="/register" style={{ marginTop: 'auto', textAlign: 'center', background: '#1e293b', color: '#fff', padding: '10px', borderRadius: '8px', textDecoration: 'none', fontWeight: '600', fontSize: '14px' }}>
              Contact Sales
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #1e293b', padding: '40px 32px', background: '#090d16' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px', fontSize: '14px', color: '#64748b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontWeight: '700', color: '#fff' }}>LeadGuard OS V6</span>
            <span>— Diagnostic Intelligence Platform</span>
          </div>
          <div style={{ display: 'flex', gap: '20px' }}>
            <Link to="/privacy" style={{ color: '#94a3b8', textDecoration: 'none' }}>Privacy Policy</Link>
            <Link to="/terms" style={{ color: '#94a3b8', textDecoration: 'none' }}>Terms of Service</Link>
            <Link to="/cookies" style={{ color: '#94a3b8', textDecoration: 'none' }}>Cookie Policy</Link>
            <Link to="/refund" style={{ color: '#94a3b8', textDecoration: 'none' }}>Refunds</Link>
            <Link to="/login" style={{ color: '#38bdf8', textDecoration: 'none' }}>Customer Login</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
