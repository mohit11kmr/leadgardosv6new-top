import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../../api/client.js';
import { IconShield, IconTrendingUp, IconTarget, IconSearch, IconArrowRight, IconExternalLink, IconLock, IconAlertCircle, IconCheckCircle, IconXCircle, IconHelpCircle, IconCreditCard, IconMail, IconPhone, IconGlobe } from '../../components/ui/Icons.js';

interface ScanResult {
  id: string;
  website: {
    id: string;
    name: string;
    url: string;
    domain: string;
  };
  status: string;
  score: {
    overall: number;
    lead: number;
    advertising: number;
    seo: number;
    security: number;
  } | null;
  findings: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    severity: string;
    scoreImpact: number;
    recommendation: string;
    affectedUrl?: string;
    evidence?: any;
    normalizedIssueKey?: string;
  }> | undefined;
  createdAt: string;
}

export function ScanResultView() {
  const { scanId } = useParams<{ scanId: string }>();
  const navigate = useNavigate();
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!scanId) return;

    const fetchScan = async () => {
      try {
        const data = await apiClient<ScanResult>(`/public/scan/${scanId}`);
        setScan(data);
        setLoading(false);
        if (data.status === 'QUEUED' || data.status === 'RUNNING') {
          setPolling(true);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load scan results');
        setLoading(false);
      }
    };

    fetchScan();

    let interval: NodeJS.Timeout;
    if (polling) {
      interval = setInterval(fetchScan, 3000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [scanId, polling]);

  useEffect(() => {
    if (scan && (scan.status === 'QUEUED' || scan.status === 'RUNNING')) {
      setPolling(true);
    } else {
      setPolling(false);
    }
  }, [scan]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return '#ef4444';
      case 'HIGH': return '#f97316';
      case 'MEDIUM': return '#f59e0b';
      case 'LOW': return '#38bdf8';
      case 'INFO': return '#64748b';
      default: return '#64748b';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return <IconXCircle size={16} color="#ef4444" />;
      case 'HIGH': return <IconAlertCircle size={16} color="#f97316" />;
      case 'MEDIUM': return <IconHelpCircle size={16} color="#f59e0b" />;
      case 'LOW': return <IconCheckCircle size={16} color="#38bdf8" />;
      case 'INFO': return <IconHelpCircle size={16} color="#64748b" />;
      default: return <IconHelpCircle size={16} color="#64748b" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'LEAD': return '#38bdf8';
      case 'ADVERTISING': return '#a855f7';
      case 'SEO': return '#10b981';
      case 'SECURITY': return '#ef4444';
      default: return '#64748b';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'LEAD': return <IconTarget size={14} />;
      case 'ADVERTISING': return <IconTrendingUp size={14} />;
      case 'SEO': return <IconSearch size={14} />;
      case 'SECURITY': return <IconLock size={14} />;
      default: return <IconHelpCircle size={14} />;
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0b0f19', color: '#f8fafc', fontFamily: 'Inter, -apple-system, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', border: '4px solid #1e293b', borderTopColor: '#38bdf8', borderRadius: '50%', margin: '0 auto 24px', animation: 'spin 1s linear infinite' }} />
          <p style={{ fontSize: '16px', color: '#94a3b8' }}>Analyzing your website...</p>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '8px' }}>This usually takes 15-30 seconds</p>
        </div>
        <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: '#0b0f19', color: '#f8fafc', fontFamily: 'Inter, -apple-system, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <IconAlertCircle size={48} color="#ef4444" style={{ marginBottom: '16px' }} />
          <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '8px' }}>Unable to Load Results</h2>
          <p style={{ fontSize: '15px', color: '#94a3b8', marginBottom: '24px' }}>{error}</p>
          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#fff', padding: '12px 24px', borderRadius: '8px', textDecoration: 'none', fontWeight: '600' }}>
            <IconArrowRight size={16} />
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  if (!scan) {
    return null;
  }

  const topFindings = scan.findings?.slice(0, 5) || [];

  return (
    <div style={{ minHeight: '100vh', background: '#0b0f19', color: '#f8fafc', fontFamily: 'Inter, -apple-system, sans-serif' }}>
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
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '14px' }}>
          <Link to="/login" style={{ color: '#cbd5e1', textDecoration: 'none', fontWeight: '600', padding: '8px 16px', borderRadius: '6px' }}>Sign In</Link>
          <Link to="/register" style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#fff', textDecoration: 'none', fontWeight: '600', padding: '8px 20px', borderRadius: '6px', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)' }}>Create Free Account</Link>
        </div>
      </header>

      <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '48px 24px' }}>
        {/* Website Header */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, #2563eb, #38bdf8)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', color: '#fff', fontSize: '16px' }}>
              <IconGlobe size={20} />
            </div>
            <div>
              <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#fff', margin: 0 }}>{scan.website.domain}</h1>
              <p style={{ fontSize: '14px', color: '#94a3b8', margin: '4px 0 0' }}>{scan.website.url}</p>
            </div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: '9999px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)', color: '#38bdf8', fontSize: '12px', fontWeight: '600' }}>
            <span>Scan ID: {scan.id.slice(0, 8)}</span>
            <span>•</span>
            <span style={{ textTransform: 'capitalize' }}>{scan.status.toLowerCase()}</span>
            <span>•</span>
            <span>{new Date(scan.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Overall Score */}
        {scan.score && (
          <div style={{ marginBottom: '40px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', padding: '24px', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Lead Health</div>
                <div style={{ fontSize: '48px', fontWeight: '900', color: '#fff' }}>
                  {scan.score.overall} <span style={{ fontSize: '18px', color: '#64748b' }}>/ 100</span>
                </div>
              </div>
              <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', padding: '24px', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <span style={{ color: '#38bdf8' }}><IconTarget size={14} /></span>
                    Lead Capture
                  </span>
                </div>
                <div style={{ fontSize: '36px', fontWeight: '800', color: '#38bdf8' }}>{scan.score.lead}</div>
              </div>
              <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', padding: '24px', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <span style={{ color: '#a855f7' }}><IconTrendingUp size={14} /></span>
                    Advertising
                  </span>
                </div>
                <div style={{ fontSize: '36px', fontWeight: '800', color: '#a855f7' }}>{scan.score.advertising}</div>
              </div>
              <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', padding: '24px', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <span style={{ color: '#10b981' }}><IconSearch size={14} /></span>
                    SEO
                  </span>
                </div>
                <div style={{ fontSize: '36px', fontWeight: '800', color: '#10b981' }}>{scan.score.seo}</div>
              </div>
              <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', padding: '24px', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <span style={{ color: '#ef4444' }}><IconLock size={14} /></span>
                    Security
                  </span>
                </div>
                <div style={{ fontSize: '36px', fontWeight: '800', color: '#ef4444' }}>{scan.score.security}</div>
              </div>
            </div>
          </div>
        )}

        {/* Top Findings */}
        {topFindings.length > 0 && (
          <section style={{ marginBottom: '40px' }}>
            <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#fff', marginBottom: '20px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <IconAlertCircle size={20} color="#f59e0b" />
                Most Important Problems Found
              </span>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {topFindings.map((finding) => (
                <div key={finding.id} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '20px', borderLeft: `4px solid ${getSeverityColor(finding.severity)}` }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flexShrink: 0, marginTop: '2px' }}>
                      {getSeverityIcon(finding.severity)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '600', color: getCategoryColor(finding.category), background: `${getCategoryColor(finding.category)}20`, padding: '4px 8px', borderRadius: '4px' }}>
                          {getCategoryIcon(finding.category)}
                          {finding.category}
                        </span>
                        <span style={{ fontSize: '11px', fontWeight: '700', color: getSeverityColor(finding.severity), background: `${getSeverityColor(finding.severity)}20`, padding: '4px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                          {finding.severity}
                        </span>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>Score Impact: -{finding.scoreImpact}</span>
                      </div>
                      <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#fff', margin: '0 0 8px' }}>{finding.title}</h3>
                      <p style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: '1.6', margin: '0 0 12px' }}>{finding.description}</p>
                      
                      {finding.affectedUrl && (
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px', fontFamily: 'monospace', background: '#1e293b', padding: '8px 12px', borderRadius: '6px', wordBreak: 'break-all' }}>
                          Affected URL: {finding.affectedUrl}
                        </div>
                      )}

                      {finding.evidence && (
                        <details style={{ marginBottom: '12px' }}>
                          <summary style={{ fontSize: '12px', color: '#94a3b8', cursor: 'pointer', fontWeight: '500' }}>View Technical Evidence</summary>
                          <pre style={{ marginTop: '8px', fontSize: '11px', color: '#64748b', background: '#1e293b', padding: '12px', borderRadius: '6px', overflow: 'auto', fontFamily: 'monospace' }}>
                            {JSON.stringify(finding.evidence, null, 2)}
                          </pre>
                        </details>
                      )}

                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '12px', background: '#131c31', borderRadius: '8px', border: '1px solid #1e293b' }}>
                        <IconShield size={16} color="#10b981" style={{ flexShrink: 0, marginTop: '1px' }} />
                        <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6' }}>
                          <strong>Recommended Fix:</strong> {finding.recommendation}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Express Fix CTA */}
        <section style={{ marginBottom: '40px' }}>
          <div style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', border: '2px solid #2563eb', borderRadius: '16px', padding: '32px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, right: 0, width: '200px', height: '200px', background: 'radial-gradient(circle, rgba(37, 99, 235, 0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{ width: '48px', height: '48px', background: 'linear-gradient(135deg, #2563eb, #38bdf8)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(37, 99, 235, 0.3)' }}>
                  <IconShield size={24} color="#fff" />
                </div>
                <div>
                  <h3 style={{ fontSize: '24px', fontWeight: '800', color: '#fff', margin: 0 }}>Express Fix — ₹2,999</h3>
                  <p style={{ fontSize: '14px', color: '#94a3b8', margin: '4px 0 0' }}>One-time expert remediation for critical & high priority lead leaks</p>
                </div>
              </div>

              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', fontSize: '14px', color: '#cbd5e1', lineHeight: '2.2' }}>
                <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><IconCheckCircle size={16} color="#10b981" /> Detailed remediation review by our engineers</li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><IconCheckCircle size={16} color="#10b981" /> Critical & High priority fixes (WhatsApp, Call, Forms, Tracking, Security)</li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><IconCheckCircle size={16} color="#10b981" /> Contact link corrections & implementation guidance</li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><IconCheckCircle size={16} color="#10b981" /> Before/after evidence where applicable</li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><IconCheckCircle size={16} color="#10b981" /> Completion summary delivered via email</li>
              </ul>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                <button
                  onClick={() => {
                    if (scanId) {
                      navigate(`/checkout/express-fix?scanId=${scanId}&websiteId=${scan.website.id}&auditId=${scan.id}`);
                    }
                  }}
                  style={{
                    background: 'linear-gradient(135deg, #2563eb, #38bdf8)',
                    color: '#fff',
                    border: 'none',
                    padding: '14px 32px',
                    borderRadius: '10px',
                    fontSize: '16px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '10px',
                    boxShadow: '0 4px 20px rgba(37, 99, 235, 0.4)',
                  }}
                >
                  <IconCreditCard size={18} />
                  Fix My Lead Leaks — ₹2,999
                </button>
                <Link to="/register" style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  background: '#1e293b',
                  color: '#fff',
                  textDecoration: 'none',
                  padding: '14px 28px',
                  borderRadius: '10px',
                  fontSize: '16px',
                  fontWeight: '600',
                  border: '1px solid #334155',
                }}>
                  <IconMail size={18} />
                  Save This Audit
                </Link>
              </div>

              <p style={{ marginTop: '16px', fontSize: '12px', color: '#64748b' }}>
                <IconHelpCircle size={12} style={{ verticalAlign: 'middle' }} />
                <span style={{ marginLeft: '4px' }}>This is a manual expert review service, not automated code changes. GST inclusive. 100% refund if no actionable fixes found.</span>
              </p>
            </div>
          </div>
        </section>

        {/* Disclaimer */}
        <div style={{ padding: '16px', background: '#131c31', border: '1px solid #1e293b', borderRadius: '10px', fontSize: '13px', color: '#94a3b8' }}>
          <strong style={{ color: '#cbd5e1' }}>Important:</strong> The Lead Health Score and potential opportunity estimates are based on diagnostic findings and standard model assumptions (default: 10,000 monthly visitors, 2% conversion rate, ₹5,000 average lead value). They represent <strong>estimated potential opportunity</strong>, not guaranteed lost revenue. Actual business impact varies based on your traffic, conversion rates, and lead values.
        </div>
      </main>

      <footer style={{ borderTop: '1px solid #1e293b', padding: '32px', background: '#090d16', textAlign: 'center' }}>
        <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
          LeadGuard OS V6 — Diagnostic Intelligence Platform
        </p>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
    </div>
  );
}