import React from 'react';
import { motion } from 'framer-motion';
import { Activity } from 'lucide-react';

export default function ActiveModelSummary({ modelsData }) {
  if (!modelsData) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="card p-4"
    >
      <h3 className="font-semibold text-[var(--fg-primary)] mb-3 flex items-center gap-2">
        <Activity size={20} className="text-[var(--accent-400)]" />
        Currently Active Configuration
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
        <div className="p-3 bg-[var(--bg-input)] rounded-xl">
          <div className="text-xs text-[var(--fg-muted)]">Provider</div>
          <div className="font-mono text-[var(--fg-primary)] font-semibold">
            {modelsData.active_provider?.toUpperCase()}
          </div>
        </div>
        <div className="p-3 bg-[var(--bg-input)] rounded-xl">
          <div className="text-xs text-[var(--fg-muted)]">Model</div>
          <div className="font-mono text-[var(--brand-400)] font-semibold truncate">
            {modelsData.active_model_id}
          </div>
        </div>
        <div className="p-3 bg-[var(--bg-input)] rounded-xl">
          <div className="text-xs text-[var(--fg-muted)]">Endpoint</div>
          <div className="font-mono text-[var(--fg-secondary)] truncate">
            {modelsData.custom_base_url || (modelsData.ollama?.running ? 'Local Ollama' : 'Default')}
          </div>
        </div>
        <div className="p-3 bg-[var(--bg-input)] rounded-xl">
          <div className="text-xs text-[var(--fg-muted)]">GGUF Engine</div>
          <div className="font-mono text-[var(--fg-secondary)]">
            {modelsData.gguf?.model_path ? 'Loaded' : 'Not configured'}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
