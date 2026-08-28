import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAudits } from '../../hooks/useAudit.js';
import { useWebsites } from '../../hooks/useWebsites.js';
import { useExecutiveSummary, useScoreExplanation } from '../../hooks/useIntelligence.js';
import { ScoreRing } from '../../components/ui/ScoreRing.js';
import { Card } from '../../components/ui/Card.js';
import { Badge } from '../../components/ui/Badge.js';
import { MetricCard } from '../../components/ui/MetricCard.js';
import { Button } from '../../components/ui/Button.js';
import { Skeleton, EmptyState } from '../../components/ui/States.js';
import { FindingCard } from '../../components/ui/FindingCard.js';
import { OnboardingCard } from '../../components/ui/OnboardingCard.js';
import { IconShield, IconAudits, IconCheckCircle, IconArrowRight, IconMonitoring } from '../../components/ui/Icons.js';

export function DashboardView() {
  const navigate = useNavigate();
  const { audits, isLoading: isAuditsLoading } = useAudits(10);
  const { websites, isLoading: isWebsitesLoading } = useWebsites();

  const latestAudit = audits[0];
  const { data: summary } = useExecutiveSummary(latestAudit?.id);
  const { data: scoreExplanation } = useScoreExplanation(latestAudit?.id);

  if (isAuditsLoading || isWebsitesLoading) {
    return (
      <div className="dashboardContainer">
        <Skeleton height="80px" className="mb4" />
        <div className="grid4 mb4">
          <Skeleton height="160px" />
          <Skeleton height="160px" />
          <Skeleton height="160px" />
          <Skeleton height="160px" />
        </div>
        <Skeleton height="320px" />
      </div>
    );
  }

  if (websites.length === 0) {
    return (
      <div className="dashboardContainer">
        <OnboardingCard onAddWebsite={() => navigate('/websites')} />
      </div>
    );
  }

  if (!latestAudit) {
    return (
      <div className="dashboardContainer">
        <div className="pageHeader">
          <div>
            <h1>Revenue & Diagnostic Intelligence</h1>
            <p>Real-time continuous monitoring across lead capture, advertising, SEO, and trust integrity.</p>
          </div>
          <Link to="/websites" className="btn btn-primary">
            + Run Diagnostic Scan
          </Link>
        </div>
        <EmptyState
          title="No Audits Executed Yet"
          description="Your websites are registered. Trigger a diagnostic scan to identify lead leakage and missing tracking tags."
          actionText="Go to Websites & Run Audit"
          onAction={() => navigate('/websites')}
          icon={<IconAudits size={40} color="#38bdf8" />}
        />
      </div>
    );
  }

  const impact = (latestAudit.businessImpact as {
    estimatedOpportunityLoss?: number;
    estimatedLostOpportunities?: number;
    currency?: string;
    confidence?: string;
    assumptions?: string[];
  }) || {};

  const criticalFindingsCount = (latestAudit.findings ?? []).filter(
    (f) => f.severity === 'CRITICAL' || f.severity === 'HIGH'
  ).length;

  return (
    <div className="dashboardContainer">
      {/* Top Section: Executive Intelligence Banner */}
      <div className="executiveBanner" style={{
        background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.12) 0%, rgba(15, 23, 42, 0.9) 100%)',
        border: '1px solid rgba(56, 189, 248, 0.25)',
        borderRadius: '14px',
        padding: '24px 28px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
      }}>
        <div className="bannerLeft">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Badge variant="high" size="sm">
              EXECUTIVE INTELLIGENCE
            </Badge>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
              Target: <strong style={{ color: '#fff' }}>{latestAudit.website?.domain || 'Website'}</strong> • Last Scan: {new Date(latestAudit.createdAt).toLocaleDateString()}
            </span>
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: '800', color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>
            {summary?.headline ?? 'Lead Conversion & Security Assessment Ready'}
          </h2>
          <p className="bannerSubtext" style={{ fontSize: '13.5px', color: '#cbd5e1', marginTop: '6px', margin: 0 }}>
            {summary?.topProblems?.[0] ?? 'Detected high-priority fixes to prevent inbound inquiry loss and secure marketing ROI.'}
          </p>
        </div>
        <div className="bannerRight">
          <Link to={`/audits/${latestAudit.id}`} className="btn btn-primary">
            View Full Audit Dossier <IconArrowRight size={16} />
          </Link>
        </div>
      </div>

      {/* Primary KPI Cards Grid (Requirement 8) */}
      <div className="grid4 mb4">
        {/* 1. Lead Health Score */}
        <Card className="scoreOverviewCard">
          <ScoreRing
            score={latestAudit.score?.overall ?? 0}
            label="LEAD HEALTH"
            size="md"
          />
          <div className="scorePillarsSummary">
            <div className="pillarTiny">
              <span>Lead Capture</span>
              <strong>{latestAudit.score?.lead ?? 0}</strong>
            </div>
            <div className="pillarTiny">
              <span>Ad Readiness</span>
              <strong>{latestAudit.score?.advertising ?? 0}</strong>
            </div>
            <div className="pillarTiny">
              <span>SEO</span>
              <strong>{latestAudit.score?.seo ?? 0}</strong>
            </div>
            <div className="pillarTiny">
              <span>Security</span>
              <strong>{latestAudit.score?.security ?? 0}</strong>
            </div>
          </div>
        </Card>

        {/* 2. Potential Opportunity Loss */}
        <MetricCard
          label="Potential Opportunity Loss"
          value={
            impact.estimatedOpportunityLoss !== undefined
              ? `₹${impact.estimatedOpportunityLoss.toLocaleString()}`
              : '₹0'
          }
          subtext="Estimated prospective monthly revenue at risk"
          badgeText={impact.confidence ? `${impact.confidence} Confidence` : 'Model Estimate'}
          badgeVariant="critical"
          highlight
        />

        {/* 3. Critical Lead Issues */}
        <MetricCard
          label="Critical Lead Issues"
          value={criticalFindingsCount}
          subtext="High-friction blockers requiring immediate fix"
          badgeText={criticalFindingsCount > 0 ? 'Action Required' : 'All Clear'}
          badgeVariant={criticalFindingsCount > 0 ? 'critical' : 'success'}
        />

        {/* 4. Active Monitored Websites */}
        <MetricCard
          label="Monitored Websites"
          value={websites.length}
          subtext="Continuous 24/7 Watchdog enabled"
          badgeText="Active"
          badgeVariant="success"
        />
      </div>

      {/* Main Content Split Grid */}
      <div className="dashboardSplit" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        <div className="splitMain">
          {/* Priority Remediation Engine */}
          <Card className="sectionCard mb4">
            <div className="cardHeaderFlex" style={{ marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#fff', margin: 0 }}>Priority Remediation Engine</h3>
                <p className="cardDesc" style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
                  Ranked high-impact technical fixes prioritized by prospective conversion recovery.
                </p>
              </div>
              <Badge variant="critical">
                {(latestAudit.findings ?? []).length} Detected Finding(s)
              </Badge>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {(latestAudit.findings ?? []).slice(0, 5).map((finding, idx) => (
                <FindingCard key={finding.id || idx} finding={finding} rank={idx + 1} />
              ))}

              {(latestAudit.findings ?? []).length === 0 && (
                <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '24px', borderRadius: '12px', textAlign: 'center', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <IconCheckCircle size={24} style={{ display: 'block', margin: '0 auto 8px' }} />
                  <strong style={{ fontSize: '15px' }}>Zero Critical Conversion Blockers Detected</strong>
                  <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 0' }}>All primary tracking tags and lead capture triggers are operating normally.</p>
                </div>
              )}
            </div>
          </Card>

          {/* Model Assumptions & Transparency (Requirement 39) */}
          {impact.assumptions && impact.assumptions.length > 0 && (
            <Card className="assumptionsCard mb4" style={{ background: '#111726', border: '1px solid #1e293b', padding: '20px' }}>
              <div className="cardHeaderFlex" style={{ marginBottom: '12px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#cbd5e1', margin: 0 }}>
                  Calculation Methodology & Assumptions
                </h4>
                <Badge variant="neutral" size="sm">
                  Confidence: {impact.confidence || 'ESTIMATED'}
                </Badge>
              </div>
              <ul style={{ paddingLeft: '20px', margin: '0 0 12px', fontSize: '13px', color: '#94a3b8', lineHeight: '1.7' }}>
                {impact.assumptions.map((asm, i) => (
                  <li key={i}>{asm}</li>
                ))}
              </ul>
              <div style={{ fontSize: '11.5px', color: '#64748b', fontStyle: 'italic', borderTop: '1px solid #1e293b', paddingTop: '8px' }}>
                * Model estimates prospective opportunity loss from observed technical drop-offs. Does not represent audited financial accounting statements.
              </div>
            </Card>
          )}
        </div>

        <div className="splitSide">
          {/* Recent Audits Card */}
          <Card className="sectionCard mb4">
            <div className="cardHeaderFlex" style={{ marginBottom: '16px' }}>
              <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#fff', margin: 0 }}>Recent Audits</h4>
              <Link to="/audits" className="btnLink" style={{ fontSize: '13px', color: '#38bdf8', textDecoration: 'none' }}>
                View All →
              </Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {audits.slice(0, 5).map((a) => (
                <Link
                  key={a.id}
                  to={`/audits/${a.id}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 14px',
                    background: '#172033',
                    border: '1px solid #1e293b',
                    borderRadius: '8px',
                    textDecoration: 'none',
                    transition: 'border-color 0.2s',
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '13.5px', color: '#fff', display: 'block' }}>{a.website?.name || 'Website'}</strong>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>{new Date(a.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Badge variant={a.status === 'COMPLETED' ? 'success' : 'high'} size="sm">
                      {a.status}
                    </Badge>
                    {a.score && (
                      <span style={{ fontSize: '13px', fontWeight: '700', color: a.score.overall >= 80 ? '#34d399' : '#fbbf24' }}>
                        {a.score.overall}/100
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          {/* Watchdog Status Card */}
          <Card className="sectionCard mb4">
            <div className="cardHeaderFlex" style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <IconMonitoring size={18} color="#10b981" />
                <h4 style={{ fontSize: '15px', fontWeight: '700', color: '#fff', margin: 0 }}>Watchdog 24/7</h4>
              </div>
              <Badge variant="success" size="sm">ACTIVE</Badge>
            </div>
            <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.5', margin: '0 0 16px' }}>
              Continuous multi-page regression scanning with TLS expiry and response latency checks.
            </p>
            <Link to="/monitoring" className="btn btn-outline btn-sm" style={{ width: '100%', textAlign: 'center' }}>
              Manage Watchdog Schedules
            </Link>
          </Card>

          {/* Pillar Score Breakdown */}
          {scoreExplanation && (
            <Card className="sectionCard">
              <h4 style={{ fontSize: '15px', fontWeight: '700', color: '#fff', marginBottom: '14px' }}>Pillar Health Breakdown</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#172033', borderRadius: '6px' }}>
                  <span style={{ fontSize: '13px', color: '#cbd5e1' }}>Lead Capture</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: scoreExplanation.pillars.lead.score >= 80 ? '#34d399' : '#fb923c' }}>
                    {scoreExplanation.pillars.lead.score}/100
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#172033', borderRadius: '6px' }}>
                  <span style={{ fontSize: '13px', color: '#cbd5e1' }}>Ad Readiness</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: scoreExplanation.pillars.advertising.score >= 80 ? '#34d399' : '#fb923c' }}>
                    {scoreExplanation.pillars.advertising.score}/100
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#172033', borderRadius: '6px' }}>
                  <span style={{ fontSize: '13px', color: '#cbd5e1' }}>Technical SEO</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: scoreExplanation.pillars.seo.score >= 80 ? '#34d399' : '#fb923c' }}>
                    {scoreExplanation.pillars.seo.score}/100
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#172033', borderRadius: '6px' }}>
                  <span style={{ fontSize: '13px', color: '#cbd5e1' }}>Security & Trust</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: scoreExplanation.pillars.security.score >= 80 ? '#34d399' : '#fb923c' }}>
                    {scoreExplanation.pillars.security.score}/100
                  </span>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
