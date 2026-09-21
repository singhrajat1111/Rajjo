import React from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function CredentialField({
  label,
  placeholder,
  value,
  onChange,
  show,
  onToggleShow,
  configured,
  icon,
  helpText
}) {
  return (
    <div className="space-y-3">
      <label className="block text-xs text-[var(--fg-muted)] mb-1 flex items-center justify-between">
        <span className="flex items-center gap-2">
          {icon}
          {label}
        </span>
        <button
          type="button"
          onClick={() => onToggleShow(!show)}
          className="btn btn-ghost btn-sm p-1 text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={configured ? '•••••••••••••••• (Configured)' : placeholder}
          className="input input-lg font-mono pr-12"
        />
        {configured && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--success)] font-medium">
            ✓ Configured
          </span>
        )}
      </div>
      {helpText && <p className="text-xs text-[var(--fg-muted)]">{helpText}</p>}
    </div>
  );
}
