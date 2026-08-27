import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useWebsites, useWebsite } from '../../hooks/useWebsites.js';
import { useAudit } from '../../hooks/useAudit.js';
import { Button } from '../../components/ui/Button.js';
import { Modal } from '../../components/ui/Modal.js';
import { Input } from '../../components/ui/Input.js';
import { Badge } from '../../components/ui/Badge.js';
import { Card } from '../../components/ui/Card.js';
import { EmptyState, Skeleton } from '../../components/ui/States.js';

export function WebsiteListView() {
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
      window.location.href = `/audits/${newAudit.id}`;
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
          + Add Website
        </Button>
      </div>

      {websites.length === 0 ? (
        <EmptyState
          title="No Websites Configured"
          description="Register your first website to start running diagnostic scans."
          actionText="Add Website"
          onAction={() => setIsAddOpen(true)}
          icon="🌐"
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
                      >
                        {site.url} ↗
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
                          Start Audit
                        </Button>
                        {latestAudit && (
                          <Link
                            to={`/audits/${latestAudit.id}`}
                            className="btn btn-outline btn-sm"
                          >
                            View Audit
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Add Website Modal */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Register New Website">
        {error && <div className="authError mb3">{error}</div>}
        <form onSubmit={handleAddWebsite} className="formLayout">
          <Input
            label="Website Name"
            placeholder="e.g. LeadGuard Main Site"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            label="Target URL"
            type="url"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
          <div className="modalFooter">
            <Button variant="ghost" onClick={() => setIsAddOpen(false)} type="button">
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
          onAction={() => {
            window.location.href = '/websites';
          }}
        />
      </div>
    );
  }

  const handleStartAudit = async () => {
    try {
      const newAudit = await startAudit({ websiteId: website.id });
      window.location.href = `/audits/${newAudit.id}`;
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
        <Button variant="primary" onClick={handleStartAudit} isLoading={isStarting}>
          ⚡ Run Diagnostic Audit
        </Button>
      </div>

      <Card className="tableCard">
        <div className="cardHeaderFlex">
          <h3>Audit History</h3>
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
              <th>Dossier</th>
            </tr>
          </thead>
          <tbody>
            {(website.audits ?? []).map((audit) => (
              <tr key={audit.id}>
                <td>
                  <Link to={`/audits/${audit.id}`} className="tableNameLink">
                    {audit.id.slice(0, 8)}...
                  </Link>
                </td>
                <td>
                  <Badge
                    variant={audit.status === 'COMPLETED' ? 'success' : 'high'}
                    size="sm"
                  >
                    {audit.status}
                  </Badge>
                </td>
                <td>
                  <strong>{audit.score?.overall ?? '-'} / 100</strong>
                </td>
                <td>{audit.score?.lead ?? '-'}</td>
                <td>{audit.score?.advertising ?? '-'}</td>
                <td>{audit.score?.seo ?? '-'}</td>
                <td>{audit.score?.security ?? '-'}</td>
                <td>{new Date(audit.createdAt).toLocaleString()}</td>
                <td>
                  <Link to={`/audits/${audit.id}`} className="btn btn-outline btn-sm">
                    Open Dossier →
                  </Link>
                </td>
              </tr>
            ))}
            {(website.audits ?? []).length === 0 && (
              <tr>
                <td colSpan={9} className="textCenter py4">
                  No audits run for this website yet. Click &quot;Run Diagnostic Audit&quot; above to begin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
