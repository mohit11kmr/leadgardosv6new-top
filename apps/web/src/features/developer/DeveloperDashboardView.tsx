import React from 'react';
import { Link } from 'react-router-dom';

export function DeveloperDashboardView() {
  return (
    <div className="viewContainer">
      <div className="viewHeader">
        <div>
          <h1 className="viewTitle">Developer Platform & APIs</h1>
          <p className="viewSubtitle">
            Integrate LeadGuard OS V6 diagnostic audits, continuous monitoring, and webhooks into your custom applications.
          </p>
        </div>
        <div className="headerActions">
          <a
            href="/api/v1/public/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
          >
            📖 OpenAPI / Swagger Docs
          </a>
        </div>
      </div>

      <div className="statsGrid">
        <div className="statCard">
          <div className="statLabel">API Keys</div>
          <div className="statValue">🔑 Scoped Access</div>
          <div className="statSub">Granular RBAC credentials</div>
          <Link to="/developer/api-keys" className="btn btn-primary btn-sm mt-3">
            Manage Keys →
          </Link>
        </div>
        <div className="statCard">
          <div className="statLabel">Webhooks</div>
          <div className="statValue">⚡ Event Streams</div>
          <div className="statSub">HMAC-signed domain notifications</div>
          <Link to="/developer/webhooks" className="btn btn-primary btn-sm mt-3">
            Manage Webhooks →
          </Link>
        </div>
        <div className="statCard">
          <div className="statLabel">REST API Base</div>
          <div className="statValue text-sm font-mono">/api/v1/public/</div>
          <div className="statSub">Audits, Reports, Monitors</div>
          <a
            href="/api/v1/public/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm mt-3"
          >
            Interactive Docs →
          </a>
        </div>
      </div>

      <div className="contentSection mt-6">
        <h2 className="sectionTitle">Quickstart: Triggering Audits via API</h2>
        <div className="codeBox">
          <pre>{`curl -X POST https://api.leadguard.io/api/v1/public/audits \\
  -H "Authorization: Bearer lg_live_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com"}'`}</pre>
        </div>
      </div>

      <div className="contentSection mt-6">
        <h2 className="sectionTitle">Webhook Security & Signature Verification</h2>
        <p className="text-muted">
          All webhook payloads include the <code>X-LeadGuard-Signature</code> header containing an HMAC-SHA256 hash
          computed using your endpoint secret: <code>t=&lt;timestamp&gt;,v1=&lt;signature&gt;</code>.
        </p>
        <div className="codeBox">
          <pre>{`const crypto = require('crypto');
const expected = crypto
  .createHmac('sha256', process.env.WEBHOOK_SECRET)
  .update(timestamp + '.' + rawBody)
  .digest('hex');`}</pre>
        </div>
      </div>
    </div>
  );
}
