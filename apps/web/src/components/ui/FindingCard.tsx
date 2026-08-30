import React, { useState } from 'react';
import { Badge } from './Badge.js';
import { IconAlertTriangle, IconAlertCircle, IconInfo, IconExternalLink, IconChevronDown, IconChevronUp, IconCheck } from './Icons.js';
import { normalizeFindingEvidence, type FindingEvidence, type JsonValue } from '@leadguard/shared';

export interface FindingCardProps {
  finding: {
    id?: string;
    title: string;
    description: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | string;
    category: string;
    affectedUrl?: string | null;
    recommendation?: string;
    businessImpact?: string | null;
    scoreImpact?: number;
    evidence?: FindingEvidence | null;
  };
  rank?: number;
  onExpressFixClick?: () => void;
}

export function FindingCard({ finding, rank, onExpressFixClick }: FindingCardProps) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const isCritical = finding.severity === 'CRITICAL';
  const isHigh = finding.severity === 'HIGH';

  const severityBadgeVariant = isCritical
    ? 'critical'
    : isHigh
    ? 'high'
    : finding.severity === 'MEDIUM'
    ? 'medium'
    : 'neutral';

  const severityIcon = isCritical ? (
    <IconAlertCircle size={16} color="var(--danger)" />
  ) : isHigh ? (
    <IconAlertTriangle size={16} color="var(--warning)" />
  ) : (
    <IconInfo size={16} color="var(--primary)" />
  );

  const normalizedEvidence = normalizeFindingEvidence(finding.evidence);

  const hasEvidence = normalizedEvidence !== null && (
    (typeof normalizedEvidence === 'object' && !Array.isArray(normalizedEvidence) && Object.keys(normalizedEvidence).length > 0) ||
    (Array.isArray(normalizedEvidence) && normalizedEvidence.length > 0) ||
    (typeof normalizedEvidence === 'string' && normalizedEvidence.trim().length > 0) ||
    typeof normalizedEvidence === 'number' ||
    typeof normalizedEvidence === 'boolean'
  );

  const handleCopyFix = () => {
    if (finding.recommendation) {
      navigator.clipboard?.writeText(finding.recommendation);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className="card findingCard"
      style={{
        background: isCritical
          ? 'linear-gradient(180deg, var(--severity-critical-bg) 0%, var(--bg-surface) 100%)'
          : 'var(--bg-surface)',
        borderColor: isCritical
          ? 'rgba(239, 68, 68, 0.35)'
          : isHigh
          ? 'rgba(245, 158, 11, 0.3)'
          : 'var(--border-color)',
        padding: 'var(--space-5)',
        display: 'flex',
        gap: 'var(--space-4)',
        transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
      }}
    >
      {rank !== undefined && (
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: 'var(--radius-sm)',
            background: isCritical ? 'var(--severity-critical-bg)' : 'var(--bg-surface-elevated)',
            color: isCritical ? 'var(--danger)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: '800',
            fontSize: '14px',
            flexShrink: 0,
          }}
          aria-label={`Rank #${rank}`}
        >
          #{rank}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {severityIcon}
          <strong style={{ fontSize: '15px', color: 'var(--text-primary)', fontWeight: '700' }}>
            {finding.title}
          </strong>
          <Badge variant={severityBadgeVariant} size="sm">
            {finding.severity}
          </Badge>
          <Badge variant="neutral" size="sm">
            {finding.category}
          </Badge>
          {finding.scoreImpact !== undefined && finding.scoreImpact > 0 && (
            <span style={{ fontSize: '12px', color: 'var(--danger)', fontWeight: '600' }}>
              -{finding.scoreImpact} pts
            </span>
          )}
        </div>

        <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.6' }}>
          {finding.description}
        </p>

        {finding.affectedUrl && (
          <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Target:</span>
            <a
              href={finding.affectedUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              {finding.affectedUrl}
              <IconExternalLink size={12} />
            </a>
          </div>
        )}

        <div
          style={{
            marginTop: '8px',
            paddingTop: '12px',
            borderTop: '1px solid var(--border-color)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '12px',
            fontSize: '13px',
          }}
        >
          {finding.businessImpact && (
            <div style={{ background: 'var(--severity-critical-bg)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
              <span style={{ color: 'var(--danger)', fontWeight: '700', display: 'block', marginBottom: '2px', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Business Impact (Assumed)
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>{finding.businessImpact}</span>
            </div>
          )}

          {finding.recommendation && (
            <div style={{ background: 'var(--status-success-bg)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                <span style={{ color: 'var(--success)', fontWeight: '700', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Recommended Fix
                </span>
                <button
                  type="button"
                  onClick={handleCopyFix}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '11px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 6px',
                  }}
                  aria-label="Copy fix recommendation"
                >
                  {copied ? <IconCheck size={12} color="var(--success)" /> : null}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <span style={{ color: 'var(--text-secondary)' }}>{finding.recommendation}</span>
            </div>
          )}
        </div>

        {hasEvidence && normalizedEvidence !== null && (
          <div style={{ marginTop: '8px' }}>
            <button
              type="button"
              onClick={() => setEvidenceOpen(!evidenceOpen)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 0',
                fontWeight: '500',
              }}
              aria-expanded={evidenceOpen}
            >
              {evidenceOpen ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
              {evidenceOpen ? 'Hide Technical Evidence' : 'Show Technical Evidence'}
            </button>

            {evidenceOpen && (
              <div
                style={{
                  marginTop: '6px',
                  padding: '10px 12px',
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                {renderEvidenceContent(normalizedEvidence)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function renderEvidenceContent(evidence: JsonValue) {
  if (evidence === null || evidence === undefined) {
    return <span style={{ color: 'var(--text-muted)' }}>No technical evidence recorded.</span>;
  }

  if (typeof evidence === 'string') {
    return <div><span>{evidence}</span></div>;
  }

  if (typeof evidence === 'number' || typeof evidence === 'boolean') {
    return <div><span>{String(evidence)}</span></div>;
  }

  if (Array.isArray(evidence)) {
    if (evidence.length === 0) {
      return <span style={{ color: 'var(--text-muted)' }}>No technical evidence items recorded.</span>;
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {evidence.map((item, idx) => (
          <div key={idx} style={{ padding: '6px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            {item !== null && typeof item === 'object' ? (
              Array.isArray(item) ? (
                <pre style={{ margin: 0, fontSize: '11px', whiteSpace: 'pre-wrap' }}>{JSON.stringify(item, null, 2)}</pre>
              ) : (
                renderObjectEntries(item as Record<string, JsonValue | undefined>)
              )
            ) : (
              <span>{String(item)}</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (typeof evidence === 'object') {
    return renderObjectEntries(evidence as Record<string, JsonValue | undefined>);
  }

  return <span style={{ color: 'var(--text-muted)' }}>No technical evidence recorded.</span>;
}

function renderObjectEntries(obj: Record<string, JsonValue | undefined>) {
  const knownKeys = ['ruleId', 'location', 'observed', 'why', 'source', 'recommendation', 'element', 'expectedPattern', 'value'];
  const entries = Object.entries(obj).filter(([_, v]) => v !== undefined && v !== null && v !== '');

  if (entries.length === 0) {
    return <span style={{ color: 'var(--text-muted)' }}>No diagnostic fields recorded.</span>;
  }

  const knownMap: Record<string, string> = {
    ruleId: 'Rule ID',
    location: 'Location',
    observed: 'Observed',
    why: 'Reason',
    source: 'Source',
    element: 'Element',
    expectedPattern: 'Expected',
    value: 'Value',
    recommendation: 'Evidence Fix',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {knownKeys.map((key) => {
        const val = obj[key];
        if (val === undefined || val === null || val === '') return null;
        const isObserved = key === 'observed';
        const isRuleOrElement = key === 'ruleId' || key === 'element';
        return (
          <div key={key}>
            <span style={{ color: 'var(--text-muted)' }}>{knownMap[key] || key}: </span>
            <span style={{ color: isObserved ? 'var(--danger)' : isRuleOrElement ? 'var(--text-primary)' : 'inherit' }}>
              {typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val)}
            </span>
          </div>
        );
      })}

      {entries
        .filter(([k]) => !knownKeys.includes(k) && k !== 'metadata')
        .map(([k, v]) => (
          <div key={k}>
            <span style={{ color: 'var(--text-muted)' }}>{k}: </span>
            <span>{typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}</span>
          </div>
        ))}
    </div>
  );
}
