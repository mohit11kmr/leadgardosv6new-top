import React from 'react';
import { IconAlertCircle, IconAlertTriangle, IconCheckCircle, IconInfo } from './Icons.js';

export interface AlertProps {
  variant?: 'critical' | 'warning' | 'info' | 'success';
  title?: string;
  children: React.ReactNode;
  actionText?: string;
  onAction?: () => void;
  onClose?: () => void;
  className?: string;
}

export function Alert({
  variant = 'info',
  title,
  children,
  actionText,
  onAction,
  onClose,
  className = '',
}: AlertProps) {
  const icon =
    variant === 'critical' ? (
      <IconAlertCircle size={18} color="var(--danger)" />
    ) : variant === 'warning' ? (
      <IconAlertTriangle size={18} color="var(--warning)" />
    ) : variant === 'success' ? (
      <IconCheckCircle size={18} color="var(--success)" />
    ) : (
      <IconInfo size={18} color="var(--primary)" />
    );

  const bg =
    variant === 'critical'
      ? 'var(--severity-critical-bg)'
      : variant === 'warning'
      ? 'var(--severity-high-bg)'
      : variant === 'success'
      ? 'var(--status-success-bg)'
      : 'var(--primary-light)';

  const borderColor =
    variant === 'critical'
      ? 'rgba(239, 68, 68, 0.35)'
      : variant === 'warning'
      ? 'rgba(245, 158, 11, 0.35)'
      : variant === 'success'
      ? 'rgba(16, 185, 129, 0.35)'
      : 'rgba(59, 130, 246, 0.35)';

  return (
    <div
      className={`alert alert-${variant} ${className}`.trim()}
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '12px 16px',
        borderRadius: 'var(--radius-sm)',
        background: bg,
        border: `1px solid ${borderColor}`,
        color: 'var(--text-primary)',
        fontSize: '13.5px',
      }}
    >
      <div style={{ flexShrink: 0, marginTop: '2px' }}>{icon}</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {title && <strong style={{ fontSize: '14px', fontWeight: '700' }}>{title}</strong>}
        <div style={{ color: 'var(--text-secondary)', lineHeight: '1.5' }}>{children}</div>
      </div>
      {actionText && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="btn btn-sm btn-outline"
          style={{ padding: '4px 10px', fontSize: '12px', flexShrink: 0 }}
        >
          {actionText}
        </button>
      )}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '14px',
            lineHeight: 1,
            padding: '2px 4px',
            flexShrink: 0,
          }}
          aria-label="Dismiss alert"
        >
          ✕
        </button>
      )}
    </div>
  );
}
