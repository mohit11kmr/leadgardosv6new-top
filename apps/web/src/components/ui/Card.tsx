import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'accent' | 'critical' | 'highlight';
  interactive?: boolean;
}

export function Card({
  children,
  variant = 'default',
  interactive = false,
  className = '',
  ...props
}: CardProps) {
  return (
    <div
      className={`card card-${variant} ${interactive ? 'interactive' : ''} ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}
