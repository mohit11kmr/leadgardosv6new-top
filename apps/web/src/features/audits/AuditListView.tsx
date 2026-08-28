import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAudits } from '../../hooks/useAudit.js';
import { Card } from '../../components/ui/Card.js';
import { Badge } from '../../components/ui/Badge.js';
import { Skeleton, EmptyState } from '../../components/ui/States.js';
import { IconAudits, IconArrowRight, IconPlus } from '../../components/ui/Icons.js';

export function AuditListView() {
  const navigate = useNavigate();
  const { audits, isLoading } = useAudits(50);

  if (isLoading) {
    return (
      <div className="pageContainer">
        <Skeleton height="50px" className="mb4" />
        <Skeleton height="300px" />
      </div>
    );
  }

  return (
    <div className="pageContainer">
      <div className="pageHeader">
        <div>
          <h1>Diagnostic Audits</h1>
          <p>Historical audit runs and conversion vulnerability assessments across all registered web properties.</p>
        </div>
        <Link to="/websites" className="btn btn-primary">
          <IconPlus size={16} /> New Diagnostic Scan
        </Link>
      </div>

      {audits.length === 0 ? (
        <EmptyState
          title="No Audits Executed"
          description="Go to Websites and launch an audit to see historical diagnostic runs."
          actionText="Go to Websites"
          onAction={() => navigate('/websites')}
          icon={<IconAudits size={40} color="#38bdf8" />}
        />
      ) : (
        <Card className="tableCard">
          <table className="dataTable">
            <thead>
              <tr>
                <th>Website</th>
                <th>Status</th>
                <th>Lead Health</th>
                <th>Lead Capture</th>
                <th>Advertising</th>
                <th>SEO</th>
                <th>Security</th>
                <th>Execution Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {audits.map((audit) => (
                <tr key={audit.id}>
                  <td>
                    <Link to={`/audits/${audit.id}`} className="tableNameLink">
                      {audit.website?.name || 'Website'}
                    </Link>
                    <span className="tableDomainSubtext">{audit.website?.domain}</span>
                  </td>
                  <td>
                    <Badge
                      variant={
                        audit.status === 'COMPLETED'
                          ? 'success'
                          : audit.status === 'RUNNING' || audit.status === 'QUEUED'
                          ? 'info'
                          : 'critical'
                      }
                      size="sm"
                    >
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
                      <span className="textMuted">Pending</span>
                    )}
                  </td>
                  <td>{audit.score?.lead ?? '-'}</td>
                  <td>{audit.score?.advertising ?? '-'}</td>
                  <td>{audit.score?.seo ?? '-'}</td>
                  <td>{audit.score?.security ?? '-'}</td>
                  <td>{new Date(audit.createdAt).toLocaleDateString()}</td>
                  <td>
                    <Link to={`/audits/${audit.id}`} className="btn btn-outline btn-sm">
                      View Dossier <IconArrowRight size={12} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
