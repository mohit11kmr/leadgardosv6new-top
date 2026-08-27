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
      <div className="p-8">
        <div className="card">Loading Agency Platform metrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="card errorBanner">{error}</div>
      </div>
    );
  }

  return (
    <div className="agencyDashboard p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Agency Command Center</h1>
          <p className="text-slate-500">Client workspaces, 500-site prospect hunter, and AI intelligence</p>
        </div>
        <div className="flex gap-3">
          <Link to="/agency/prospects" className="btn btn-primary">
            🎯 Prospect Hunter
          </Link>
          <Link to="/agency/clients" className="btn btn-secondary">
            🏢 Manage Clients
          </Link>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-4 gap-4">
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
      <div className="grid grid-cols-3 gap-6">
        <div className="card space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-800">🎯 500-Site Prospect Hunter</h3>
            <span className="badge badge-indigo">{metrics?.campaigns ?? 0} campaigns</span>
          </div>
          <p className="text-sm text-slate-600">
            Batch-scan hundreds of local and niche business websites. Identify severe conversion flaws and rank qualified leads automatically.
          </p>
          <Link to="/agency/prospects" className="btn btn-sm btn-outline w-full text-center">
            Open Prospect Hunter
          </Link>
        </div>

        <div className="card space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-800">📡 Diagnostic Studio Widgets</h3>
            <span className="badge badge-emerald">{metrics?.widgets ?? 0} active</span>
          </div>
          <p className="text-sm text-slate-600">
            Embed high-converting website audit forms on your agency site. Capture inbound business leads directly into LeadGuard.
          </p>
          <Link to="/agency/widgets" className="btn btn-sm btn-outline w-full text-center">
            Configure Widgets
          </Link>
        </div>

        <div className="card space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-800">⚔️ Competitive Weakness Radar</h3>
            <span className="badge badge-purple">{metrics?.competitors ?? 0} benchmarks</span>
          </div>
          <p className="text-sm text-slate-600">
            Compare client domains against direct competitors on speed, WhatsApp lead capture, and technical conversion readiness.
          </p>
          <Link to="/agency/competitors" className="btn btn-sm btn-outline w-full text-center">
            Launch Radar
          </Link>
        </div>
      </div>
    </div>
  );
}
