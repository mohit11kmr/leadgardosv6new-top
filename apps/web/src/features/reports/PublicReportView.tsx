import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

export function PublicReportView() {
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState('');
  const [submittedPassword, setSubmittedPassword] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['public-report', token, submittedPassword],
    queryFn: async () => {
      const base = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1';
      const url = new URL(`${base}/reports/share/${token}`);
      if (submittedPassword) {
        url.searchParams.set('password', submittedPassword);
      }
      const res = await fetch(url.toString());
      const body = await res.json();
      if (!res.ok || !body.success) {
        const err = new Error(body.error?.message || 'Failed to load report');
        (err as any).code = body.error?.code;
        throw err;
      }
      return body.data;
    },
    retry: false,
    enabled: Boolean(token),
  });

  const isPasswordRequired = (error as any)?.code === 'PASSWORD_REQUIRED' || (error as any)?.code === 'INVALID_PASSWORD';

  if (isLoading) {
    return (
      <div className="publicReportLayout">
        <div className="publicReportCard loadingState">
          <div className="spinner" />
          <p>Decrypting Diagnostic Audit Snapshot...</p>
        </div>
      </div>
    );
  }

  if (isPasswordRequired) {
    return (
      <div className="publicReportLayout">
        <div className="publicReportCard passwordModal">
          <div className="brandBadge">🔒 Password Protected Report</div>
          <h2>Enter Password to Access Report</h2>
          <p className="text-muted">This diagnostic snapshot is encrypted and protected by the author.</p>
          {(error as any)?.code === 'INVALID_PASSWORD' && (
            <div className="errorBanner">Incorrect password. Please try again.</div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSubmittedPassword(password);
            }}
            className="space-y-4 mt-4"
          >
            <input
              type="password"
              className="formInput"
              placeholder="Enter password..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
            />
            <button type="submit" className="btn btn-primary w-full">
              Unlock Report Snapshot
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="publicReportLayout">
        <div className="publicReportCard errorState">
          <h2>Report Unavailable</h2>
          <p className="text-muted">{(error as Error)?.message || 'This share link has expired or been revoked.'}</p>
        </div>
      </div>
    );
  }

  const snapshot = data.snapshot || {};
  const branding = snapshot.branding || { companyName: 'LeadGuard OS' };
  const score = snapshot.score || { overall: 70, lead: 70, advertising: 70, seo: 70, security: 70 };
  const findings = snapshot.findings || [];

  return (
    <div className="publicReportLayout">
      <div className="publicReportHeader">
        <div className="container">
          <div className="flex justify-between items-center">
            <div className="brandTitle font-bold text-xl">{branding.companyName}</div>
            <div className="badge badge-success">Verified Diagnostic Snapshot</div>
          </div>
        </div>
      </div>

      <div className="container publicReportBody">
        <div className="publicHero">
          <h1 className="heroTitle">{data.title}</h1>
          <p className="heroSubtitle">
            Diagnostic Health Evaluation for <strong>{snapshot.website?.url}</strong>
          </p>
          <p className="text-muted text-sm">Generated: {new Date(data.generatedAt).toLocaleDateString()}</p>
        </div>

        {/* Score Card */}
        <div className="publicScoreCard">
          <div className="scoreCircle">
            <div className="scoreNumber">{score.overall}</div>
            <div className="scoreMax">/ 100</div>
          </div>
          <div className="scoreDetails">
            <h3>Overall Conversion Health Score</h3>
            <p className="text-muted">
              Based on comprehensive evaluation of inbound lead capture forms, pixel telemetry, SEO readiness, and security TLS.
            </p>
            <div className="scoreSubGrid">
              <div>
                <strong>{score.lead}/100</strong>
                <span>Lead Capture</span>
              </div>
              <div>
                <strong>{score.advertising}/100</strong>
                <span>Advertising</span>
              </div>
              <div>
                <strong>{score.seo}/100</strong>
                <span>SEO</span>
              </div>
              <div>
                <strong>{score.security}/100</strong>
                <span>Security</span>
              </div>
            </div>
          </div>
        </div>

        {/* Prioritized Actionable Recommendations */}
        <div className="publicFindingsSection">
          <h2>Key Findings & Recommended Actions ({findings.length})</h2>
          <div className="findingsList">
            {findings.map((f: any, idx: number) => (
              <div key={f.id || idx} className="findingCard">
                <div className="findingHeader">
                  <span className={`badge ${f.severity === 'CRITICAL' ? 'badge-error' : 'badge-warning'}`}>
                    {f.severity}
                  </span>
                  <span className="findingCategory">{f.category}</span>
                  <span className="findingImpact">-{f.scoreImpact} pts</span>
                </div>
                <h4 className="findingTitle">{f.title}</h4>
                <p className="findingDesc">{f.description}</p>
                <div className="recommendationBox">
                  <strong>Recommended Fix:</strong> {f.recommendation}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="publicReportFooter">
          <p>{branding.footerText || `Delivered by ${branding.companyName} Diagnostic Intelligence.`}</p>
        </div>
      </div>
    </div>
  );
}
