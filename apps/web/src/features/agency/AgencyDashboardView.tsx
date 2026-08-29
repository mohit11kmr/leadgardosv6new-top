import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { agencyApi, type AgencyMetrics } from '../../api/agency.js';

export function AgencyDashboardView() {
  const [metrics, setMetrics] = useState<AgencyMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    agencyApi
      .getOverview()
      .then((data) => {
        setMetrics(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load agency metrics');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="pageContainer">
        <div className="card">Loading Agency Platform metrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pageContainer">
        <div className="card errorBanner">{error}</div>
      </div>
    );
  }

  return (
    <div className="pageContainer">
      <div className="pageHeader">
        <div>
          <h1>Agency Command Center</h1>
          <p>Client workspaces, 500-site prospect hunter, and AI intelligence</p>
        </div>
        <div className="flexRow gap3">
          <Link to="/agency/prospects" className="btn btn-primary">
            🎯 Prospect Hunter
          </Link>
          <Link to="/agency/clients" className="btn btn-secondary">
            🏢 Manage Clients
          </Link>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid4">
        <div className="metricCard card">
          <div className="metricLabel">Active Clients</div>
          <div className="metricValue">{metrics?.clients ?? 0}</div>
          <Link to="/agency/clients" className="metricLink">View workspaces →</Link>
        </div>

        <div className="metricCard card">
          <div className="metricLabel">Monitored Websites</div>
          <div className="metricValue">{metrics?.websites ?? 0}</div>
          <span className="metricSubtext">Across all client accounts</span>
        </div>

        <div className="metricCard card">
          <div className="metricLabel">Prospects Discovered</div>
          <div className="metricValue">{metrics?.prospects ?? 0}</div>
          <span className="metricSubtext">{metrics?.qualifiedProspects ?? 0} qualified leads</span>
        </div>

        <div className="metricCard card highlight">
          <div className="metricLabel">Pipeline Opportunity</div>
          <div className="metricValue">₹{((metrics?.estimatedPipelineOpportunityInr ?? 0) / 1000).toFixed(1)}k</div>
          <span className="metricSubtext">Estimated conversion value</span>
        </div>
      </div>

      {/* Secondary Modules Grid */}
      <div className="grid3">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="flexBetween">
            <h3 className="fontBold textPrimary">🎯 500-Site Prospect Hunter</h3>
            <span className="badge badge-info">{metrics?.campaigns ?? 0} campaigns</span>
          </div>
          <p className="textSm textSecondary">
            Batch-scan hundreds of local and niche business websites. Identify severe conversion flaws and rank qualified leads automatically.
          </p>
          <Link to="/agency/prospects" className="btn btn-sm btn-outline wFull textCenter">
            Open Prospect Hunter
          </Link>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="flexBetween">
            <h3 className="fontBold textPrimary">📡 Diagnostic Studio Widgets</h3>
            <span className="badge badge-success">{metrics?.widgets ?? 0} active</span>
          </div>
          <p className="textSm textSecondary">
            Embed high-converting website audit forms on your agency site. Capture inbound business leads directly into LeadGuard.
          </p>
          <Link to="/agency/widgets" className="btn btn-sm btn-outline wFull textCenter">
            Configure Widgets
          </Link>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="flexBetween">
            <h3 className="fontBold textPrimary">⚔️ Competitive Weakness Radar</h3>
            <span className="badge badge-purple">{metrics?.competitors ?? 0} benchmarks</span>
          </div>
          <p className="textSm textSecondary">
            Compare client domains against direct competitors on speed, WhatsApp lead capture, and technical conversion readiness.
          </p>
          <Link to="/agency/competitors" className="btn btn-sm btn-outline wFull textCenter">
            Launch Radar
          </Link>
        </div>
      </div>
    </div>
  );
}
