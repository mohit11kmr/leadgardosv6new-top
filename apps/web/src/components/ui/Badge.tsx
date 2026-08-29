import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'critical' | 'high' | 'medium' | 'low' | 'info' | 'success' | 'warning' | 'purple' | 'neutral';
  size?: 'sm' | 'md';
}

export function Badge({
  children,
  variant = 'neutral',
  size = 'md',
  className = '',
  ...props
}: BadgeProps) {
  return (
    <span
      className={`badge badge-${variant} badge-${size} ${className}`.trim()}
      {...props}
    >
      {children}
    </span>
  );
}
