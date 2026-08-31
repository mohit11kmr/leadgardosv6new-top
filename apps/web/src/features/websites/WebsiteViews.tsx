import React, { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useWebsites, useWebsite } from '../../hooks/useWebsites.js';
import { useAudit } from '../../hooks/useAudit.js';
import { Button } from '../../components/ui/Button.js';
import { Modal } from '../../components/ui/Modal.js';
import { Input } from '../../components/ui/Input.js';
import { Badge } from '../../components/ui/Badge.js';
import { Card } from '../../components/ui/Card.js';
import { EmptyState, Skeleton } from '../../components/ui/States.js';
import { IconWebsites, IconAudits, IconExternalLink, IconPlus, IconArrowRight, IconShield } from '../../components/ui/Icons.js';
export function WebsiteListView() {
  const navigate = useNavigate();
  const { websites, isLoading, createWebsite, isCreating } = useWebsites();
  const { startAudit, isStarting } = useAudit(undefined);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [startingWebsiteId, setStartingWebsiteId] = useState<string | null>(null);

  const handleAddWebsite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await createWebsite({ name, url });
      setIsAddOpen(false);
      setName('');
      setUrl('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add website');
    }
  };

  const handleTriggerAudit = async (websiteId: string) => {
    setStartingWebsiteId(websiteId);
    try {
      const newAudit = await startAudit({ websiteId });
      navigate(`/audits/${newAudit.id}`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to trigger audit');
    } finally {
      setStartingWebsiteId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="pageContainer">
        <Skeleton height="50px" className="mb4" />
        <Skeleton height="200px" />
      </div>
    );
  }

  return (
    <div className="pageContainer">
      <div className="pageHeader">
        <div>
          <h1>Website Management</h1>
          <p>Monitor conversion integrity and run deep diagnostics across registered domains.</p>
        </div>
        <Button variant="primary" onClick={() => setIsAddOpen(true)}>
          <IconPlus size={16} /> Add Website
        </Button>
      </div>

      {websites.length === 0 ? (
        <EmptyState
          title="No Websites Configured"
          description="Register your first website to start running diagnostic scans."
          actionText="Add Website"
          onAction={() => setIsAddOpen(true)}
          icon={<IconWebsites size={40} color="#38bdf8" />}
        />
      ) : (
        <Card className="tableCard">
          <table className="dataTable">
            <thead>
              <tr>
                <th>Website Name</th>
                <th>Target URL</th>
                <th>Status</th>
                <th>Latest Score</th>
                <th>Audit Actions</th>
              </tr>
            </thead>
            <tbody>
              {websites.map((site) => {
                const latestAudit = site.audits?.[0];
                return (
                  <tr key={site.id}>
                    <td>
                      <Link to={`/websites/${site.id}`} className="tableNameLink">
                        {site.name}
                      </Link>
                    </td>
                    <td>
                      <a
                        href={site.url}
                        target="_blank"
                        rel="noreferrer"
                        className="tableExternalUrl"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        {site.url} <IconExternalLink size={12} />
                      </a>
                    </td>
                    <td>
                      <Badge variant={site.status === 'ACTIVE' ? 'success' : 'neutral'} size="sm">
                        {site.status}
                      </Badge>
                    </td>
                    <td>
                      {latestAudit?.score ? (
                        <span
                          className={`scoreBadge ${
                            latestAudit.score.overall >= 80
                              ? 'score-green'
                              : latestAudit.score.overall >= 60
                              ? 'score-yellow'
                              : 'score-red'
                          }`}
                        >
                          {latestAudit.score.overall}/100
                        </span>
                      ) : (
                        <span className="textMuted">Pending</span>
                      )}
                    </td>
                    <td>
                      <div className="actionButtonsRow">
                        <Button
                          variant="secondary"
                          size="sm"
                          isLoading={isStarting && startingWebsiteId === site.id}
                          onClick={() => handleTriggerAudit(site.id)}
                        >
                          <IconAudits size={14} /> Run Audit
                        </Button>
                        <Link to={`/websites/${site.id}`} className="btn btn-outline btn-sm">
                          History
                        </Link>
                        <Link to={`/websites/${site.id}/security-audit`} className="btn btn-outline btn-sm">
                          Security
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Register New Website">
        <form onSubmit={handleAddWebsite}>
          {error && <div className="formError mb4">{error}</div>}
          <div className="formGroup mb4">
            <label className="formLabel">Website Name</label>
            <Input
              placeholder="e.g. Acme Production Portal"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="formGroup mb4">
            <label className="formLabel">Full Website URL</label>
            <Input
              type="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
            <small className="formHint">
              Must include valid scheme (https://). Outbound SSRF gates block private IP ranges.
            </small>
          </div>
          <div className="modalActions">
            <Button variant="outline" type="button" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isCreating}>
              Register & Save
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function WebsiteDetailView() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { website, isLoading } = useWebsite(id);
  const { startAudit, isStarting } = useAudit(undefined);

  if (isLoading) {
    return (
      <div className="pageContainer">
        <Skeleton height="50px" className="mb4" />
        <Skeleton height="300px" />
      </div>
    );
  }

  if (!website) {
    return (
      <div className="pageContainer">
        <EmptyState
          title="Website Not Found"
          description="The requested website does not exist or you do not have permission to view it."
          actionText="Back to Websites"
          onAction={() => navigate('/websites')}
          icon={<IconWebsites size={40} color="#64748b" />}
        />
      </div>
    );
  }

  const handleStartAudit = async () => {
    try {
      const newAudit = await startAudit({ websiteId: website.id });
      navigate(`/audits/${newAudit.id}`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to start audit');
    }
  };

  return (
    <div className="pageContainer">
      <div className="pageHeader">
        <div>
          <div className="breadcrumbs">
            <Link to="/websites">Websites</Link> / <span>{website.name}</span>
          </div>
          <h1>{website.name}</h1>
          <p className="pageSubtext">
            {website.url} • Registered on {new Date(website.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="btnGroup">
          <Link to={`/websites/${website.id}/security-audit`} className="btn btn-outline">
            <IconShield size={16} /> Security Audit
          </Link>
          <Button variant="primary" onClick={handleStartAudit} isLoading={isStarting}>
            <IconAudits size={16} /> Run Diagnostic Audit
          </Button>
        </div>
      </div>

      <Card className="tableCard">
        <div className="cardHeaderFlex" style={{ padding: '20px' }}>
          <h3 style={{ margin: 0 }}>Audit History</h3>
          <Badge variant="neutral">{(website.audits ?? []).length} Audit Run(s)</Badge>
        </div>
        <table className="dataTable">
          <thead>
            <tr>
              <th>Audit ID</th>
              <th>Status</th>
              <th>Overall Score</th>
              <th>Lead Capture</th>
              <th>Advertising</th>
              <th>SEO</th>
              <th>Security</th>
              <th>Created At</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {(website.audits ?? []).map((audit) => (
              <tr key={audit.id}>
                <td>
                  <span className="monoText">{audit.id.slice(0, 8)}...</span>
                </td>
                <td>
                  <Badge variant={audit.status === 'COMPLETED' ? 'success' : 'high'} size="sm">
                    {audit.status}
                  </Badge>
                </td>
                <td>
                  {audit.score ? (
                    <span
                      className={`scoreBadge ${
                        audit.score.overall >= 80
                          ? 'score-green'
                          : audit.score.overall >= 60
                          ? 'score-yellow'
                          : 'score-red'
                      }`}
                    >
                      {audit.score.overall}/100
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
                <td>{audit.score?.lead ?? '-'}</td>
                <td>{audit.score?.advertising ?? '-'}</td>
                <td>{audit.score?.seo ?? '-'}</td>
                <td>{audit.score?.security ?? '-'}</td>
                <td>{new Date(audit.createdAt).toLocaleString()}</td>
                <td>
                  <Link to={`/audits/${audit.id}`} className="btn btn-outline btn-sm">
                    View Report <IconArrowRight size={12} />
                  </Link>
                </td>
              </tr>
            ))}
            {(website.audits ?? []).length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
                  No audits generated yet for this website. Click "Run Diagnostic Audit" above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
