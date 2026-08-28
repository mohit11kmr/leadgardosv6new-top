import React from 'react';
import { Badge } from './Badge.js';
import { IconAlertTriangle, IconAlertCircle, IconCheckCircle, IconInfo, IconExternalLink } from './Icons.js';

export interface FindingCardProps {
  finding: {
    id?: string;
    title: string;
    description: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | string;
    category: string;
    affectedUrl?: string | null;
    recommendation?: string;
    businessImpact?: string;
    scoreImpact?: number;
    evidence?: {
      why?: string;
      observed?: string;
      location?: string;
      recommendation?: string;
    } | null;
  };
  rank?: number;
}

export function FindingCard({ finding, rank }: FindingCardProps) {
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
    <IconAlertCircle size={16} color="#ef4444" />
  ) : isHigh ? (
    <IconAlertTriangle size={16} color="#f97316" />
  ) : (
    <IconInfo size={16} color="#60a5fa" />
  );

  return (
    <div
      style={{
        background: isCritical
          ? 'linear-gradient(180deg, rgba(239, 68, 68, 0.08) 0%, #111726 100%)'
          : '#111726',
        border: `1px solid ${isCritical ? 'rgba(239, 68, 68, 0.35)' : isHigh ? 'rgba(249, 115, 22, 0.3)' : '#1e293b'}`,
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        gap: '16px',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
    >
      {rank !== undefined && (
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: isCritical ? 'rgba(239, 68, 68, 0.15)' : '#1e293b',
            color: isCritical ? '#f87171' : '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: '800',
            fontSize: '14px',
            flexShrink: 0,
          }}
        >
          #{rank}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {severityIcon}
          <strong style={{ fontSize: '15px', color: '#f8fafc', fontWeight: '700' }}>
            {finding.title}
          </strong>
          <Badge variant={severityBadgeVariant} size="sm">
            {finding.severity}
          </Badge>
          <Badge variant="neutral" size="sm">
            {finding.category}
          </Badge>
          {finding.scoreImpact !== undefined && finding.scoreImpact > 0 && (
            <span style={{ fontSize: '12px', color: '#f87171', fontWeight: '600' }}>
              -{finding.scoreImpact} pts
            </span>
          )}
        </div>

        <p style={{ fontSize: '13.5px', color: '#cbd5e1', margin: 0, lineHeight: '1.6' }}>
          {finding.description}
        </p>

        {finding.affectedUrl && (
          <div style={{ fontSize: '12.5px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Target:</span>
            <a
              href={finding.affectedUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#38bdf8', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
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
            borderTop: '1px solid #1e293b',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '12px',
            fontSize: '13px',
          }}
        >
          {finding.businessImpact && (
            <div style={{ background: 'rgba(239, 68, 68, 0.06)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
              <span style={{ color: '#f87171', fontWeight: '700', display: 'block', marginBottom: '2px', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Business Impact (Assumed)
              </span>
              <span style={{ color: '#cbd5e1' }}>{finding.businessImpact}</span>
            </div>
          )}

          {finding.recommendation && (
            <div style={{ background: 'rgba(16, 185, 129, 0.06)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
              <span style={{ color: '#34d399', fontWeight: '700', display: 'block', marginBottom: '2px', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Recommended Fix
              </span>
              <span style={{ color: '#cbd5e1' }}>{finding.recommendation}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
