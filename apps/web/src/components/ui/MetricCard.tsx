import React from 'react';

export interface MetricCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  badgeText?: string;
  badgeVariant?: 'critical' | 'high' | 'medium' | 'low' | 'info' | 'success' | 'neutral';
  highlight?: boolean;
}

export function MetricCard({
  label,
  value,
  subtext,
  badgeText,
  badgeVariant = 'neutral',
  highlight = false,
}: MetricCardProps) {
  return (
    <div className={`metricCard ${highlight ? 'highlight' : ''}`}>
      <div className="metricCardHeader">
        <span className="metricCardLabel">{label}</span>
        {badgeText && <span className={`badge badge-${badgeVariant} badge-sm`}>{badgeText}</span>}
      </div>
      <div className="metricCardValue">{value}</div>
      {subtext && <div className="metricCardSubtext">{subtext}</div>}
    </div>
  );
}
