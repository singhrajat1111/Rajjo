import React, { useState } from 'react';
import { Cpu, Eye, EyeOff, Key, ExternalLink, Server, RefreshCw, Zap, Clock, Info } from 'lucide-react';

const DEFAULT_NIM_MODELS = [
  'nvidia/nemotron-3.5-lightning-30b-a3b',
  'nvidia/nemotron-3.5-bolt-e4b',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
  'deepseek-ai/deepseek-v4.1-flash',
  'z-ai/glm-5.3-flash',
  'mistralai/mistral-large-4-1t-a52b',
  'moonshotai/kimi-k2.6',
  'minimaxai/minimax-m3.1-flash',
];

const getModelLabel = (m) => {
  if (m === 'nvidia/nemotron-3.5-lightning-30b-a3b') return '⚡ nvidia/nemotron-3.5-lightning-30b-a3b (Fast & Recommended)';
  if (m === 'nvidia/nemotron-3.5-bolt-e4b') return '⚡ nvidia/nemotron-3.5-bolt-e4b (Ultra Fast)';
  if (m === 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning') return '⚡ nvidia/nemotron-3-nano-omni-30b-a3b-reasoning (Fast Reasoning)';
  if (m.toLowerCase().includes('deepseek')) return `⏳ ${m} (DeepSeek - Slower Cloud Queue)`;
  return m;
};

export default function NvidiaConfigSection({
  modelId,
  setModelId,
  apiKey,
  setApiKey,
  showApiKey,
  setShowApiKey,
  nvidiaBaseUrl,
  setNvidiaBaseUrl,
  modelsData,
  fetchNvidiaModels,
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const availableModels = Array.from(
    new Set([
      ...DEFAULT_NIM_MODELS,
      ...(modelsData?.nvidia?.models || []),
      ...(modelsData?.active_provider === 'nvidia' ? (modelsData?.models || []) : []),
    ])
  );

  const isConfigured = Boolean(modelsData?.credentials?.nvidia?.configured);

  const handleRefreshCatalog = async () => {
    if (!fetchNvidiaModels) return;
    setIsRefreshing(true);
    try {
      await fetchNvidiaModels();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Cpu size={18} className="text-emerald-400" />
            <span className="font-semibold text-[var(--fg-primary)]">NVIDIA NIM Inference API</span>
          </div>
          <div className="flex items-center gap-3">
            {fetchNvidiaModels && (
              <button
                type="button"
                onClick={handleRefreshCatalog}
                disabled={isRefreshing}
                className="btn btn-outline btn-xs gap-1.5 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
              >
                <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
                <span>{isRefreshing ? 'Fetching...' : 'Fetch Live Models'}</span>
              </button>
            )}
            <a
              href="https://build.nvidia.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
            >
              <span>Get API Key</span>
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
        <p className="text-sm text-[var(--fg-secondary)]">
          Connect directly to NVIDIA NIM hosted endpoints (<code className="font-mono text-xs">integrate.api.nvidia.com/v1</code>) or a local self-hosted NIM container using your NVIDIA API key. Recommended fast model: <code className="font-mono text-xs text-emerald-300">nvidia/nemotron-3.5-lightning-30b-a3b</code>.
        </p>
      </div>

      {/* Model Preset Picker */}
      <div>
        <label className="block text-xs text-[var(--fg-muted)] mb-1">
          NVIDIA NIM Model Preset ({availableModels.length} available)
        </label>
        <select
          value={availableModels.includes(modelId) ? modelId : '__custom__'}
          onChange={(e) => {
            if (e.target.value !== '__custom__') {
              setModelId(e.target.value);
            }
          }}
          className="input input-lg font-mono mb-2"
        >
          {availableModels.map((m) => (
            <option key={m} value={m}>{getModelLabel(m)}</option>
          ))}
          <option value="__custom__">Custom NIM model ID...</option>
        </select>

        <label className="block text-xs text-[var(--fg-muted)] mb-1">Model Identifier (editable)</label>
        <input
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          placeholder="nvidia/nemotron-3.5-lightning-30b-a3b"
          className="input font-mono text-sm mb-1.5"
        />

        {modelId.toLowerCase().includes('deepseek') ? (
          <div className="flex items-start gap-1.5 text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg">
            <Clock size={14} className="mt-0.5 shrink-0" />
            <span>
              <strong>DeepSeek Note:</strong> NVIDIA hosted DeepSeek endpoints may experience cold-start queue times (20–40s). If testing times out, you can still click <strong>Set as Active Model</strong> and use it directly. For instant responses, select <strong>nvidia/nemotron-3.5-lightning-30b-a3b</strong>.
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-emerald-400/80">
            <Zap size={12} className="shrink-0" />
            <span>Fast response endpoint with native tool binding support.</span>
          </div>
        )}
      </div>

      {/* NVIDIA API Key */}
      <div>
        <label className="block text-xs text-[var(--fg-muted)] mb-1 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Key size={12} className="text-emerald-400" />
            <span>NVIDIA NIM API Key</span>
            {isConfigured && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono">
                Saved in Keyring
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setShowApiKey(!showApiKey)}
            className="btn btn-ghost btn-sm p-1 text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
          >
            {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </label>
        <input
          type={showApiKey ? 'text' : 'password'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={isConfigured ? '•••••••••••••••• (Configured — leave blank to keep existing)' : 'nvapi-...'}
          className="input input-lg font-mono"
        />
      </div>

      {/* Endpoint URL */}
      <div>
        <label className="block text-xs text-[var(--fg-muted)] mb-1 flex items-center gap-1.5">
          <Server size={12} className="text-emerald-400" />
          <span>NIM Endpoint Base URL</span>
        </label>
        <input
          value={nvidiaBaseUrl}
          onChange={(e) => setNvidiaBaseUrl(e.target.value)}
          placeholder="https://integrate.api.nvidia.com/v1"
          className="input font-mono text-sm"
        />
      </div>
    </div>
  );
}
