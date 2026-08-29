import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export function Input({ label, error, helperText, className = '', id, ...props }: InputProps) {
  const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  const errorId = inputId ? `${inputId}-error` : undefined;
  const helperId = inputId ? `${inputId}-helper` : undefined;

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
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId : helperText ? helperId : undefined}
        {...props}
      />
      {error && (
        <span id={errorId} className="inputError" role="alert">
          {error}
        </span>
      )}
      {helperText && !error && (
        <span id={helperId} className="inputHelper">
          {helperText}
        </span>
      )}
    </div>
  );
}
