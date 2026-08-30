import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient, ApiError } from '../../api/client.js';
import { getPlans, type Plan } from '../../api/billing.js';
import { Badge } from '../../components/ui/Badge.js';
import { ScoreRing } from '../../components/ui/ScoreRing.js';
import {
  IconShield,
  IconSearch,
  IconAlertCircle,
  IconAlertTriangle,
  IconCheckCircle,
  IconInfo,
  IconTrendingUp,
  IconTarget,
  IconLock,
  IconExternalLink,
  IconAudits,
  IconMonitoring,
  IconAgency,
  IconDeveloper,
  IconArrowRight,
  IconCreditCard,
  IconMail,
  IconPhone,
  IconGlobe,
  IconClock,
  IconRefresh,
} from '../../components/ui/Icons.js';

// Fallback plans adhering to canonical project configuration if API is unavailable
const FALLBACK_PLANS: Plan[] = [
  {
    id: 'plan_free',
    code: 'FREE',
    name: 'Starter Tier',
    description: 'Essential lead conversion and diagnostics for individual founders.',
    priceInPaise: 0,
    currency: 'INR',
    billingInterval: 'MONTHLY',
    entitlements: {
      auditsPerMonth: 3,
      websites: 1,
      monitoring: false,
      apiAccess: false,
      whiteLabel: false,
      reports: 3,
      prospectLimit: 0,
    },
  },
  {
    id: 'plan_pro',
    code: 'PRO',
    name: 'Growth & Security Pro',
    description: 'High-frequency diagnostic scans and conversion leak detection for growing teams.',
    priceInPaise: 499900,
    currency: 'INR',
    billingInterval: 'MONTHLY',
    entitlements: {
      auditsPerMonth: 50,
      websites: 5,
      monitoring: true,
      apiAccess: true,
      whiteLabel: false,
      reports: 50,
      prospectLimit: 100,
    },
  },
  {
    id: 'plan_agency',
    code: 'AGENCY',
    name: 'Agency & Consultant Suite',
    description: 'Multi-client audits, client presentation reports, white-labeling, and audit queues.',
    priceInPaise: 1499900,
    currency: 'INR',
    billingInterval: 'MONTHLY',
    entitlements: {
      auditsPerMonth: 500,
      websites: 50,
      monitoring: true,
      apiAccess: true,
      whiteLabel: true,
      reports: 500,
      prospectLimit: 1000,
    },
  },
];

export function LandingPageView() {
  const [testUrl, setTestUrl] = useState('');
  const [bottomUrl, setBottomUrl] = useState('');
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [bottomSubmitState, setBottomSubmitState] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [bottomErrorMessage, setBottomErrorMessage] = useState('');
  const [plans, setPlans] = useState<Plan[]>(FALLBACK_PLANS);
  const navigate = useNavigate();

  // Interactive Revenue Opportunity Calculator state
  const [monthlyVisitors, setMonthlyVisitors] = useState(15000);
  const [conversionRate, setConversionRate] = useState(2.5);
  const [leadValue, setLeadValue] = useState(3500);
  const [detectedRisk, setDetectedRisk] = useState(18); // Assumed 18% leak risk from critical defects

  // Fetch billing plans on mount
  useEffect(() => {
    let isMounted = true;
    async function loadPlans() {
      try {
        const result = await getPlans();
        if (isMounted && Array.isArray(result) && result.length > 0) {
          setPlans(result);
        }
      } catch {
        // Retain fallback plans gracefully
      }
    }
    loadPlans();
    return () => {
      isMounted = false;
    };
  }, []);

  // Handler for primary scanner invocation
  const handleQuickAudit = async (e: React.FormEvent, urlToScan: string, isBottom = false) => {
    e.preventDefault();
    const cleanUrl = urlToScan.trim();
    if (!cleanUrl) return;

    if (isBottom) {
      setBottomSubmitState('submitting');
      setBottomErrorMessage('');
    } else {
      setSubmitState('submitting');
      setErrorMessage('');
    }

    try {
      const result = await apiClient<{ scanId: string; status: string }>('/public/free-scan', {
        method: 'POST',
        body: JSON.stringify({ url: cleanUrl }),
      });

      if (result?.scanId) {
        navigate(`/scan/${result.scanId}`);
      } else {
        const errorMsg = 'Failed to start scan. Please check your URL and try again.';
        if (isBottom) {
          setBottomSubmitState('error');
          setBottomErrorMessage(errorMsg);
        } else {
          setSubmitState('error');
          setErrorMessage(errorMsg);
        }
      }
    } catch (err) {
      let errorMsg = 'Unable to scan this domain. Please ensure it is a valid, publicly reachable HTTP/HTTPS URL.';

      if (err instanceof ApiError) {
        if (err.statusCode === 429) {
          errorMsg = 'Public rate limit reached (3 scans/hour per IP). Please wait or create a free account.';
        } else if (err.message) {
          errorMsg = err.message;
        }
      }
      
      if (isBottom) {
        setBottomSubmitState('error');
        setBottomErrorMessage(errorMsg);
      } else {
        setSubmitState('error');
        setErrorMessage(errorMsg);
      }
    }
  };

  // Calculator computations
  const totalMonthlyLeads = Math.round(monthlyVisitors * (conversionRate / 100));
  const estimatedLostLeads = Math.max(1, Math.round(totalMonthlyLeads * (detectedRisk / 100)));
  const estimatedMonthlyLoss = estimatedLostLeads * leadValue;

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)', fontFamily: 'var(--font-family)', overflowX: 'hidden' }}>
      {/* 1. TOP NAVIGATION */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(9, 13, 22, 0.88)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border-color)',
          padding: '14px 24px',
        }}
      >
        <div style={{ maxWidth: '1240px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
            <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }} aria-label="LeadGuard OS Home">
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  background: 'linear-gradient(135deg, var(--primary), #60a5fa)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '800',
                  color: '#fff',
                  fontSize: '15px',
                  boxShadow: '0 0 16px rgba(59, 130, 246, 0.35)',
                }}
              >
                LG
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  LeadGuard <span style={{ color: 'var(--primary)' }}>OS</span>
                </span>
                <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', background: 'var(--bg-surface-elevated)', padding: '2px 6px', borderRadius: '4px' }}>
                  V6
                </span>
              </div>
            </Link>

            <nav style={{ display: 'flex', gap: '20px', fontSize: '13.5px', fontWeight: '500' }} aria-label="Primary Navigation">
              <button type="button" onClick={() => scrollToSection('how-it-works')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 'inherit', padding: 0 }}>
                How It Works
              </button>
              <button type="button" onClick={() => scrollToSection('pillars')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 'inherit', padding: 0 }}>
                4 Pillars
              </button>
              <button type="button" onClick={() => scrollToSection('features')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 'inherit', padding: 0 }}>
                What We Find
              </button>
              <button type="button" onClick={() => scrollToSection('calculator')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 'inherit', padding: 0 }}>
                Revenue Calculator
              </button>
              <button type="button" onClick={() => scrollToSection('watchdog')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 'inherit', padding: 0 }}>
                Watchdog
              </button>
              <button type="button" onClick={() => scrollToSection('agency')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 'inherit', padding: 0 }}>
                Agency Suite
              </button>
              <button type="button" onClick={() => scrollToSection('pricing')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 'inherit', padding: 0 }}>
                Pricing
              </button>
            </nav>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13.5px' }}>
            <Link
              to="/login"
              style={{
                color: 'var(--text-primary)',
                textDecoration: 'none',
                fontWeight: '600',
                padding: '8px 14px',
                borderRadius: 'var(--radius-sm)',
                transition: 'background var(--transition-fast)',
              }}
            >
              Sign In
            </Link>
            <button
              type="button"
              onClick={() => {
                const input = document.getElementById('hero-url-input');
                if (input) {
                  input.focus();
                  input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }}
              style={{
                background: 'var(--primary)',
                color: '#fff',
                border: 'none',
                fontWeight: '600',
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                transition: 'background var(--transition-fast)',
              }}
            >
              Run Free Scan
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* 2. HERO SECTION */}
        <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '72px 20px 48px', textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--primary-light)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              color: 'var(--primary)',
              fontSize: '12.5px',
              fontWeight: '600',
              marginBottom: '24px',
              letterSpacing: '0.02em',
            }}
          >
            <IconShield size={15} />
            <span>LeadGuard OS V6 — Technical Diagnostic Platform</span>
          </div>

          <h1
            style={{
              fontSize: 'clamp(32px, 5.5vw, 54px)',
              fontWeight: '800',
              lineHeight: '1.12',
              letterSpacing: '-0.03em',
              maxWidth: '920px',
              margin: '0 auto 20px',
              color: 'var(--text-primary)',
            }}
          >
            Find the lead leaks costing your business customers.
          </h1>

          <p
            style={{
              fontSize: 'clamp(16px, 2.5vw, 20px)',
              color: 'var(--text-secondary)',
              maxWidth: '720px',
              margin: '0 auto 12px',
              lineHeight: '1.5',
              fontWeight: '500',
            }}
          >
            Your website may look fine. Your lead flow may not.
          </p>

          <p
            style={{
              fontSize: '15px',
              color: 'var(--text-muted)',
              maxWidth: '680px',
              margin: '0 auto 36px',
              lineHeight: '1.6',
            }}
          >
            LeadGuard checks the critical website paths that turn visitors into leads: WhatsApp click-to-chat, phone links, contact forms, conversion tracking, SEO hygiene, and security headers.
          </p>

          {/* Primary Quick URL Scanner Bar */}
          <form
            onSubmit={(e) => handleQuickAudit(e, testUrl, false)}
            style={{
              maxWidth: '640px',
              margin: '0 auto 16px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              background: 'var(--bg-surface)',
              padding: '6px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <label htmlFor="hero-url-input" style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>
              Website URL to scan
            </label>
            <input
              id="hero-url-input"
              type="url"
              placeholder="https://yourwebsite.com"
              value={testUrl}
              onChange={(e) => setTestUrl(e.target.value)}
              required
              disabled={submitState === 'submitting'}
              style={{
                flex: '1 1 280px',
                minWidth: '220px',
                background: 'transparent',
                border: 'none',
                padding: '12px 16px',
                color: 'var(--text-primary)',
                fontSize: '15px',
                outline: 'none',
                fontFamily: 'var(--font-family)',
              }}
            />
            <button
              type="submit"
              disabled={submitState === 'submitting'}
              style={{
                flex: '0 0 auto',
                background: submitState === 'submitting' ? 'var(--bg-surface-hover)' : 'var(--primary)',
                color: '#fff',
                border: 'none',
                padding: '12px 24px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '15px',
                fontWeight: '700',
                cursor: submitState === 'submitting' ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                minHeight: '44px',
                transition: 'background var(--transition-fast)',
              }}
            >
              {submitState === 'submitting' ? (
                <>
                  <div className="btnSpinner" style={{ width: '16px', height: '16px' }} />
                  <span>Analyzing website…</span>
                </>
              ) : (
                <>
                  <span>Scan My Website</span>
                  <IconArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {submitState === 'error' && (
            <div
              style={{
                maxWidth: '640px',
                margin: '0 auto 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 16px',
                background: 'var(--severity-critical-bg)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 'var(--radius-sm)',
                color: '#fca5a5',
                fontSize: '13.5px',
                textAlign: 'left',
              }}
              role="alert"
            >
              <IconAlertCircle size={18} color="var(--danger)" style={{ flexShrink: 0 }} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Factual Trust & Micro-Proof */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              flexWrap: 'wrap',
              gap: '18px 28px',
              color: 'var(--text-muted)',
              fontSize: '12.5px',
              fontWeight: '500',
              marginTop: '20px',
            }}
          >
            <span>✓ Free Diagnostic</span>
            <span>✓ SSRF-Hardened Scanning</span>
            <span>✓ No Credit Card Required</span>
            <span>✓ 4 Scored Pillars</span>
            <span>✓ Evidence-Based Code Findings</span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-subtle)', marginTop: '8px' }}>
            Deterministic multi-page crawl • Results in ~30 seconds
          </p>
        </section>

        {/* 3. EXPLICITLY LABELED SAMPLE DIAGNOSTIC DEMO */}
        <section style={{ maxWidth: '1100px', margin: '0 auto 80px', padding: '0 20px' }}>
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            {/* Demo Header Bar with Explicit Sample Label */}
            <div
              style={{
                background: 'var(--bg-surface-elevated)',
                padding: '12px 20px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }} />
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b' }} />
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }} />
                <span style={{ marginLeft: '10px', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  diagnostic.leadguard.io/sample-report
                </span>
              </div>

              {/* Mandatory Visible Sample Label */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '11.5px',
                  fontWeight: '700',
                  color: '#fbbf24',
                  letterSpacing: '0.03em',
                  textTransform: 'uppercase',
                }}
              >
                <span>Sample Diagnostic Report — Illustrative Example — Not Live Customer Data</span>
              </div>
            </div>

            {/* Demo Content */}
            <div style={{ padding: '28px 24px' }}>
              {/* Top Overview: Score Ring + 4 Pillars Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', alignItems: 'center', marginBottom: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', background: 'var(--bg-app)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <ScoreRing score={78} label="LEAD HEALTH" size="lg" />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <strong style={{ fontSize: '16px', color: 'var(--text-primary)' }}>Overall Health Score</strong>
                      <Badge variant="warning">Needs Attention</Badge>
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5' }}>
                      Calculated using 35% Lead Capture, 25% Ads, 20% SEO, and 20% Security weights.
                    </p>
                  </div>
                </div>

                <div style={{ background: 'var(--bg-app)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.04em', display: 'block', marginBottom: '4px' }}>
                    Estimated Opportunity Loss (Illustrative)
                  </span>
                  <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--danger)', letterSpacing: '-0.02em', marginBottom: '4px' }}>
                    ~₹45,000 <span style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: '500' }}>/ month at risk</span>
                  </div>
                  <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: 0 }}>
                    Derived from 3 detected conversion blockers on mobile traffic.
                  </p>
                </div>
              </div>

              {/* 4 Pillars Bar Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '28px' }}>
                <div style={{ background: 'var(--bg-app)', padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>Lead Capture</span>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--warning)' }}>65 / 100</span>
                  </div>
                  <div style={{ height: '5px', background: 'var(--bg-surface-elevated)', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div style={{ width: '65%', height: '100%', background: 'var(--warning)', borderRadius: '9999px' }} />
                  </div>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>35% Weight • 2 Leaks Found</span>
                </div>

                <div style={{ background: 'var(--bg-app)', padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>Advertising</span>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--warning)' }}>75 / 100</span>
                  </div>
                  <div style={{ height: '5px', background: 'var(--bg-surface-elevated)', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div style={{ width: '75%', height: '100%', background: 'var(--warning)', borderRadius: '9999px' }} />
                  </div>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>25% Weight • Missing Meta Pixel</span>
                </div>

                <div style={{ background: 'var(--bg-app)', padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>SEO Hygiene</span>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--success)' }}>90 / 100</span>
                  </div>
                  <div style={{ height: '5px', background: 'var(--bg-surface-elevated)', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div style={{ width: '90%', height: '100%', background: 'var(--success)', borderRadius: '9999px' }} />
                  </div>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>20% Weight • Viewport Valid</span>
                </div>

                <div style={{ background: 'var(--bg-app)', padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>Security & TLS</span>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--success)' }}>85 / 100</span>
                  </div>
                  <div style={{ height: '5px', background: 'var(--bg-surface-elevated)', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div style={{ width: '85%', height: '100%', background: 'var(--success)', borderRadius: '9999px' }} />
                  </div>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>20% Weight • Valid Certificate</span>
                </div>
              </div>

              {/* Sample Diagnostic Findings */}
              <div style={{ background: 'var(--bg-app)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <strong style={{ fontSize: '14px', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Prioritized Diagnostic Findings (Sample)
                  </strong>
                  <Badge variant="critical">3 Action Items</Badge>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', background: 'var(--severity-critical-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                    <IconAlertCircle size={16} color="var(--danger)" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                        <strong style={{ color: 'var(--text-primary)' }}>Broken WhatsApp Click-to-Chat Action</strong>
                        <span style={{ color: 'var(--danger)', fontWeight: '700', fontSize: '12px' }}>-25 pts</span>
                      </div>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Target link <code>whatsapp://send?phone=9876543210</code> is missing the mandatory <code>+91</code> international prefix, causing silent tap failures on mobile.
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', background: 'var(--severity-high-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                    <IconAlertTriangle size={16} color="var(--warning)" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                        <strong style={{ color: 'var(--text-primary)' }}>Missing Meta Attribution Pixel on Contact Page</strong>
                        <span style={{ color: 'var(--warning)', fontWeight: '700', fontSize: '12px' }}>-15 pts</span>
                      </div>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Ad traffic arriving from Meta campaigns is not triggering conversion events. Ad spend is operating without attribution feedback.
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                    <IconInfo size={16} color="var(--primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                        <strong style={{ color: 'var(--text-primary)' }}>Telephone Number Rendered As Unlinked Plain Text</strong>
                        <span style={{ color: 'var(--text-muted)', fontWeight: '700', fontSize: '12px' }}>-10 pts</span>
                      </div>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Header phone number lacks <code>tel:+91...</code> protocol. Mobile visitors cannot tap to initiate calls.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4. HOW IT WORKS (3-STEP PRODUCT EXPLANATION) */}
        <section id="how-it-works" style={{ maxWidth: '1100px', margin: '0 auto 90px', padding: '0 20px' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '8px' }}>
              Systematic Diagnostic Process
            </span>
            <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 36px)', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
              From URL to Actionable Fixes in 30 Seconds
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '28px' }}>
              <div style={{ width: '40px', height: '40px', background: 'var(--primary-light)', borderRadius: 'var(--radius-sm)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '18px', marginBottom: '16px' }}>
                1
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>Scan</h3>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
                Enter your website URL. LeadGuard initiates an SSRF-hardened crawl inspecting HTML DOM elements, form targets, script tags, HTTP headers, and mobile actions.
              </p>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '28px' }}>
              <div style={{ width: '40px', height: '40px', background: 'rgba(245, 158, 11, 0.12)', borderRadius: 'var(--radius-sm)', color: 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '18px', marginBottom: '16px' }}>
                2
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>Understand</h3>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
                Receive an authoritative 0–100 Lead Health Score, 4-pillar category breakdowns, quantified opportunity risk estimates, and exact code-level evidence for each defect.
              </p>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '28px' }}>
              <div style={{ width: '40px', height: '40px', background: 'var(--success-light)', borderRadius: 'var(--radius-sm)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '18px', marginBottom: '16px' }}>
                3
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>Fix & Monitor</h3>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
                Apply exact recommended code remedies or enable 24/7 Continuous Watchdog to detect regressions after every theme update or deployment before leads are lost.
              </p>
            </div>
          </div>
        </section>

        {/* 5. THE FOUR SCORED PILLARS */}
        <section id="pillars" style={{ maxWidth: '1100px', margin: '0 auto 90px', padding: '0 20px' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '8px' }}>
              Deterministic Scoring Engine
            </span>
            <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 36px)', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '12px' }}>
              The 4 Pillars of Website Lead Health
            </h2>
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)', maxWidth: '640px', margin: '0 auto' }}>
              LeadGuard evaluates technical health across four mathematically weighted diagnostic pillars that govern conversion reliability.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
            {/* Pillar 1 */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', fontSize: '13px' }}>
                  <IconTarget size={18} /> Pillar 1
                </span>
                <Badge variant="indigo">35% Weight</Badge>
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>Lead Capture</h3>
              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '0 0 12px' }}>
                Validates inbound contact mechanisms: functional form actions, RFC-3966 phone links (`tel:`), and formatted WhatsApp click-to-chat URIs.
              </p>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                Checks: Form POSTs • wa.me syntax • tel: protocols
              </span>
            </div>

            {/* Pillar 2 */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ color: 'var(--purple)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', fontSize: '13px' }}>
                  <IconTrendingUp size={18} /> Pillar 2
                </span>
                <Badge variant="purple">25% Weight</Badge>
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>Advertising & Attribution</h3>
              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '0 0 12px' }}>
                Audits conversion tracking infrastructure: Meta Pixel initialization, Google Tag Manager container health, GA4 pageviews, and UTM preservation.
              </p>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                Checks: Meta Pixel • GA4 / GTM tags • Attribution leaks
              </span>
            </div>

            {/* Pillar 3 */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', fontSize: '13px' }}>
                  <IconSearch size={18} /> Pillar 3
                </span>
                <Badge variant="emerald">20% Weight</Badge>
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>SEO & Search Hygiene</h3>
              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '0 0 12px' }}>
                Ensures inbound organic visibility: responsive viewport tags, canonical domain alignment, meta descriptions, and robots indexation directives.
              </p>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                Checks: Mobile viewport • Canonicals • Robots meta
              </span>
            </div>

            {/* Pillar 4 */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', fontSize: '13px' }}>
                  <IconLock size={18} /> Pillar 4
                </span>
                <Badge variant="warning">20% Weight</Badge>
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>Security & TLS</h3>
              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '0 0 12px' }}>
                Protects user trust and data transfer: valid HTTPS certificates, Strict-Transport-Security (HSTS), Content-Security-Policy (CSP), and clickjacking defense.
              </p>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                Checks: TLS certificate • HSTS • CSP • Mixed content
              </span>
            </div>
          </div>
        </section>

        {/* 6. WHAT LEADGUARD FINDS (DIAGNOSTIC SHOWCASE) */}
        <section id="features" style={{ maxWidth: '1100px', margin: '0 auto 90px', padding: '0 20px' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '8px' }}>
              Real Diagnostic Scenarios
            </span>
            <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 36px)', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '12px' }}>
              The Silent Technical Flaws That Drain Conversions
            </h2>
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)', maxWidth: '640px', margin: '0 auto' }}>
              Examples of real technical defects LeadGuard detects across commercial websites.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', background: 'var(--severity-critical-bg)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IconAlertCircle size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Malformed WhatsApp Links</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Lead Capture Leak</span>
                </div>
              </div>
              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
                Phone numbers formatted with leading zeros (e.g. `09876543210`) or duplicate country prefixes (`9191...`) fail silently on mobile WhatsApp clients, losing direct inquiries.
              </p>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', background: 'var(--severity-high-bg)', color: 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IconPhone size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Unlinked Phone Numbers</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Mobile Conversion Friction</span>
                </div>
              </div>
              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
                Phone numbers rendered as plain non-clickable text force mobile visitors to manually memorize and copy digits, creating high drop-off before call initiation.
              </p>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IconMail size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Dead Form Post Endpoints</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Contact Form Ingestion</span>
                </div>
              </div>
              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
                Forms submitting to missing backend handlers, cross-origin blocked action URLs, or without input validation attributes lead to lost prospect form submissions.
              </p>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', background: 'var(--purple-light)', color: 'var(--purple)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IconTrendingUp size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Missing Attribution Pixels</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Advertising Spend Waste</span>
                </div>
              </div>
              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
                Paid traffic landing on pages without initialized Meta Pixel or GA4 tags prevents ad network algorithms from optimizing for real lead acquisition events.
              </p>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', background: 'var(--success-light)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IconSearch size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Mobile Viewport Misconfiguration</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>SEO & Mobile Usability</span>
                </div>
              </div>
              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
                Missing or restrictive viewport tags trigger search engine mobile usability penalties and cause broken responsive layouts on modern smartphone viewports.
              </p>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', background: 'var(--warning-light)', color: 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IconLock size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Insecure Transport & Missing CSP</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Security & Trust Loss</span>
                </div>
              </div>
              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
                Lack of HSTS and Content-Security-Policy headers leaves lead forms exposed to network interception and triggers browser security warnings that scare off prospects.
              </p>
            </div>
          </div>
        </section>

        {/* 7. REVENUE INTELLIGENCE (INTERACTIVE CALCULATOR) */}
        <section id="calculator" style={{ maxWidth: '1100px', margin: '0 auto 90px', padding: '0 20px' }}>
          <div
            style={{
              background: 'linear-gradient(180deg, var(--bg-surface) 0%, var(--bg-app) 100%)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              padding: '36px 28px',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: '36px' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '8px' }}>
                Revenue Intelligence Simulation
              </span>
              <h2 style={{ fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '10px' }}>
                Quantify Your Conversion Opportunity Risk
              </h2>
              <p style={{ fontSize: '14.5px', color: 'var(--text-secondary)', maxWidth: '600px', margin: '0 auto' }}>
                Adjust the assumptions below to estimate the prospective revenue at risk from silent technical lead leaks.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px', alignItems: 'center' }}>
              {/* Controls Column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label htmlFor="calc-visitors" style={{ fontSize: '13.5px', fontWeight: '600', color: 'var(--text-primary)' }}>
                      Monthly Website Visitors
                    </label>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>
                      {monthlyVisitors.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <input
                    id="calc-visitors"
                    type="range"
                    min={1000}
                    max={100000}
                    step={1000}
                    value={monthlyVisitors}
                    onChange={(e) => setMonthlyVisitors(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span>1,000</span>
                    <span>100,000+</span>
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label htmlFor="calc-conversion" style={{ fontSize: '13.5px', fontWeight: '600', color: 'var(--text-primary)' }}>
                      Visitor-to-Lead Conversion Rate (%)
                    </label>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>
                      {conversionRate.toFixed(1)}%
                    </span>
                  </div>
                  <input
                    id="calc-conversion"
                    type="range"
                    min={0.5}
                    max={10.0}
                    step={0.1}
                    value={conversionRate}
                    onChange={(e) => setConversionRate(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span>0.5%</span>
                    <span>10.0%</span>
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label htmlFor="calc-lead-value" style={{ fontSize: '13.5px', fontWeight: '600', color: 'var(--text-primary)' }}>
                      Average Value per Captured Lead
                    </label>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>
                      ₹{leadValue.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <input
                    id="calc-lead-value"
                    type="range"
                    min={500}
                    max={25000}
                    step={500}
                    value={leadValue}
                    onChange={(e) => setLeadValue(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span>₹500</span>
                    <span>₹25,000+</span>
                  </div>
                </div>
              </div>

              {/* Output Display Card */}
              <div
                style={{
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                <div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.04em' }}>
                    Expected Total Monthly Leads
                  </span>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '2px' }}>
                    ~{totalMonthlyLeads} leads / month
                  </div>
                </div>

                <div style={{ paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--warning)', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.04em' }}>
                    Estimated Leads at Risk ({detectedRisk}% leak rate)
                  </span>
                  <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--warning)', marginTop: '2px' }}>
                    ~{estimatedLostLeads} lost leads / month
                  </div>
                </div>

                <div style={{ paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--danger)', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.04em' }}>
                    Estimated Monthly Opportunity Loss
                  </span>
                  <div style={{ fontSize: 'clamp(26px, 3.5vw, 36px)', fontWeight: '900', color: 'var(--danger)', letterSpacing: '-0.02em', marginTop: '2px' }}>
                    ₹{estimatedMonthlyLoss.toLocaleString('en-IN')}
                    <span style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: '500' }}> / mo</span>
                  </div>
                </div>

                <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: '1.5' }}>
                  * Illustrative estimate based on user-supplied assumptions. Not a revenue recovery guarantee. Actual impact depends on channel mix and remediation speed.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 8. CONTINUOUS WATCHDOG (24/7 MONITORING) */}
        <section id="watchdog" style={{ maxWidth: '1100px', margin: '0 auto 90px', padding: '0 20px' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--success)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '8px' }}>
              Continuous Regression Prevention
            </span>
            <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 36px)', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '12px' }}>
              Your Website Changes. LeadGuard Keeps Watching.
            </h2>
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)', maxWidth: '640px', margin: '0 auto' }}>
              Theme updates, CMS plugins, and tracking edits break lead flow without notice. Continuous Watchdog tests your critical conversion paths around the clock.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--primary)', marginBottom: '8px' }}>01. DETECT</div>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>Recurring Scans</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
                Automated background checks execute every 15 minutes to 24 hours across all registered domains.
              </p>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--purple)', marginBottom: '8px' }}>02. DIFF</div>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>Baseline Tracking</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
                Compares current findings against the last known-good baseline to isolate new regressions instantly.
              </p>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--warning)', marginBottom: '8px' }}>03. ALERT</div>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>Instant Alerts</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
                Dispatches urgent notifications via email and webhooks the moment critical lead leaks appear.
              </p>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--danger)', marginBottom: '8px' }}>04. INVESTIGATE</div>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>Code Evidence</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
                Shows exactly which DOM element, header, or tag triggered the incident with reproduction details.
              </p>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--success)', marginBottom: '8px' }}>05. VERIFY</div>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>Resolution Audit</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
                Single-click verification confirms that deployed remedies successfully closed the lead leak.
              </p>
            </div>
          </div>
        </section>

        {/* 9. AGENCY OPERATING PLATFORM */}
        <section id="agency" style={{ maxWidth: '1100px', margin: '0 auto 90px', padding: '0 20px' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '8px' }}>
              Agency & Consultant Retainers
            </span>
            <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 36px)', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '12px' }}>
              Turn Website Diagnostics into a Recurring Client Service
            </h2>
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)', maxWidth: '640px', margin: '0 auto' }}>
              Equip your agency to audit prospect funnels, deliver branded diagnostic roadmaps, and maintain ongoing monitoring retainers.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '24px' }}>
              <div style={{ color: 'var(--purple)', marginBottom: '12px' }}><IconAgency size={28} /></div>
              <h3 style={{ fontSize: '17px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>Multi-Client Workspaces</h3>
              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
                Manage isolated client accounts, delegate team permissions, and maintain domain inventories in a unified console.
              </p>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '24px' }}>
              <div style={{ color: 'var(--primary)', marginBottom: '12px' }}><IconAudits size={28} /></div>
              <h3 style={{ fontSize: '17px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>Branded PDF Deliverables</h3>
              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
                Generate presentation-ready audit deliverables with executive health scores, pillar deductions, and fix recommendations.
              </p>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '24px' }}>
              <div style={{ color: 'var(--success)', marginBottom: '12px' }}><IconMonitoring size={28} /></div>
              <h3 style={{ fontSize: '17px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>Monthly Retainer Protection</h3>
              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
                Package continuous watchdog monitoring as a recurring client retainer to prevent post-launch lead leakage.
              </p>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '24px' }}>
              <div style={{ color: 'var(--warning)', marginBottom: '12px' }}><IconDeveloper size={28} /></div>
              <h3 style={{ fontSize: '17px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>Developer REST API</h3>
              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
                Programmatically trigger diagnostics, query findings, and stream incident events via HMAC-signed outbox webhooks.
              </p>
            </div>
          </div>
        </section>

        {/* 10. TRANSPARENT PRICING */}
        <section id="pricing" style={{ maxWidth: '1100px', margin: '0 auto 100px', padding: '0 20px' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '8px' }}>
              Straightforward Plans
            </span>
            <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 36px)', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '12px' }}>
              Transparent, Honest Pricing
            </h2>
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)', maxWidth: '640px', margin: '0 auto' }}>
              Start with free diagnostic audits. Upgrade to continuous watchdog monitoring or agency toolkits when needed.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', alignItems: 'stretch' }}>
            {plans.map((plan) => {
              const isPro = plan.code === 'PRO';
              const priceDisplay = plan.priceInPaise === 0 ? '₹0' : `₹${(plan.priceInPaise / 100).toLocaleString('en-IN')}`;

              return (
                <div
                  key={plan.id || plan.code}
                  style={{
                    background: isPro ? 'linear-gradient(180deg, rgba(59, 130, 246, 0.08) 0%, var(--bg-surface) 100%)' : 'var(--bg-surface)',
                    border: isPro ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: '28px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                  }}
                >
                  {isPro && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '-12px',
                        right: '20px',
                        background: 'var(--primary)',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: '800',
                        padding: '3px 10px',
                        borderRadius: 'var(--radius-full)',
                        letterSpacing: '0.05em',
                      }}
                    >
                      POPULAR
                    </div>
                  )}

                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                    {plan.name}
                  </h3>
                  <div style={{ fontSize: '32px', fontWeight: '800', color: 'var(--text-primary)', margin: '14px 0 6px', letterSpacing: '-0.02em' }}>
                    {priceDisplay} <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: '500' }}>/ month</span>
                  </div>
                  <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: '0 0 20px', minHeight: '36px' }}>
                    {plan.description}
                  </p>

                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '2.1' }}>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <IconCheckCircle size={15} color="var(--success)" /> {plan.entitlements.websites} Registered Website{plan.entitlements.websites > 1 ? 's' : ''}
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <IconCheckCircle size={15} color="var(--success)" /> {plan.entitlements.auditsPerMonth} Diagnostic Audits / mo
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <IconCheckCircle size={15} color="var(--success)" /> Core 4-Pillar Scoring
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <IconCheckCircle size={15} color={plan.entitlements.monitoring ? 'var(--success)' : 'var(--text-muted)'} />
                      <span style={{ color: plan.entitlements.monitoring ? 'inherit' : 'var(--text-muted)' }}>
                        {plan.entitlements.monitoring ? 'Continuous Watchdog (24/7)' : 'No automated monitoring'}
                      </span>
                    </li>
                    {plan.entitlements.whiteLabel && (
                      <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <IconCheckCircle size={15} color="var(--success)" /> White-label PDF branding
                      </li>
                    )}
                    {plan.entitlements.apiAccess && (
                      <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <IconCheckCircle size={15} color="var(--success)" /> REST API & Webhooks
                      </li>
                    )}
                  </ul>

                  <Link
                    to="/register"
                    style={{
                      marginTop: 'auto',
                      textAlign: 'center',
                      background: isPro ? 'var(--primary)' : 'var(--bg-surface-elevated)',
                      color: '#fff',
                      padding: '10px 16px',
                      borderRadius: 'var(--radius-sm)',
                      textDecoration: 'none',
                      fontWeight: '700',
                      fontSize: '14px',
                      border: isPro ? 'none' : '1px solid var(--border-color)',
                      transition: 'background var(--transition-fast)',
                    }}
                  >
                    {plan.code === 'FREE' ? 'Start Free' : 'Start Trial'}
                  </Link>
                </div>
              );
            })}

            {/* Express Fix Add-on Card */}
            <div
              style={{
                background: 'linear-gradient(180deg, rgba(16, 185, 129, 0.08) 0%, var(--bg-surface) 100%)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: 'var(--radius-md)',
                padding: '28px 20px',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                Express Fix
              </h3>
              <div style={{ fontSize: '32px', fontWeight: '800', color: 'var(--success)', margin: '14px 0 6px', letterSpacing: '-0.02em' }}>
                ₹2,999 <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: '500' }}>one-time</span>
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: '0 0 20px', minHeight: '36px' }}>
                Manual engineer audit review & verified implementation fixes for detected lead leaks.
              </p>

              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '2.1' }}>
                <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <IconCheckCircle size={15} color="var(--success)" /> Manual engineer diagnostic review
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <IconCheckCircle size={15} color="var(--success)" /> WhatsApp & phone format corrections
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <IconCheckCircle size={15} color="var(--success)" /> Conversion pixel verification
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <IconCheckCircle size={15} color="var(--success)" /> Form POST target remediation
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <IconCheckCircle size={15} color="var(--success)" /> 100% refund if no leaks found
                </li>
              </ul>

              <button
                type="button"
                onClick={() => {
                  const input = document.getElementById('hero-url-input');
                  if (input) {
                    input.focus();
                    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }}
                style={{
                  marginTop: 'auto',
                  textAlign: 'center',
                  background: 'var(--status-success-bg)',
                  color: 'var(--success)',
                  padding: '10px 16px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  fontWeight: '700',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Scan First to Qualify
              </button>
            </div>
          </div>
          <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', marginTop: '20px' }}>
            All prices in Indian Rupees (INR), inclusive of GST. Cancel or upgrade anytime from your dashboard settings.
          </p>
        </section>

        {/* 11. FINAL ACQUISITION CTA */}
        <section
          style={{
            maxWidth: '1100px',
            margin: '0 auto 80px',
            padding: '0 20px',
          }}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, var(--bg-surface) 0%, var(--bg-surface-elevated) 100%)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              padding: '48px 24px',
              textAlign: 'center',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 36px)', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '12px' }}>
              Run Your Free Website Diagnostic
            </h2>
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)', maxWidth: '580px', margin: '0 auto 28px', lineHeight: '1.6' }}>
              Discover broken contact actions, un-attributed ad spend, and security flaws in 30 seconds. No credit card required.
            </p>

            <form
              onSubmit={(e) => handleQuickAudit(e, bottomUrl, true)}
              style={{
                maxWidth: '600px',
                margin: '0 auto 16px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                background: 'var(--bg-app)',
                padding: '6px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
              }}
            >
              <label htmlFor="bottom-url-input" style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>
                Website URL to scan
              </label>
              <input
                id="bottom-url-input"
                type="url"
                placeholder="https://yourwebsite.com"
                value={bottomUrl}
                onChange={(e) => setBottomUrl(e.target.value)}
                required
                disabled={bottomSubmitState === 'submitting'}
                style={{
                  flex: '1 1 260px',
                  minWidth: '200px',
                  background: 'transparent',
                  border: 'none',
                  padding: '12px 16px',
                  color: 'var(--text-primary)',
                  fontSize: '15px',
                  outline: 'none',
                  fontFamily: 'var(--font-family)',
                }}
              />
              <button
                type="submit"
                disabled={bottomSubmitState === 'submitting'}
                style={{
                  flex: '0 0 auto',
                  background: bottomSubmitState === 'submitting' ? 'var(--bg-surface-hover)' : 'var(--primary)',
                  color: '#fff',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '15px',
                  fontWeight: '700',
                  cursor: bottomSubmitState === 'submitting' ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  minHeight: '44px',
                  transition: 'background var(--transition-fast)',
                }}
              >
                {bottomSubmitState === 'submitting' ? (
                  <>
                    <div className="btnSpinner" style={{ width: '16px', height: '16px' }} />
                    <span>Analyzing…</span>
                  </>
                ) : (
                  <>
                    <span>Scan Free</span>
                    <IconArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            {bottomSubmitState === 'error' && (
              <div
                style={{
                  maxWidth: '600px',
                  margin: '0 auto 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 16px',
                  background: 'var(--severity-critical-bg)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 'var(--radius-sm)',
                  color: '#fca5a5',
                  fontSize: '13.5px',
                  textAlign: 'left',
                }}
                role="alert"
              >
                <IconAlertCircle size={18} color="var(--danger)" style={{ flexShrink: 0 }} />
                <span>{bottomErrorMessage}</span>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* 12. FOOTER */}
      <footer style={{ borderTop: '1px solid var(--border-color)', padding: '40px 24px', background: '#070a12' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px', fontSize: '13px', color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>LeadGuard OS V6</strong>
            <span>— Diagnostic Intelligence Platform</span>
          </div>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <Link to="/privacy" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Privacy Policy</Link>
            <Link to="/terms" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Terms of Service</Link>
            <Link to="/cookies" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Cookie Policy</Link>
            <Link to="/refund" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Refund Policy</Link>
            <Link to="/login" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: '600' }}>Sign In</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
