import React from 'react';
import { Info, LayoutDashboard } from 'lucide-react';

export default function GeneralTab({ settingsData }) {
  return (
    <div className="space-y-6">
      <div className="p-4 bg-[var(--bg-input)] rounded-xl border border-[var(--border-default)]">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
            <Info size={20} className="text-[var(--brand-400)]" />
          </div>
          <div>
            <h3 className="font-semibold text-[var(--fg-primary)]">Welcome to Rajjo Settings</h3>
            <p className="text-sm text-[var(--fg-secondary)]">Configure your autonomous AI agent preferences. All settings are stored locally and never leave your machine.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="p-3 bg-[var(--bg-deep)] rounded-lg">
            <div className="text-xs text-[var(--fg-muted)]">Version</div>
            <div className="font-mono text-[var(--fg-primary)]">2.0.0</div>
          </div>
          <div className="p-3 bg-[var(--bg-deep)] rounded-lg">
            <div className="text-xs text-[var(--fg-muted)]">Data Directory</div>
            <div className="font-mono text-[var(--fg-secondary)] truncate">{settingsData?.settings?.data_dir || '~/.rajjo'}</div>
          </div>
          <div className="p-3 bg-[var(--bg-deep)] rounded-lg">
            <div className="text-xs text-[var(--fg-muted)]">Platform</div>
            <div className="font-mono text-[var(--fg-primary)]">{navigator.platform}</div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-[var(--fg-primary)] mb-4 flex items-center gap-2">
          <LayoutDashboard size={20} className="text-[var(--accent-400)]" />
          General Preferences
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[var(--fg-muted)] mb-1">Default Language</label>
            <select className="input input-lg">
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="ja">Japanese</option>
              <option value="zh">Chinese</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--fg-muted)] mb-1">Default Output Format</label>
            <select className="input input-lg">
              <option value="markdown">Markdown (Rich)</option>
              <option value="plain">Plain Text</option>
              <option value="json">JSON</option>
            </select>
          </div>
          <div className="flex items-center justify-between p-3 bg-[var(--bg-input)] rounded-xl border border-[var(--border-default)]">
            <div>
              <div className="font-medium text-[var(--fg-primary)]">Auto-save Conversations</div>
              <div className="text-xs text-[var(--fg-muted)]">Automatically save chat history to episodic memory</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" defaultChecked className="sr-only peer" />
              <div className="w-11 h-6 bg-[var(--bg-hover)] peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[var(--brand-500)/20] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--brand-500)]"></div>
            </label>
          </div>
          <div className="flex items-center justify-between p-3 bg-[var(--bg-input)] rounded-xl border border-[var(--border-default)]">
            <div>
              <div className="font-medium text-[var(--fg-primary)]">Telemetry & Usage</div>
              <div className="text-xs text-[var(--fg-muted)]">Help improve Rajjo by sending anonymous usage data</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" />
              <div className="w-11 h-6 bg-[var(--bg-hover)] peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[var(--brand-500)/20] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--brand-500)]"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
