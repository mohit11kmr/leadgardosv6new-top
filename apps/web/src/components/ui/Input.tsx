import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export function Input({ label, error, helperText, className = '', id, ...props }: InputProps) {
  const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  return (
    <div className="inputGroup">
      {label && (
        <label htmlFor={inputId} className="inputLabel">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`inputField ${error ? 'error' : ''} ${className}`.trim()}
        {...props}
      />
      {error && <span className="inputError">{error}</span>}
      {helperText && !error && <span className="inputHelper">{helperText}</span>}
    </div>
  );
}
