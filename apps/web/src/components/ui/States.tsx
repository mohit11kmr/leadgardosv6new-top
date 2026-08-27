import React from 'react';
import { Button } from './Button.js';

export interface EmptyStateProps {
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  icon?: string;
}

export function EmptyState({
  title,
  description,
  actionText,
  onAction,
  icon = '📂',
}: EmptyStateProps) {
  return (
    <div className="emptyStateContainer">
      <div className="emptyStateIcon">{icon}</div>
      <h4>{title}</h4>
      <p>{description}</p>
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
      <div className="errorStateHeader">
        <span className="errorStateIcon">⚠️</span>
        <strong>{title}</strong>
      </div>
      <p>{message}</p>
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
