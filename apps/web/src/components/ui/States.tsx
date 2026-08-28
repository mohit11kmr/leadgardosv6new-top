import React from 'react';
import { Button } from './Button.js';
import { IconFolder, IconAlertTriangle } from './Icons.js';

export interface EmptyStateProps {
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export function EmptyState({
  title,
  description,
  actionText,
  onAction,
  icon,
}: EmptyStateProps) {
  return (
    <div className="emptyStateContainer">
      <div className="emptyStateIcon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
        {icon ?? <IconFolder size={40} />}
      </div>
      <h4 style={{ fontSize: '18px', fontWeight: '700', color: '#f8fafc', margin: '12px 0 6px' }}>{title}</h4>
      <p style={{ fontSize: '14px', color: '#94a3b8', maxWidth: '460px', margin: '0 auto 20px', lineHeight: '1.6' }}>{description}</p>
      {actionText && onAction && (
        <Button variant="primary" size="sm" onClick={onAction}>
          {actionText}
        </Button>
      )}
    </div>
  );
}

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'Failed to load data',
  message,
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="errorStateContainer">
      <div className="errorStateHeader" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', marginBottom: '6px' }}>
        <IconAlertTriangle size={18} />
        <strong style={{ fontSize: '15px' }}>{title}</strong>
      </div>
      <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 16px' }}>{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try Again
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className = '', height = '20px', width = '100%' }: { className?: string; height?: string; width?: string }) {
  return <div className={`skeletonPulse ${className}`.trim()} style={{ height, width }} />;
}
