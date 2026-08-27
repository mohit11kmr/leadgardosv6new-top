import React from 'react';
import { Link } from 'react-router-dom';
import { useAudits } from '../../hooks/useAudit.js';
import { useWebsites } from '../../hooks/useWebsites.js';
import { useExecutiveSummary, useScoreExplanation } from '../../hooks/useIntelligence.js';
import { ScoreRing } from '../../components/ui/ScoreRing.js';
import { Card } from '../../components/ui/Card.js';
import { Badge } from '../../components/ui/Badge.js';
import { MetricCard } from '../../components/ui/MetricCard.js';
import { Button } from '../../components/ui/Button.js';
import { Skeleton, EmptyState } from '../../components/ui/States.js';

export function DashboardView() {
  const { audits, isLoading: isAuditsLoading } = useAudits(10);
  const { websites, isLoading: isWebsitesLoading } = useWebsites();

  const latestAudit = audits[0];
  const { data: summary, isLoading: isSummaryLoading } = useExecutiveSummary(latestAudit?.id);
  const { data: scoreExplanation } = useScoreExplanation(latestAudit?.id);

  if (isAuditsLoading || isWebsitesLoading) {
    return (
      <div className="dashboardContainer">
        <Skeleton height="60px" className="mb4" />
        <div className="grid3 mb4">
          <Skeleton height="140px" />
          <Skeleton height="140px" />
          <Skeleton height="140px" />
        </div>
        <Skeleton height="300px" />
      </div>
    );
  }

  if (websites.length === 0) {
    return (
      <div className="dashboardContainer">
        <EmptyState
          title="No Websites Added Yet"
          description="Add your company's primary website to run revenue and lead conversion diagnostic scans."
          actionText="Add Website"
          onAction={() => {
            window.location.href = '/websites';
          }}
          icon="🌐"
        />
      </div>
    );
  }

  if (!latestAudit) {
    return (
      <div className="dashboardContainer">
        <div className="pageHeader">
          <div>
            <h1>Executive Revenue & Diagnostic Intelligence</h1>
            <p>Real-time monitoring across lead capture, advertising, SEO, and trust integrity.</p>
          </div>
          <Link to="/websites" className="btn btn-primary">
            Start First Audit
          </Link>
        </div>
        <EmptyState
          title="No Audits Executed"
          description="Trigger an audit on your registered websites to uncover revenue leaks and broken contact points."
          actionText="Go to Websites"
          onAction={() => {
            window.location.href = '/websites';
          }}
          icon="🔍"
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

  return (
    <div className="dashboardContainer">
      {/* Top Section: Executive Headline */}
      <div className="executiveBanner">
        <div className="bannerLeft">
          <Badge variant="high" size="sm" className="mb2">
            EXECUTIVE INTELLIGENCE
          </Badge>
          <h2>{summary?.headline ?? 'Conversion & Lead Vulnerability Assessment'}</h2>
          <p className="bannerSubtext">
            Audit snapshot for{' '}
            <strong>{latestAudit.website?.domain || 'Target Website'}</strong> • Evaluated on{' '}
            {new Date(latestAudit.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="bannerRight">
          <Link to={`/audits/${latestAudit.id}`} className="btn btn-primary">
            View Full Audit Dossier →
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid4 mb4">
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

        <MetricCard
          label="Estimated Monthly Loss"
          value={
            impact.estimatedOpportunityLoss !== undefined
              ? `₹${impact.estimatedOpportunityLoss.toLocaleString()}`
              : '₹0'
          }
          subtext="Potential monthly opportunity value at risk"
          badgeText={impact.confidence ? `${impact.confidence} Confidence` : undefined}
          badgeVariant="critical"
          highlight
        />

        <MetricCard
          label="At-Risk Leads / Month"
          value={impact.estimatedLostOpportunities !== undefined ? impact.estimatedLostOpportunities : 0}
          subtext="Lost inbound inquiries due to technical friction"
          badgeText="Conversion Friction"
          badgeVariant="high"
        />

        <MetricCard
          label="Active Websites"
          value={websites.length}
          subtext="Monitored web properties"
          badgeText="Healthy"
          badgeVariant="success"
        />
      </div>

      {/* Priority Action Engine (Requirement 18) */}
      <div className="dashboardSplit">
        <div className="splitMain">
          <Card className="sectionCard mb4">
            <div className="cardHeaderFlex">
              <div>
                <h3>Priority Remediation Engine</h3>
                <p className="cardDesc">
                  Ranked high-impact technical fixes prioritized by prospective lead recovery.
                </p>
              </div>
              <Badge variant="critical">
                {(latestAudit.findings ?? []).length} Detected Finding(s)
              </Badge>
            </div>

            <div className="priorityActionsList">
              {(latestAudit.findings ?? []).slice(0, 5).map((finding, idx) => (
                <div key={finding.id || idx} className="priorityActionItem">
                  <div className="actionRank">#{idx + 1}</div>
                  <div className="actionContent">
                    <div className="actionTitleRow">
                      <strong className="actionTitle">{finding.title}</strong>
                      <Badge
                        variant={
                          finding.severity === 'CRITICAL'
                            ? 'critical'
                            : finding.severity === 'HIGH'
                            ? 'high'
                            : 'medium'
                        }
                        size="sm"
                      >
                        {finding.severity}
                      </Badge>
                      <Badge variant="neutral" size="sm">
                        {finding.category}
                      </Badge>
                    </div>
                    <p className="actionDescription">{finding.description}</p>
                    <div className="actionFooter">
                      <span className="actionImpact">
                        <strong>Impact:</strong> {finding.businessImpact || 'Conversion drop-off'}
                      </span>
                      <span className="actionFix">
                        <strong>Remediation:</strong> {finding.recommendation}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {(latestAudit.findings ?? []).length === 0 && (
                <div className="cleanState">
                  <span>✅ No high-severity conversion blockers detected on latest audit.</span>
                </div>
              )}
            </div>
          </Card>

          {/* Model Assumptions & Transparency */}
          {impact.assumptions && impact.assumptions.length > 0 && (
            <Card className="assumptionsCard mb4">
              <div className="cardHeaderFlex">
                <h4>Calculation Methodology & Model Assumptions</h4>
                <Badge variant="neutral" size="sm">
                  Confidence: {impact.confidence}
                </Badge>
              </div>
              <ul className="assumptionsList">
                {impact.assumptions.map((asm, i) => (
                  <li key={i}>{asm}</li>
                ))}
              </ul>
              <small className="assumptionsDisclaimer">
                * Note: Model estimates prospective opportunity loss from observed technical drop-offs.
                Does not represent guaranteed financial statements.
              </small>
            </Card>
          )}
        </div>

        <div className="splitSide">
          {/* Recent Audits Card */}
          <Card className="sectionCard mb4">
            <div className="cardHeaderFlex">
              <h4>Recent Audits</h4>
              <Link to="/audits" className="btnLink">
                View All
              </Link>
            </div>
            <div className="recentAuditsList">
              {audits.slice(0, 5).map((a) => (
                <Link key={a.id} to={`/audits/${a.id}`} className="recentAuditItem">
                  <div className="auditItemLeft">
                    <span className="auditSiteName">{a.website?.name || 'Website'}</span>
                    <span className="auditDate">{new Date(a.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="auditItemRight">
                    <span
                      className={`auditBadge ${
                        a.status === 'COMPLETED' ? 'badge-success' : 'badge-warning'
                      }`}
                    >
                      {a.status}
                    </span>
                    {a.score && <span className="auditScoreTag">{a.score.overall}/100</span>}
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          {/* Pillar Score Explanations */}
          {scoreExplanation && (
            <Card className="sectionCard">
              <h4>Pillar Health Breakdown</h4>
              <div className="pillarExplList">
                <div className="pillarExplItem">
                  <div className="pillarExplHeader">
                    <span>Lead Capture ({scoreExplanation.pillars.lead.score}/100)</span>
                    <Badge variant={scoreExplanation.pillars.lead.score >= 80 ? 'success' : 'high'} size="sm">
                      {scoreExplanation.pillars.lead.deductions.length} deduction(s)
                    </Badge>
                  </div>
                </div>
                <div className="pillarExplItem">
                  <div className="pillarExplHeader">
                    <span>Ad Readiness ({scoreExplanation.pillars.advertising.score}/100)</span>
                    <Badge variant={scoreExplanation.pillars.advertising.score >= 80 ? 'success' : 'high'} size="sm">
                      {scoreExplanation.pillars.advertising.deductions.length} deduction(s)
                    </Badge>
                  </div>
                </div>
                <div className="pillarExplItem">
                  <div className="pillarExplHeader">
                    <span>SEO ({scoreExplanation.pillars.seo.score}/100)</span>
                    <Badge variant={scoreExplanation.pillars.seo.score >= 80 ? 'success' : 'high'} size="sm">
                      {scoreExplanation.pillars.seo.deductions.length} deduction(s)
                    </Badge>
                  </div>
                </div>
                <div className="pillarExplItem">
                  <div className="pillarExplHeader">
                    <span>Security & Trust ({scoreExplanation.pillars.security.score}/100)</span>
                    <Badge variant={scoreExplanation.pillars.security.score >= 80 ? 'success' : 'high'} size="sm">
                      {scoreExplanation.pillars.security.deductions.length} deduction(s)
                    </Badge>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
