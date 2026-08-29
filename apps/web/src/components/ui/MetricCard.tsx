import React from 'react';

export interface MetricCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  badgeText?: string;
  badgeVariant?: 'critical' | 'high' | 'medium' | 'low' | 'info' | 'success' | 'warning' | 'purple' | 'neutral';
  highlight?: boolean;
  confidence?: 'HIGH' | 'MEDIUM' | 'ESTIMATED';
  trend?: {
    direction: 'up' | 'down' | 'neutral';
    value: string;
    isPositive: boolean;
  };
}

export function MetricCard({
  label,
  value,
  subtext,
  badgeText,
  badgeVariant = 'neutral',
  highlight = false,
  confidence,
  trend,
}: MetricCardProps) {
  return (
    <div className={`metricCard ${highlight ? 'highlight' : ''}`}>
      <div className="metricCardHeader">
        <span className="metricCardLabel">{label}</span>
        <div className="flexRow gap2">
          {confidence && (
            <span className="badge badge-neutral badge-sm" style={{ fontSize: '10px' }}>
              {confidence}
            </span>
          )}
          {badgeText && <span className={`badge badge-${badgeVariant} badge-sm`}>{badgeText}</span>}
        </div>
      </div>
      <div className="metricCardValue">{value}</div>
      <div className="flexBetween" style={{ marginTop: 'auto' }}>
        {subtext && <div className="metricCardSubtext">{subtext}</div>}
        {trend && (
          <span
            className="textXs fontBold"
            style={{
              color: trend.isPositive ? 'var(--success)' : 'var(--danger)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
            }}
          >
            {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'} {trend.value}
          </span>
        )}
      </div>
    </div>
  );
}
