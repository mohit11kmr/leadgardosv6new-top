import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAudit, useAuditFindings, useAuditPages } from '../../hooks/useAudit.js';
import {
  useScoreExplanation,
  useExecutiveSummary,
  useRevenueScenarios,
  useFunnelSimulation,
  useWhatsAppOptimization,
} from '../../hooks/useIntelligence.js';
import { Tabs } from '../../components/ui/Tabs.js';
import { Card } from '../../components/ui/Card.js';
import { Badge } from '../../components/ui/Badge.js';
import { ScoreRing } from '../../components/ui/ScoreRing.js';
import { MetricCard } from '../../components/ui/MetricCard.js';
import { Button } from '../../components/ui/Button.js';
import { Input } from '../../components/ui/Input.js';
import { Skeleton, EmptyState, ErrorState } from '../../components/ui/States.js';

export function AuditDetailView() {
  const { id } = useParams<{ id: string }>();
  const { audit, isLoading, cancelAudit, isCancelling } = useAudit(id);

  const [activeTab, setActiveTab] = useState<
    'overview' | 'score' | 'scenarios' | 'funnel' | 'whatsapp' | 'findings' | 'pages' | 'telemetry'
  >('overview');

  // Findings Filters State
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [scopeFilter, setScopeFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  // Scenario / Funnel Simulation Inputs State
  const [monthlyVisitors, setMonthlyVisitors] = useState<number>(5000);
  const [conversionRate, setConversionRate] = useState<number>(2.5);
  const [averageLeadValue, setAverageLeadValue] = useState<number>(500);

  // Intelligence queries
  const { data: scoreExplanation } = useScoreExplanation(id);
  const { data: summary } = useExecutiveSummary(id);
  const { data: scenariosData, refetch: refetchScenarios } = useRevenueScenarios(id, {
    monthlyVisitors,
    conversionRate,
    averageLeadValue,
  });
  const { data: funnelData, refetch: refetchFunnel } = useFunnelSimulation(id, {
    monthlyVisitors,
    conversionRate,
  });
  const { data: whatsappOpt } = useWhatsAppOptimization(id);

  const { data: findingsData, isLoading: isFindingsLoading } = useAuditFindings(id, {
    severity: severityFilter,
    category: categoryFilter,
    scope: scopeFilter,
    search: searchQuery,
    cursor,
    limit: 25,
  });

  const { data: pagesData, isLoading: isPagesLoading } = useAuditPages(id);

  if (isLoading) {
    return (
      <div className="pageContainer">
        <Skeleton height="50px" className="mb4" />
        <Skeleton height="350px" />
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="pageContainer">
        <EmptyState
          title="Audit Dossier Not Found"
          description="The requested audit does not exist or you do not have permission to view it."
          actionText="Back to Dashboard"
          onAction={() => {
            window.location.href = '/dashboard';
          }}
        />
      </div>
    );
  }

  const isRunning = audit.status === 'QUEUED' || audit.status === 'RUNNING';

  const tabsList = [
    { id: 'overview', label: 'Overview' },
    { id: 'score', label: 'Score & Deductions' },
    { id: 'scenarios', label: 'Revenue Scenarios' },
    { id: 'funnel', label: 'Funnel Simulator' },
    { id: 'whatsapp', label: 'WhatsApp Optimizer (LG-002)' },
    { id: 'findings', label: 'Findings', count: (audit.findings ?? []).length },
    { id: 'pages', label: 'Pages', count: pagesData?.length ?? 0 },
    { id: 'telemetry', label: 'Audit Telemetry' },
  ];

  return (
    <div className="pageContainer">
      {/* Header */}
      <div className="pageHeader">
        <div>
          <div className="breadcrumbs">
            <Link to="/audits">Audits</Link> / <span>{audit.id.slice(0, 8)}...</span>
          </div>
          <div className="titleWithStatus">
            <h1>{audit.website?.name || 'Audit Dossier'}</h1>
            <Badge
              variant={
                audit.status === 'COMPLETED'
                  ? 'success'
                  : audit.status === 'RUNNING' || audit.status === 'QUEUED'
                  ? 'info'
                  : 'critical'
              }
            >
              {audit.status}
            </Badge>
          </div>
          <p className="pageSubtext">
            {audit.website?.url} • Executed {new Date(audit.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="headerActions">
          {isRunning && (
            <Button
              variant="danger"
              size="sm"
              isLoading={isCancelling}
              onClick={async () => {
                await cancelAudit();
              }}
            >
              Cancel Audit
            </Button>
          )}
        </div>
      </div>

      {/* Running Progress Bar */}
      {isRunning && (
        <Card className="runningProgressCard mb4">
          <div className="progressFlex">
            <div>
              <strong>Audit In Progress ({audit.progress}%)</strong>
              <p className="textMuted">Stage: {audit.progressStage || 'Analyzing website components...'}</p>
            </div>
            <span className="btnSpinner" />
          </div>
          <div className="progressBarContainer">
            <div className="progressBarFill" style={{ width: `${audit.progress}%` }} />
          </div>
        </Card>
      )}

      {/* Tabs Navigation */}
      <Tabs
        tabs={tabsList}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as typeof activeTab)}
        className="mb4"
      />

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="tabContent">
          {summary && (
            <div className="executiveBanner mb4">
              <div>
                <Badge variant="high" size="sm" className="mb2">
                  EXECUTIVE SUMMARY
                </Badge>
                <h3>{summary.headline}</h3>
                <p className="bannerSubtext">
                  Confidence Rating: <strong>{summary.confidence}</strong> • Top Issue:{' '}
                  {summary.topProblems[0] || 'None'}
                </p>
              </div>
            </div>
          )}

          <div className="grid4 mb4">
            <Card className="scoreOverviewCard">
              <ScoreRing score={audit.score?.overall ?? 0} label="LEAD HEALTH" size="md" />
              <div className="scorePillarsSummary">
                <div className="pillarTiny">
                  <span>Lead</span>
                  <strong>{audit.score?.lead ?? 0}</strong>
                </div>
                <div className="pillarTiny">
                  <span>Ads</span>
                  <strong>{audit.score?.advertising ?? 0}</strong>
                </div>
                <div className="pillarTiny">
                  <span>SEO</span>
                  <strong>{audit.score?.seo ?? 0}</strong>
                </div>
                <div className="pillarTiny">
                  <span>Security</span>
                  <strong>{audit.score?.security ?? 0}</strong>
                </div>
              </div>
            </Card>

            <MetricCard
              label="Potential Opportunity Loss"
              value={
                (audit.businessImpact as { estimatedOpportunityLoss?: number })
                  ?.estimatedOpportunityLoss !== undefined
                  ? `₹${(
                      audit.businessImpact as { estimatedOpportunityLoss: number }
                    ).estimatedOpportunityLoss.toLocaleString()}`
                  : '₹0'
              }
              subtext="Projected monthly lost opportunity value"
              badgeVariant="critical"
              highlight
            />

            <MetricCard
              label="Critical & High Findings"
              value={
                (audit.findings ?? []).filter(
                  (f) => f.severity === 'CRITICAL' || f.severity === 'HIGH'
                ).length
              }
              subtext="Immediate conversion risks"
              badgeText="Action Required"
              badgeVariant="high"
            />

            <MetricCard
              label="Pages Scanned"
              value={audit.pagesScanned || pagesData?.length || 1}
              subtext="Internal crawl surface"
              badgeText="Deep Diagnostic"
              badgeVariant="neutral"
            />
          </div>

          {/* Quick Priority Fixes */}
          <Card className="sectionCard">
            <div className="cardHeaderFlex">
              <h3>Top Remediation Actions</h3>
              <button
                type="button"
                className="btnLink"
                onClick={() => setActiveTab('findings')}
              >
                View all {(audit.findings ?? []).length} findings →
              </button>
            </div>
            <div className="priorityActionsList">
              {(audit.findings ?? []).slice(0, 4).map((finding, idx) => (
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
                        <strong>Impact:</strong> {finding.businessImpact || 'Conversion friction'}
                      </span>
                      <span className="actionFix">
                        <strong>Fix:</strong> {finding.recommendation}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* TAB 2: SCORE & DEDUCTIONS */}
      {activeTab === 'score' && (
        <div className="tabContent">
          {scoreExplanation ? (
            <div className="scoreExplanationContainer">
              <div className="pillarsGrid mb4">
                {(['lead', 'advertising', 'seo', 'security'] as const).map((pillarKey) => {
                  const pillar = scoreExplanation.pillars[pillarKey];
                  const labelMap = {
                    lead: 'Lead Capture & Conversion',
                    advertising: 'Advertising & Campaign Readiness',
                    seo: 'SEO & Organic Indexation',
                    security: 'Security & Visitor Trust',
                  };
                  return (
                    <Card key={pillarKey} className="pillarCard">
                      <div className="pillarCardHeader">
                        <div>
                          <h4>{labelMap[pillarKey]}</h4>
                          <span className="pillarScoreLarge">{pillar.score} / 100</span>
                        </div>
                        <Badge
                          variant={
                            pillar.score >= 80 ? 'success' : pillar.score >= 60 ? 'medium' : 'critical'
                          }
                        >
                          {pillar.score >= 80 ? 'Good' : pillar.score >= 60 ? 'Fair' : 'Poor'}
                        </Badge>
                      </div>

                      <div className="deductionsHeader">
                        <span>Deductions Applied ({pillar.deductions.length})</span>
                      </div>
                      <div className="deductionsList">
                        {pillar.deductions.map((ded, i) => (
                          <div key={i} className="deductionItem">
                            <div className="deductionLeft">
                              <span className="deductionTitle">{ded.title}</span>
                              <span className="deductionPolicy">Policy: {ded.policy}</span>
                            </div>
                            <span className="deductionPenalty">-{ded.penalty} pts</span>
                          </div>
                        ))}
                        {pillar.deductions.length === 0 && (
                          <span className="textMuted py2">No score deductions applied to this pillar.</span>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ) : (
            <Skeleton height="300px" />
          )}
        </div>
      )}

      {/* TAB 3: REVENUE SCENARIOS (Requirement 14) */}
      {activeTab === 'scenarios' && (
        <div className="tabContent">
          <Card className="scenarioInputsCard mb4">
            <h4>Revenue Model Assumptions & Traffic Simulator</h4>
            <div className="grid3 mt3">
              <Input
                label="Monthly Visitors"
                type="number"
                value={monthlyVisitors}
                onChange={(e) => setMonthlyVisitors(Number(e.target.value) || 0)}
              />
              <Input
                label="Baseline Conversion Rate (%)"
                type="number"
                step="0.1"
                value={conversionRate}
                onChange={(e) => setConversionRate(Number(e.target.value) || 0)}
              />
              <Input
                label="Average Lead Value (₹)"
                type="number"
                value={averageLeadValue}
                onChange={(e) => setAverageLeadValue(Number(e.target.value) || 0)}
              />
            </div>
          </Card>

          {scenariosData && (
            <div className="scenariosGrid">
              {scenariosData.scenarios.map((sc) => (
                <Card
                  key={sc.slug}
                  className={`scenarioCard ${sc.slug === 'target' ? 'card-highlight' : ''}`}
                >
                  <div className="scenarioHeader">
                    <span className="scenarioSlug">{sc.slug.toUpperCase()}</span>
                    <h3>{sc.name}</h3>
                    <p className="scenarioDesc">{sc.description}</p>
                  </div>

                  <div className="scenarioMetrics">
                    <div className="metricRow">
                      <span>Effective Conv. Rate:</span>
                      <strong>{sc.conversionRate}%</strong>
                    </div>
                    <div className="metricRow">
                      <span>Est. Monthly Leads:</span>
                      <strong>{sc.estimatedMonthlyLeads} leads</strong>
                    </div>
                    <div className="metricRow highlightRow">
                      <span>Est. Monthly Value:</span>
                      <strong>₹{sc.estimatedMonthlyValue.toLocaleString()}</strong>
                    </div>
                    {sc.recoveredValuePerMonth > 0 && (
                      <div className="recoveredRow">
                        <span>Recovered Value:</span>
                        <strong className="textSuccess">
                          +₹{sc.recoveredValuePerMonth.toLocaleString()} / mo (+{sc.changeVsCurrentPercent}%)
                        </strong>
                      </div>
                    )}
                  </div>

                  <div className="scenarioAssumptions">
                    <small className="textMuted">Assumptions:</small>
                    <ul>
                      {sc.assumptions.map((asm, idx) => (
                        <li key={idx}>{asm}</li>
                      ))}
                    </ul>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: FUNNEL SIMULATOR (Requirement 15) */}
      {activeTab === 'funnel' && (
        <div className="tabContent">
          {funnelData ? (
            <div className="funnelContainer">
              <div className="funnelSummary mb4">
                <h4>Pipeline Drop-off Simulation</h4>
                <p>{funnelData.summary}</p>
              </div>

              <div className="funnelStagesList">
                {funnelData.stages.map((stage, idx) => (
                  <Card key={stage.stage} className="funnelStageCard mb3">
                    <div className="funnelStageHeader">
                      <div className="stageTitleRow">
                        <span className="stageIndex">Stage {idx + 1}</span>
                        <h4>{stage.label}</h4>
                      </div>
                      <div className="stageVisitorsBadge">
                        <strong>{stage.retainedVisitors.toLocaleString()}</strong> visitors retained
                      </div>
                    </div>
                    <p className="stageDesc">{stage.description}</p>

                    <div className="stageStats">
                      <div className="stageStatItem">
                        <span>Inflow:</span>
                        <strong>{stage.inflowVisitors.toLocaleString()}</strong>
                      </div>
                      <div className="stageStatItem">
                        <span>Drop-off Rate:</span>
                        <strong className={stage.dropoffPercent > 30 ? 'textDanger' : ''}>
                          {stage.dropoffPercent}%
                        </strong>
                      </div>
                      <div className="stageStatItem">
                        <span>Leaked Visitors:</span>
                        <strong className="textMuted">{stage.leakedVisitors.toLocaleString()}</strong>
                      </div>
                    </div>

                    {stage.technicalFrictionPoints.length > 0 && (
                      <div className="stageFrictionPoints">
                        <span className="frictionLabel">Identified Technical Friction:</span>
                        <div className="frictionTags">
                          {stage.technicalFrictionPoints.map((point, pIdx) => (
                            <Badge key={pIdx} variant="critical" size="sm">
                              {point}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <Skeleton height="300px" />
          )}
        </div>
      )}

      {/* TAB 5: ZERO-INTENT WHATSAPP OPTIMIZER (LG-002) (Requirement 16) */}
      {activeTab === 'whatsapp' && (
        <div className="tabContent">
          {whatsappOpt ? (
            <div className="whatsappOptimizerContainer">
              <div className="waScoreBanner mb4">
                <div className="waBannerLeft">
                  <Badge variant="high" size="sm" className="mb2">
                    LG-002 OPTIMIZER
                  </Badge>
                  <h2>WhatsApp CTA & Intent Health: {whatsappOpt.overallScore} / 100</h2>
                  <p>
                    Analyzed {whatsappOpt.detectedLinksCount} WhatsApp link(s) across intent, phone
                    quality, CTA clarity, and mobile deep-linking.
                  </p>
                </div>
                <ScoreRing score={whatsappOpt.overallScore} label="WA HEALTH" size="md" />
              </div>

              <div className="grid2 mb4">
                <Card className="waDimCard">
                  <div className="waDimHeader">
                    <h4>1. Destination Phone Number Quality</h4>
                    <span className="waDimScore">{whatsappOpt.dimensions.phoneQuality.score}/100</span>
                  </div>
                  <p className="waDimDetails">{whatsappOpt.dimensions.phoneQuality.details}</p>
                  <ul className="waDimRecs">
                    {whatsappOpt.dimensions.phoneQuality.recommendations.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </Card>

                <Card className="waDimCard">
                  <div className="waDimHeader">
                    <h4>2. Intent & Prefilled Message Quality</h4>
                    <span className="waDimScore">{whatsappOpt.dimensions.intentQuality.score}/100</span>
                  </div>
                  <p className="waDimDetails">{whatsappOpt.dimensions.intentQuality.details}</p>
                  <ul className="waDimRecs">
                    {whatsappOpt.dimensions.intentQuality.recommendations.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </Card>

                <Card className="waDimCard">
                  <div className="waDimHeader">
                    <h4>3. CTA Prominence & Context</h4>
                    <span className="waDimScore">{whatsappOpt.dimensions.ctaQuality.score}/100</span>
                  </div>
                  <p className="waDimDetails">{whatsappOpt.dimensions.ctaQuality.details}</p>
                  <ul className="waDimRecs">
                    {whatsappOpt.dimensions.ctaQuality.recommendations.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </Card>

                <Card className="waDimCard">
                  <div className="waDimHeader">
                    <h4>4. Mobile & Desktop Deep-Link Compatibility</h4>
                    <span className="waDimScore">{whatsappOpt.dimensions.mobileUsability.score}/100</span>
                  </div>
                  <p className="waDimDetails">{whatsappOpt.dimensions.mobileUsability.details}</p>
                  <ul className="waDimRecs">
                    {whatsappOpt.dimensions.mobileUsability.recommendations.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </Card>
              </div>

              <Card className="sectionCard">
                <h4>Top Recommendations for WhatsApp Conversion Velocity</h4>
                <ul className="recommendationsList">
                  {whatsappOpt.topRecommendations.map((rec, idx) => (
                    <li key={idx}>
                      <span className="recBullet">⚡</span> {rec}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          ) : (
            <Skeleton height="300px" />
          )}
        </div>
      )}

      {/* TAB 6: FINDINGS EXPLORER (Requirement 20) */}
      {activeTab === 'findings' && (
        <div className="tabContent">
          {/* Filters Row */}
          <Card className="filtersCard mb4">
            <div className="filtersGrid">
              <div className="filterItem">
                <label>Category</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="filterSelect"
                >
                  <option value="ALL">All Categories</option>
                  <option value="LEAD">Lead Capture</option>
                  <option value="ADVERTISING">Advertising</option>
                  <option value="SEO">SEO</option>
                  <option value="SECURITY">Security</option>
                </select>
              </div>

              <div className="filterItem">
                <label>Severity</label>
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="filterSelect"
                >
                  <option value="ALL">All Severities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>

              <div className="filterItem">
                <label>Scope</label>
                <select
                  value={scopeFilter}
                  onChange={(e) => setScopeFilter(e.target.value)}
                  className="filterSelect"
                >
                  <option value="ALL">All Scopes</option>
                  <option value="PAGE">Page</option>
                  <option value="WEBSITE">Website</option>
                  <option value="AUDIT">Audit</option>
                </select>
              </div>

              <div className="filterItem">
                <label>Search</label>
                <input
                  type="text"
                  placeholder="Search finding titles, recommendations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="filterInput"
                />
              </div>
            </div>
          </Card>

          {/* Findings Table */}
          {isFindingsLoading ? (
            <Skeleton height="200px" />
          ) : (
            <Card className="tableCard">
              <table className="dataTable">
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Rule / Key</th>
                    <th>Finding Title</th>
                    <th>Category</th>
                    <th>Scope</th>
                    <th>Deduction</th>
                  </tr>
                </thead>
                <tbody>
                  {(findingsData?.data ?? []).map((f) => (
                    <tr key={f.id}>
                      <td>
                        <Badge
                          variant={
                            f.severity === 'CRITICAL'
                              ? 'critical'
                              : f.severity === 'HIGH'
                              ? 'high'
                              : f.severity === 'MEDIUM'
                              ? 'medium'
                              : 'low'
                          }
                          size="sm"
                        >
                          {f.severity}
                        </Badge>
                      </td>
                      <td>
                        <code className="ruleBadge">{f.ruleId}</code>
                        {f.normalizedIssueKey && (
                          <span className="issueKeyTag">{f.normalizedIssueKey}</span>
                        )}
                      </td>
                      <td>
                        <strong>{f.title}</strong>
                        <p className="tableDescText">{f.description}</p>
                        {f.recommendation && (
                          <p className="tableFixText">
                            <strong>Fix:</strong> {f.recommendation}
                          </p>
                        )}
                      </td>
                      <td>
                        <Badge variant="neutral" size="sm">
                          {f.category}
                        </Badge>
                      </td>
                      <td>
                        <span className="scopeTag">{f.scope}</span>
                      </td>
                      <td>
                        <span className="textDanger">-{f.scoreImpact} pts</span>
                      </td>
                    </tr>
                  ))}
                  {(findingsData?.data ?? []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="textCenter py4 textMuted">
                        No findings matching the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {findingsData?.meta?.hasNextPage && (
                <div className="paginationFooter">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCursor(findingsData.meta.nextCursor || undefined)}
                  >
                    Load Next Page →
                  </Button>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* TAB 7: PAGE EXPLORER (Requirement 21) */}
      {activeTab === 'pages' && (
        <div className="tabContent">
          {isPagesLoading ? (
            <Skeleton height="200px" />
          ) : (
            <Card className="tableCard">
              <table className="dataTable">
                <thead>
                  <tr>
                    <th>Page URL</th>
                    <th>Status</th>
                    <th>Depth</th>
                    <th>Response Time</th>
                    <th>Content Type</th>
                    <th>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {(pagesData ?? []).map((page) => (
                    <tr key={page.id}>
                      <td>
                        <a
                          href={page.url}
                          target="_blank"
                          rel="noreferrer"
                          className="tableExternalUrl"
                        >
                          {page.url} ↗
                        </a>
                      </td>
                      <td>
                        <Badge
                          variant={
                            page.statusCode && page.statusCode < 400 ? 'success' : 'critical'
                          }
                          size="sm"
                        >
                          {page.statusCode ?? 'ERR'}
                        </Badge>
                      </td>
                      <td>Depth {page.depth}</td>
                      <td>{page.responseTimeMs ? `${page.responseTimeMs}ms` : '-'}</td>
                      <td>{page.contentType || '-'}</td>
                      <td>
                        {page.errorCode ? (
                          <Badge variant="critical" size="sm">
                            {page.errorCode}
                          </Badge>
                        ) : (
                          <span className="textMuted">None</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(pagesData ?? []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="textCenter py4 textMuted">
                        No crawled pages recorded for this audit.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {/* TAB 8: AUDIT TELEMETRY (Requirement 22) */}
      {activeTab === 'telemetry' && (
        <div className="tabContent">
          {audit.telemetry ? (
            <div className="telemetryContainer">
              <div className="grid4 mb4">
                <MetricCard
                  label="Total Duration"
                  value={`${audit.telemetry.totalDurationMs ?? 0}ms`}
                  subtext="End-to-end execution time"
                  badgeVariant="neutral"
                />
                <MetricCard
                  label="Crawl Duration"
                  value={`${audit.telemetry.crawlDurationMs ?? 0}ms`}
                  subtext="Concurrent page discovery"
                  badgeVariant="neutral"
                />
                <MetricCard
                  label="Scan Duration"
                  value={`${audit.telemetry.scanDurationMs ?? 0}ms`}
                  subtext="Diagnostic scanner execution"
                  badgeVariant="neutral"
                />
                <MetricCard
                  label="Aggregation & Score"
                  value={`${
                    (audit.telemetry.aggregationDurationMs ?? 0) +
                    (audit.telemetry.scoreDurationMs ?? 0)
                  }ms`}
                  subtext="Pillars & risk scoring"
                  badgeVariant="neutral"
                />
              </div>

              <Card className="sectionCard">
                <h4>Granular Telemetry Timings</h4>
                <div className="telemetryTimingsList">
                  <div className="timingRow">
                    <span>Queue Wait Time:</span>
                    <strong>{audit.telemetry.queueWaitMs ?? 0} ms</strong>
                  </div>
                  <div className="timingRow">
                    <span>Crawl Scheduler Duration:</span>
                    <strong>{audit.telemetry.crawlDurationMs ?? 0} ms</strong>
                  </div>
                  <div className="timingRow">
                    <span>HTTP Fetch Duration:</span>
                    <strong>{audit.telemetry.fetchDurationMs ?? 0} ms</strong>
                  </div>
                  <div className="timingRow">
                    <span>Diagnostic Scan Duration:</span>
                    <strong>{audit.telemetry.scanDurationMs ?? 0} ms</strong>
                  </div>
                  <div className="timingRow">
                    <span>Signal Aggregation Duration:</span>
                    <strong>{audit.telemetry.aggregationDurationMs ?? 0} ms</strong>
                  </div>
                  <div className="timingRow">
                    <span>Scoring V3 Engine Duration:</span>
                    <strong>{audit.telemetry.scoreDurationMs ?? 0} ms</strong>
                  </div>
                  <div className="timingRow">
                    <span>Finalization & Transaction Duration:</span>
                    <strong>{audit.telemetry.finalizationDurationMs ?? 0} ms</strong>
                  </div>
                </div>
              </Card>
            </div>
          ) : (
            <EmptyState
              title="No Telemetry Data Available"
              description="Detailed performance telemetry was not recorded for this legacy audit run."
            />
          )}
        </div>
      )}
    </div>
  );
}
