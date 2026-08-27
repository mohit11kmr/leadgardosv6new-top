import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { accessTokenKey, api, auth, clearTokens } from './api.js';
import './styles.css';

type Score = { overall: number; lead: number; advertising: number; seo: number; security: number };

type FindingEvidence = {
  source?: string;
  observed?: string;
  location?: string;
  why?: string;
  recommendation?: string;
  metadata?: Record<string, unknown>;
  value?: string;
};

type Finding = {
  id: string;
  ruleId: string;
  internalKey?: string;
  normalizedIssueKey?: string;
  category: 'LEAD' | 'ADVERTISING' | 'SEO' | 'SECURITY';
  scope: 'PAGE' | 'WEBSITE' | 'AUDIT';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  description: string;
  evidence: FindingEvidence;
  affectedUrl?: string;
  recommendation: string;
  scoreImpact: number;
  businessImpact?: string;
};

type BusinessImpact = {
  kind: string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  inputs: {
    monthlyVisitors: number;
    conversionRate: number;
    averageLeadValue: number;
    source: 'USER' | 'DEFAULT';
  };
  estimatedConversionRisk: number;
  estimatedLostOpportunities: number;
  estimatedOpportunityLoss: number;
  currency: string;
  assumptions?: string[];
  methodology: string;
};

type ExecutiveSummary = {
  headline: string;
  overallScore: number;
  pillarScores: Score;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  topProblems: string[];
  priorityFixes: string[];
  businessImpact: BusinessImpact;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
};

type AuditTelemetry = {
  queueWaitMs?: number;
  crawlDurationMs?: number;
  fetchDurationMs?: number;
  scanDurationMs?: number;
  aggregationDurationMs?: number;
  scoreDurationMs?: number;
  finalizationDurationMs?: number;
  totalDurationMs?: number;
  pagesDiscovered?: number;
  pagesFetched?: number;
  pagesFailed?: number;
  findingsGenerated?: number;
};

type Audit = {
  id: string;
  status: string;
  progress: number;
  progressStage: string;
  pagesScanned?: number;
  findingsGenerated?: number;
  score?: Score | null;
  findings?: Finding[];
  businessImpact?: BusinessImpact | null;
  executiveSummary?: ExecutiveSummary | null;
  telemetry?: AuditTelemetry | null;
};

type Website = { id: string; name: string; url: string; domain: string; audits?: Audit[] };
type Organization = { id: string; name: string };

const authSnapshot = () => Boolean(localStorage.getItem(accessTokenKey));
const subscribeAuth = (callback: () => void) => {
  window.addEventListener('leadguard-auth-changed', callback);
  return () => window.removeEventListener('leadguard-auth-changed', callback);
};

function AuthRoute({ children }: { children: React.ReactNode }) {
  const authenticated = useSyncExternalStore(subscribeAuth, authSnapshot, () => false);
  return authenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function Shell({ children }: { children: React.ReactNode }) {
  const authenticated = useSyncExternalStore(subscribeAuth, authSnapshot, () => false);
  return (
    <main>
      <nav>
        <Link to="/dashboard" className="brand">
          LeadGuard <small>OS / V6</small>
        </Link>
        {authenticated && (
          <button
            className="logoutButton"
            type="button"
            onClick={() => {
              clearTokens();
              window.location.href = '/login';
            }}
          >
            Sign out
          </button>
        )}
      </nav>
      {children}
    </main>
  );
}

function Home() {
  return (
    <Shell>
      <p className="eyebrow">DIAGNOSTIC ENGINE HARDENED</p>
      <h1>Stop losing leads before they convert.</h1>
      <p className="lede">
        Run automated 4-pillar diagnostics across lead channels, ad tracking readiness, search indexability, and security trust factors.
      </p>
      <Link to="/login" className="action">
        Open Workspace -&gt;
      </Link>
    </Shell>
  );
}

function Login() {
  const [register, setRegister] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  return (
    <Shell>
      <div className="narrow">
        <p className="eyebrow">{register ? 'CREATE ACCOUNT' : 'SECURE ACCESS'}</p>
        <h2>{register ? 'Create your organization' : 'Sign in to LeadGuard'}</h2>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setError('');
            const data = new FormData(event.currentTarget);
            try {
              await auth(register ? 'register' : 'login', {
                email: String(data.get('email')),
                password: String(data.get('password')),
                organizationName: data.get('organizationName') ? String(data.get('organizationName')) : undefined,
              });
              navigate('/dashboard', { replace: true });
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'Unable to authenticate');
            }
          }}
        >
          <label>
            Email
            <input name="email" type="email" required />
          </label>
          {register && (
            <label>
              Organization
              <input name="organizationName" required />
            </label>
          )}
          <label>
            Password
            <input name="password" type="password" minLength={12} required />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="action" type="submit">
            {register ? 'Create account' : 'Sign in'} -&gt;
          </button>
        </form>
        <button className="textButton" type="button" onClick={() => setRegister((value) => !value)}>
          {register ? 'Already have an account?' : 'Create an account'}
        </button>
      </div>
    </Shell>
  );
}

function AddWebsite({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  if (!open)
    return (
      <button className="action" type="button" onClick={() => setOpen(true)}>
        + Add website
      </button>
    );

  return (
    <form
      className="add"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        try {
          await api('/websites', {
            method: 'POST',
            body: JSON.stringify({ name: data.get('name'), url: data.get('url') }),
          });
          setOpen(false);
          onAdded();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Unable to add website');
        }
      }}
    >
      <label>
        Website name
        <input name="name" required />
      </label>
      <label>
        Website URL
        <input name="url" type="url" required />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="action" type="submit">
        Add website -&gt;
      </button>
    </form>
  );
}

function Dashboard() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [active, setActive] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [sites, organization] = await Promise.all([
        api<Website[]>('/websites'),
        api<{ activeOrganizationId: string; organizations: Organization[] }>('/organizations'),
      ]);
      setWebsites(sites);
      setOrgs(organization.organizations);
      setActive(organization.activeOrganizationId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load workspace');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <Shell>
      <div className="row">
        <div>
          <p className="eyebrow">ORGANIZATION WORKSPACE</p>
          <h2>Monitored Websites</h2>
        </div>
        {orgs.length > 1 && (
          <select
            value={active}
            onChange={async (event) => {
              await api('/organizations/switch', {
                method: 'POST',
                body: JSON.stringify({ organizationId: event.target.value }),
              });
              await load();
            }}
          >
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="lede">View diagnostics, opportunity loss estimates, and technical security posture.</p>
      {error && <p className="error">{error}</p>}
      <AddWebsite onAdded={load} />
      <section className="list">
        {websites.length === 0 ? (
          <p className="muted">No websites configured yet. Add your first website to run diagnostics.</p>
        ) : (
          websites.map((site) => (
            <article key={site.id}>
              <div>
                <h4>{site.name}</h4>
                <span>{site.url}</span>
                {site.audits[0]?.score && (
                  <span className="muted">
                    Health Score: <b>{site.audits[0].score.overall}/100</b> ({site.audits[0].status})
                  </span>
                )}
              </div>
              <Link to={`/websites/${site.id}`}>Open -&gt;</Link>
            </article>
          ))
        )}
      </section>
    </Shell>
  );
}

function WebsiteDetail() {
  const { id } = useParams();
  const [site, setSite] = useState<Website>();
  const [audit, setAudit] = useState<Audit>();
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const value = await api<Website>(`/websites/${id}`);
      setSite(value);
      if (value.audits[0]) setAudit(value.audits[0]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load website');
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    if (!audit || ['COMPLETED', 'FAILED', 'PARTIAL', 'CANCELLED'].includes(audit.status)) return;
    const timer = window.setInterval(async () => {
      const progress = await api<Audit>(`/audits/${audit.id}/progress`);
      setAudit((current) => (current ? { ...current, ...progress } : progress));
      if (['COMPLETED', 'FAILED', 'PARTIAL', 'CANCELLED'].includes(progress.status)) void load();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [audit?.id, audit?.status]);

  if (!site)
    return (
      <Shell>
        <p>{error || 'Loading...'}</p>
      </Shell>
    );

  return (
    <Shell>
      <Link to="/dashboard" className="backLink">
        &lt;- Dashboard
      </Link>
      <p className="eyebrow">WEBSITE</p>
      <h2>{site.name}</h2>
      <p className="muted">{site.url}</p>
      {audit && <AuditPanel audit={audit} />}
      <button
        className="action"
        type="button"
        onClick={async () =>
          setAudit(
            await api<Audit>('/audits', {
              method: 'POST',
              body: JSON.stringify({ websiteId: site.id, idempotencyKey: `manual-${Date.now()}` }),
            })
          )
        }
      >
        Start audit -&gt;
      </button>
    </Shell>
  );
}

function AuditPanel({ audit }: { audit: Audit }) {
  const [detail, setDetail] = useState<Audit>();
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [scopeFilter, setScopeFilter] = useState<string>('ALL');
  const [showTelemetry, setShowTelemetry] = useState<boolean>(false);

  useEffect(() => {
    if (['COMPLETED', 'PARTIAL'].includes(audit.status)) {
      void api<Audit>(`/audits/${audit.id}`).then(setDetail);
    }
  }, [audit]);

  const score = detail?.score;
  const impact = detail?.businessImpact;
  const summary = detail?.executiveSummary;
  const telemetry = detail?.telemetry;
  const findings = detail?.findings ?? [];

  const filteredFindings = findings.filter((f) => {
    if (severityFilter !== 'ALL' && f.severity !== severityFilter) return false;
    if (categoryFilter !== 'ALL' && f.category !== categoryFilter) return false;
    if (scopeFilter !== 'ALL' && f.scope !== scopeFilter) return false;
    return true;
  });

  const criticalCount = findings.filter((f) => f.severity === 'CRITICAL').length;
  const highCount = findings.filter((f) => f.severity === 'HIGH').length;
  const mediumCount = findings.filter((f) => f.severity === 'MEDIUM').length;
  const lowCount = findings.filter((f) => f.severity === 'LOW').length;

  return (
    <section className="audit">
      <div className="row headerRow">
        <div>
          <p className="eyebrow">AUDIT {audit.status}</p>
          <h3>
            {audit.progressStage} / {audit.progress}%
          </h3>
        </div>
        {score && (
          <div className="scoreBadge">
            <span className="scoreLabel">OVERALL</span>
            <strong className="score">{score.overall}</strong>
          </div>
        )}
      </div>
      <progress max="100" value={audit.progress} />

      {score && (
        <div className="scores">
          {[
            ['Lead Health', score.lead, 'LEAD'],
            ['Ad Readiness', score.advertising, 'ADVERTISING'],
            ['Search & SEO', score.seo, 'SEO'],
            ['Security Posture', score.security, 'SECURITY'],
          ].map(([name, value, key]) => (
            <div
              key={String(key)}
              className={`scoreCard ${categoryFilter === key ? 'active' : ''}`}
              onClick={() => setCategoryFilter((cur) => (cur === key ? 'ALL' : String(key)))}
            >
              <b>{name}</b>
              <strong>{value}</strong>
              <small>/ 100</small>
            </div>
          ))}
        </div>
      )}

      {/* Severity Breakdown Chips */}
      {findings.length > 0 && (
        <div className="severityChips">
          <button
            className={`chip ${severityFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setSeverityFilter('ALL')}
          >
            All ({findings.length})
          </button>
          <button
            className={`chip CRITICAL ${severityFilter === 'CRITICAL' ? 'active' : ''}`}
            onClick={() => setSeverityFilter('CRITICAL')}
          >
            Critical ({criticalCount})
          </button>
          <button
            className={`chip HIGH ${severityFilter === 'HIGH' ? 'active' : ''}`}
            onClick={() => setSeverityFilter('HIGH')}
          >
            High ({highCount})
          </button>
          <button
            className={`chip MEDIUM ${severityFilter === 'MEDIUM' ? 'active' : ''}`}
            onClick={() => setSeverityFilter('MEDIUM')}
          >
            Medium ({mediumCount})
          </button>
          <button
            className={`chip LOW ${severityFilter === 'LOW' ? 'active' : ''}`}
            onClick={() => setSeverityFilter('LOW')}
          >
            Low ({lowCount})
          </button>
        </div>
      )}

      {/* Scope Filter */}
      {findings.length > 0 && (
        <div className="scopeFilters">
          <span className="filterLabel">Scope:</span>
          {['ALL', 'WEBSITE', 'PAGE'].map((scope) => (
            <button
              key={scope}
              className={`textChip ${scopeFilter === scope ? 'active' : ''}`}
              onClick={() => setScopeFilter(scope)}
            >
              {scope === 'ALL' ? 'All Scopes' : scope === 'WEBSITE' ? 'Website-Wide' : 'Page-Specific'}
            </button>
          ))}
        </div>
      )}

      {/* Business Impact / Potential Opportunity Loss */}
      {impact && (
        <div className="impactCard">
          <div className="row">
            <div>
              <span className="impactEyebrow">BUSINESS IMPACT ESTIMATOR</span>
              <h4>Potential Opportunity Loss</h4>
            </div>
            <span className={`confidenceBadge ${impact.confidence}`}>
              Confidence: {impact.confidence}
            </span>
          </div>
          <div className="impactMetrics">
            <div>
              <span>Est. Opportunity Loss</span>
              <strong>
                ₹{impact.estimatedOpportunityLoss.toLocaleString('en-IN')} / mo
              </strong>
            </div>
            <div>
              <span>Lost Opportunities</span>
              <strong>{impact.estimatedLostOpportunities} leads / mo</strong>
            </div>
            <div>
              <span>Conversion Risk</span>
              <strong>{(impact.estimatedConversionRisk * 100).toFixed(1)}%</strong>
            </div>
          </div>
          {impact.assumptions && impact.assumptions.length > 0 && (
            <div className="assumptionsList">
              <b>Model Assumptions:</b>
              <ul>
                {impact.assumptions.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="methodology">{impact.methodology}</p>
        </div>
      )}

      {/* Executive Summary Top Problems & Priority Fixes */}
      {summary && (
        <div className="summaryCard">
          <h4>Diagnostic Headline</h4>
          <p className="headline">{summary.headline}</p>
          {summary.topProblems?.length > 0 && (
            <div className="summarySection">
              <strong>Top Problems Identified:</strong>
              <ul>
                {summary.topProblems.map((prob, idx) => (
                  <li key={idx}>{prob}</li>
                ))}
              </ul>
            </div>
          )}
          {summary.priorityFixes?.length > 0 && (
            <div className="summarySection">
              <strong>Priority Fixes:</strong>
              <ol>
                {summary.priorityFixes.map((fix, idx) => (
                  <li key={idx}>{fix}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {/* Audit Telemetry Technical Details */}
      {telemetry && (
        <div className="telemetryCard">
          <button
            type="button"
            className="telemetryToggle"
            onClick={() => setShowTelemetry((v) => !v)}
          >
            <span>Audit Performance Telemetry</span>
            <span>{showTelemetry ? '▲ Hide' : '▼ View Breakdown'}</span>
          </button>
          {showTelemetry && (
            <div className="telemetryGrid">
              <div>
                <span>Total Duration</span>
                <strong>{telemetry.totalDurationMs ?? 0} ms</strong>
              </div>
              <div>
                <span>Crawl Time</span>
                <strong>{telemetry.crawlDurationMs ?? 0} ms</strong>
              </div>
              <div>
                <span>Scan Time</span>
                <strong>{telemetry.scanDurationMs ?? 0} ms</strong>
              </div>
              <div>
                <span>Aggregation</span>
                <strong>{telemetry.aggregationDurationMs ?? 0} ms</strong>
              </div>
              <div>
                <span>Pages Fetched</span>
                <strong>{telemetry.pagesFetched ?? 0}</strong>
              </div>
              <div>
                <span>Pages Discovered</span>
                <strong>{telemetry.pagesDiscovered ?? 0}</strong>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filtered Findings List */}
      <div className="findingsList">
        <h4>Detailed Diagnostic Findings ({filteredFindings.length})</h4>
        {filteredFindings.map((finding) => (
          <article className="finding" key={finding.id}>
            <div className="findingHeader">
              <span className={`severity ${finding.severity}`}>{finding.severity}</span>
              <span className="scopeTag">{finding.scope}</span>
              <span className="categoryTag">{finding.category}</span>
              <span className="ruleTag">{finding.ruleId}</span>
              {finding.normalizedIssueKey && (
                <span className="issueTag">{finding.normalizedIssueKey}</span>
              )}
            </div>
            <h5>{finding.title}</h5>
            <p>{finding.description}</p>
            {finding.evidence && (
              <div className="evidenceBox">
                <strong>Observed:</strong>{' '}
                <code>{finding.evidence.observed || finding.evidence.value || 'N/A'}</code>
                {finding.evidence.why && (
                  <p>
                    <b>Why it matters:</b> {finding.evidence.why}
                  </p>
                )}
              </div>
            )}
            <p className="recommendation">
              <b>Recommendation:</b> {finding.recommendation}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/dashboard"
          element={
            <AuthRoute>
              <Dashboard />
            </AuthRoute>
          }
        />
        <Route
          path="/websites/:id"
          element={
            <AuthRoute>
              <WebsiteDetail />
            </AuthRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
