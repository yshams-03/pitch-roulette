import type { InputHTMLAttributes, ReactNode } from 'react';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  hint?: string;
  icon?: ReactNode;
  suffix?: ReactNode;
};

export function Input({
  label,
  error,
  hint,
  icon,
  suffix,
  className = '',
  id,
  ...props
}: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {icon && (
          <span className="absolute left-3 text-[var(--text-muted)] pointer-events-none">{icon}</span>
        )}
        <input
          id={inputId}
          className={`input ${error ? 'input--error' : ''} ${icon ? 'pl-10' : ''} ${suffix ? 'pr-10' : ''} ${className}`.trim()}
          {...props}
        />
        {suffix && (
          <span className="absolute right-3 text-[var(--text-secondary)]">{suffix}</span>
        )}
      </div>
      {error && <p className="text-sm text-[var(--pr-red)] mt-1">{error}</p>}
      {hint && !error && <p className="text-sm text-[var(--text-muted)] mt-1">{hint}</p>}
    </div>
  );
}
