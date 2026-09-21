import React from 'react';

export default function StorageItem({ label, value, icon: Icon }) {
  return (
    <div className="p-4 bg-[var(--bg-input)] rounded-xl border border-[var(--border-default)]">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[var(--bg-deep)] flex items-center justify-center">
          <Icon size={20} className="text-[var(--fg-muted)]" />
        </div>
        <div>
          <div className="text-xs text-[var(--fg-muted)]">{label}</div>
          <div className="font-mono text-[var(--fg-primary)]">{value}</div>
        </div>
      </div>
    </div>
  );
}
