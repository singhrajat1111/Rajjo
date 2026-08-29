import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  ExternalLink,
  Cloud,
  HardDrive,
  Cpu,
  Network,
  Key,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  TestTube2,
  Save,
  ChevronDown,
  ChevronUp,
  Search,
  Wifi,
  WifiOff,
  Database,
  Globe,
  Zap,
  Brain,
  Settings,
  Plus,
  Minus,
  Trash2,
  Edit2,
  Copy,
  Download,
  Upload,
  Filter,
  Star,
  Heart,
  Flag,
  Share2,
  MoreVertical,
  Menu,
  X,
  Sun,
  Moon,
  Monitor,
  Smartphone,
  Tablet,
  Laptop,
  Server,
  Database as DatabaseIcon,
  Code,
  Layers,
  Wand2,
  Palette,
  Contrast,
  LayoutDashboard,
  Terminal,
  Activity,
  BarChart3,
  GitBranch,
  Link2,
  Sparkles,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { cn, formatBytes } from '../lib/utils';

export default function ModelManager() {
  const {
    modelsData,
    fetchModels,
    selectModel,
    testModelConnection,
    detectOllama,
    validateGGUFPath,
  } = useStore();

  const [provider, setProvider] = useState(modelsData?.active_provider || 'universal');
  const [modelId, setModelId] = useState(modelsData?.active_model_id || 'deepseek-chat');
  const [apiKey, setApiKey] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState(modelsData?.custom_base_url || '');
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(modelsData?.ollama_base_url || 'http://localhost:11434');
  const [ggufPath, setGgufPath] = useState(modelsData?.gguf?.model_path || '');
  const [ggufValidation, setGgufValidation] = useState(modelsData?.gguf?.info || null);
  const [testResult, setTestResult] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isScanningOllama, setIsScanningOllama] = useState(false);
  const [ollamaScanStatus, setOllamaScanStatus] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [ollamaCloudModels, setOllamaCloudModels] = useState([]);
  const [isScanningCloud, setIsScanningCloud] = useState(false);
  const [cloudScanStatus, setCloudScanStatus] = useState('');
  const [cloudSearch, setCloudSearch] = useState('');

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const handleProviderSelect = useCallback((newProvider) => {
    setProvider(newProvider);
    setTestResult(null);
    if (newProvider === 'ollama') {
      if (modelsData?.ollama?.models?.length > 0) {
        if (!modelsData.ollama.models.includes(modelId) || modelId === 'gpt-4o') {
          setModelId(modelsData.ollama.models[0]);
        }
      } else {
        setModelId('llama3.2');
      }
    } else if (newProvider === 'groq') {
      if (!modelId.includes('llama') && !modelId.includes('mixtral') && !modelId.includes('gemma')) {
        setModelId('llama-3.3-70b-versatile');
      }
    } else if (newProvider === 'openai') {
      if (!modelId.startsWith('gpt-') && !modelId.startsWith('o1') && !modelId.startsWith('o3')) {
        setModelId('gpt-4o');
      }
    } else if (newProvider === 'universal' || newProvider === 'custom') {
      if (!modelId || modelId === 'gpt-4o') {
        setModelId('deepseek-chat');
      }
    } else if (newProvider === 'anthropic') {
      setModelId('claude-3-5-sonnet-20241022');
    } else if (newProvider === 'gemini') {
      setModelId('gemini-1.5-pro');
    } else if (newProvider === 'openrouter') {
      setModelId('anthropic/claude-3.5-sonnet');
    }
  }, [modelId, modelsData]);

  const handleScanOllama = useCallback(async () => {
    setIsScanningOllama(true);
    setTestResult(null);
    setOllamaScanStatus('Scanning Ollama endpoints (localhost & 127.0.0.1:11434)...');
    try {
      const data = await detectOllama(ollamaBaseUrl);
      if (data && data.models && data.models.length > 0) {
        setOllamaScanStatus(`Found ${data.models.length} local models: ${data.models.join(', ')}`);
        setModelId(data.models[0]);
      } else if (data && data.running) {
        setOllamaScanStatus('Ollama is running, but no models have been pulled yet.');
      } else {
        setOllamaScanStatus(data.message || 'Ollama is unreachable.');
      }
    } finally {
      setIsScanningOllama(false);
    }
  }, [detectOllama, ollamaBaseUrl]);

  const handleScanOllamaCloud = useCallback(async () => {
    setIsScanningCloud(true);
    setCloudScanStatus('Fetching available models from Ollama Cloud...');
    try {
      // Ollama Cloud API - models library
      const response = await fetch('https://ollama.com/library?format=json');
      if (!response.ok) throw new Error('Failed to fetch Ollama library');
      const data = await response.json();
      
      // Extract model names from the library
      const models = data.models?.map(m => m.name) || [];
      setOllamaCloudModels(models.slice(0, 100)); // Limit to first 100
      setCloudScanStatus(`Found ${models.length} models in Ollama Library`);
    } catch (error) {
      setCloudScanStatus(`Error: ${error.message}. Try again later.`);
    } finally {
      setIsScanningCloud(false);
    }
  }, []);

  const handleSelectGGUF = useCallback(async () => {
    if (window.electronAPI?.selectGGUFFile) {
      const selected = await window.electronAPI.selectGGUFFile();
      if (selected) {
        setGgufPath(selected);
        const info = await validateGGUFPath(selected);
        setGgufValidation(info);
      }
    }
  }, [validateGGUFPath]);

  const getEffectiveModelId = useCallback(() => {
    if (provider === 'ollama') {
      if (modelsData?.ollama?.models?.length > 0) {
        return modelsData.ollama.models.includes(modelId) ? modelId : modelsData.ollama.models[0];
      }
      return modelId || 'llama3.2';
    }
    if (provider === 'openai') return modelId || 'gpt-4o';
    if (provider === 'groq') return modelId || 'llama-3.3-70b-versatile';
    if (provider === 'anthropic') return modelId || 'claude-3-5-sonnet-20241022';
    if (provider === 'gemini') return modelId || 'gemini-1.5-pro';
    if (provider === 'openrouter') return modelId || 'anthropic/claude-3.5-sonnet';
    if (provider === 'universal' || provider === 'custom') return modelId || 'deepseek-chat';
    if (provider === 'gguf') return 'rajjo-direct-gguf';
    return modelId;
  }, [provider, modelId, modelsData]);

  const handleSaveActive = useCallback(async () => {
    setIsSaving(true);
    const effectiveModel = getEffectiveModelId();
    const payload = {
      provider,
      model_id: effectiveModel,
      custom_base_url: customBaseUrl,
      ollama_base_url: ollamaBaseUrl,
      gguf_model_path: ggufPath,
      api_key: apiKey || undefined
    };
    const ok = await selectModel(payload);
    if (ok) {
      setModelId(effectiveModel);
      setTestResult({ success: true, message: `Model successfully activated: ${provider.toUpperCase()} (${effectiveModel})` });
    }
    setIsSaving(false);
  }, [provider, getEffectiveModelId, customBaseUrl, ollamaBaseUrl, ggufPath, apiKey, selectModel]);

  const handleTest = useCallback(async () => {
    setIsTesting(true);
    setTestResult(null);
    const effectiveModel = getEffectiveModelId();
    const payload = {
      provider,
      model_id: effectiveModel,
      base_url: customBaseUrl || ollamaBaseUrl,
      gguf_model_path: ggufPath,
      api_key: apiKey || undefined
    };
    const res = await testModelConnection(payload);
    setTestResult(res);
    setIsTesting(false);
  }, [provider, getEffectiveModelId, customBaseUrl, ollamaBaseUrl, ggufPath, apiKey, testModelConnection]);

  const providerOptions = [
    { id: 'universal', label: 'Universal API', desc: 'Any OpenAI-compatible endpoint', icon: Globe, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
    { id: 'openai', label: 'OpenAI', desc: 'GPT-4o, o1, o3-mini', icon: Brain, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30' },
    { id: 'anthropic', label: 'Anthropic', desc: 'Claude 3.5 Sonnet, Haiku', icon: Sparkles, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
    { id: 'groq', label: 'Groq', desc: 'Ultra-fast inference', icon: Zap, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
    { id: 'gemini', label: 'Google Gemini', desc: 'Gemini 1.5 Pro, Flash', icon: Cpu, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
    { id: 'openrouter', label: 'OpenRouter', desc: '100+ models, one API', icon: Network, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30' },
    { id: 'ollama', label: 'Local Ollama', desc: 'Installed local models', icon: HardDrive, color: 'text-[var(--brand-400)]', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30' },
    { id: 'gguf', label: 'Direct GGUF', desc: 'Run any .gguf file directly', icon: Database, color: 'text-[var(--accent-400)]', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h2 className="text-2xl font-bold text-[var(--fg-primary)] tracking-tight flex items-center gap-3">
            <Cpu size={28} className="text-[var(--brand-400)]" />
            Model Manager & Engine Router
          </h2>
          <p className="text-[var(--fg-muted)] text-sm mt-1">
            Switch dynamically between Cloud APIs, local Ollama, Ollama Cloud library, Universal endpoints, and Direct GGUF inference
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost btn-sm gap-2" title="Refresh all models">
            <RefreshCw size={16} className={isScanningOllama ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </motion.div>

      {/* Provider Selector Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3"
      >
        {providerOptions.map(item => (
          <motion.button
            key={item.id}
            onClick={() => handleProviderSelect(item.id)}
            whileHover={{ y: -2, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
              'p-4 rounded-xl border cursor-pointer transition-all duration-200 relative overflow-hidden group',
              'flex flex-col items-start gap-3',
              provider === item.id
                ? 'bg-cyan-500/5 border-cyan-500/30 shadow-[var(--glow-brand)]'
                : `${item.bg} ${item.border} hover:border-cyan-500/30 hover:shadow-md`
            )}
          >
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', item.bg)}>
              <item.icon size={20} className={item.color} />
            </div>
            <div className="flex-1 w-full">
              <div className="font-semibold text-sm text-[var(--fg-primary)]">{item.label}</div>
              <p className="text-[11px] text-[var(--fg-muted)]">{item.desc}</p>
            </div>
            {provider === item.id && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[var(--brand-500)] flex items-center justify-center"
              >
                <CheckCircle2 size={12} className="text-[var(--fg-primary)]" />
              </motion.div>
            )}
          </motion.button>
        ))}
      </motion.div>

      {/* Configuration Form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="card p-6 space-y-6"
      >
        <h3 className="font-semibold text-[var(--fg-primary)] text-lg flex items-center gap-2">
          <Settings size={20} className="text-[var(--brand-400)]" />
          Configure {provider.toUpperCase()} Settings
        </h3>

        {/* Universal API / Custom Endpoint */}
        {(provider === 'universal' || provider === 'custom' || provider === 'openrouter' || provider === 'anthropic' || provider === 'gemini') && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Globe size={18} className="text-purple-400" />
                <span className="font-semibold text-[var(--fg-primary)]">Universal API Accepter</span>
              </div>
              <p className="text-sm text-[var(--fg-secondary)]">
                Connect to ANY OpenAI-compatible service: DeepSeek, OpenRouter, Together AI, Mistral, LM Studio (http://localhost:1234/v1), vLLM, Jan, Ollama Cloud, or custom endpoints.
              </p>
            </div>

            <div>
              <label className="block text-xs text-[var(--fg-muted)] mb-1">Base URL Endpoint</label>
              <input
                value={customBaseUrl}
                onChange={e => setCustomBaseUrl(e.target.value)}
                placeholder="https://api.deepseek.com/v1 or http://localhost:1234/v1 or https://openrouter.ai/api/v1"
                className="input input-lg font-mono"
              />
            </div>

            <div>
              <label className="block text-xs text-[var(--fg-muted)] mb-1">Model Identifier</label>
              <input
                value={modelId}
                onChange={e => setModelId(e.target.value)}
                placeholder="deepseek-chat, anthropic/claude-3.5-sonnet, gemini-1.5-pro, mistralai/mistral-large"
                className="input input-lg font-mono"
              />
            </div>

            <div>
              <label className="block text-xs text-[var(--fg-muted)] mb-1 flex items-center justify-between">
                API Key (Universal Key - works across providers)
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
                onChange={e => setApiKey(e.target.value)}
                placeholder={modelsData?.credentials?.custom?.configured ? '•••••••••••••••• (Configured)' : 'sk-... or your universal API key'}
                className="input input-lg font-mono"
              />
            </div>

            {/* Quick Provider Presets */}
            <div className="pt-2 border-t border-[var(--border-default)]">
              <label className="block text-xs text-[var(--fg-muted)] mb-2">Quick Presets</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { name: 'DeepSeek', url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
                  { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-3.5-sonnet' },
                  { name: 'Together AI', url: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
                  { name: 'LM Studio', url: 'http://localhost:1234/v1', model: 'local-model' },
                  { name: 'Ollama Cloud', url: 'https://ollama.com/api/v1', model: 'llama3.2' },
                  { name: 'vLLM', url: 'http://localhost:8000/v1', model: 'model-name' },
                ].map(preset => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => {
                      setCustomBaseUrl(preset.url);
                      setModelId(preset.model);
                    }}
                    className="btn btn-outline btn-sm px-3 py-1.5"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* OpenAI */}
        {provider === 'openai' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-[var(--fg-muted)] mb-1">Model Name</label>
              <select
                value={modelId}
                onChange={e => setModelId(e.target.value)}
                className="input input-lg font-mono"
              >
                <option value="gpt-4o">GPT-4o</option>
                <option value="gpt-4o-mini">GPT-4o Mini</option>
                <option value="o1-preview">o1 Preview</option>
                <option value="o1-mini">o1 Mini</option>
                <option value="o3-mini">o3 Mini</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
                <option value="gpt-4">GPT-4</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--fg-muted)] mb-1 flex items-center justify-between">
                OpenAI API Key
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
                onChange={e => setApiKey(e.target.value)}
                placeholder={modelsData?.credentials?.openai?.configured ? '•••••••••••••••• (Configured)' : 'sk-...'}
                className="input input-lg font-mono"
              />
            </div>
          </div>
        )}

        {/* Anthropic */}
        {provider === 'anthropic' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-[var(--fg-muted)] mb-1">Model Name</label>
              <select
                value={modelId}
                onChange={e => setModelId(e.target.value)}
                className="input input-lg font-mono"
              >
                <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet (Latest)</option>
                <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>
                <option value="claude-3-opus-20240229">Claude 3 Opus</option>
                <option value="claude-3-sonnet-20240229">Claude 3 Sonnet</option>
                <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--fg-muted)] mb-1 flex items-center justify-between">
                Anthropic API Key
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
                onChange={e => setApiKey(e.target.value)}
                placeholder={modelsData?.credentials?.anthropic?.configured ? '•••••••••••••••• (Configured)' : 'sk-ant-...'}
                className="input input-lg font-mono"
              />
            </div>
          </div>
        )}

        {/* Groq */}
        {provider === 'groq' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-[var(--fg-muted)] mb-1">Groq Model ID</label>
              <select
                value={modelId}
                onChange={e => setModelId(e.target.value)}
                className="input input-lg font-mono"
              >
                <option value="llama-3.3-70b-versatile">Llama 3.3 70B Versatile</option>
                <option value="llama-3.3-8b-versatile">Llama 3.3 8B Versatile</option>
                <option value="llama-3.1-70b-versatile">Llama 3.1 70B Versatile</option>
                <option value="llama-3.1-8b-instant">Llama 3.1 8B Instant</option>
                <option value="mixtral-8x7b-32768">Mixtral 8x7B</option>
                <option value="gemma2-9b-it">Gemma 2 9B</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--fg-muted)] mb-1 flex items-center justify-between">
                Groq API Key
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
                onChange={e => setApiKey(e.target.value)}
                placeholder={modelsData?.credentials?.groq?.configured ? '•••••••••••••••• (Configured)' : 'gsk_...'}
                className="input input-lg font-mono"
              />
            </div>
          </div>
        )}

        {/* Gemini */}
        {provider === 'gemini' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-[var(--fg-muted)] mb-1">Gemini Model</label>
              <select
                value={modelId}
                onChange={e => setModelId(e.target.value)}
                className="input input-lg font-mono"
              >
                <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                <option value="gemini-1.0-pro">Gemini 1.0 Pro</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--fg-muted)] mb-1 flex items-center justify-between">
                Google AI API Key
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
                onChange={e => setApiKey(e.target.value)}
                placeholder="AIza..."
                className="input input-lg font-mono"
              />
            </div>
          </div>
        )}

        {/* OpenRouter */}
        {provider === 'openrouter' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Network size={18} className="text-cyan-400" />
                <span className="font-semibold text-[var(--fg-primary)]">OpenRouter - 100+ Models, One API</span>
              </div>
              <p className="text-sm text-[var(--fg-secondary)]">
                Access Claude, GPT, Llama, Mistral, Gemma, and hundreds more through a single endpoint. Get your key at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener" className="text-cyan-400 hover:underline">openrouter.ai/keys</a>
              </p>
            </div>

            <div>
              <label className="block text-xs text-[var(--fg-muted)] mb-1">Model (OpenRouter format)</label>
              <input
                value={modelId}
                onChange={e => setModelId(e.target.value)}
                placeholder="anthropic/claude-3.5-sonnet, openai/gpt-4o, meta-llama/llama-3.3-70b-instruct"
                className="input input-lg font-mono"
              />
            </div>

            <div>
              <label className="block text-xs text-[var(--fg-muted)] mb-1 flex items-center justify-between">
                OpenRouter API Key
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
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-or-v1-..."
                className="input input-lg font-mono"
              />
            </div>
          </div>
        )}

        {/* Local Ollama */}
        {provider === 'ollama' && (
          <div className="space-y-4">
            {/* Ollama Connection Status */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-[var(--bg-input)] rounded-xl border border-[var(--border-default)]">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-3 h-3 rounded-full',
                  modelsData?.ollama?.running ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'
                )} />
                <div>
                  <div className="font-medium text-sm text-[var(--fg-primary)]">
                    {modelsData?.ollama?.running ? 'Ollama Service Live' : 'Ollama Not Detected'}
                  </div>
                  <div className="text-xs text-[var(--fg-muted)] font-mono">
                    {ollamaBaseUrl}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleScanOllama}
                  disabled={isScanningOllama}
                  className="btn btn-brand-outline btn-sm gap-2"
                >
                  <RefreshCw size={14} className={isScanningOllama ? 'animate-spin' : ''} />
                  <span>{isScanningOllama ? 'Scanning...' : 'Scan Local Models'}</span>
                </button>
                <button
                  onClick={handleScanOllamaCloud}
                  disabled={isScanningCloud}
                  className="btn btn-outline btn-sm gap-2"
                >
                  <Cloud size={14} className={isScanningCloud ? 'animate-spin' : ''} />
                  <span>{isScanningCloud ? 'Fetching...' : 'Browse Cloud Library'}</span>
                </button>
              </div>
            </div>

            {ollamaScanStatus && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-[var(--fg-muted)] italic px-1"
              >
                {ollamaScanStatus}
              </motion.p>
            )}

            {cloudScanStatus && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-[var(--fg-muted)] italic px-1 text-purple-400"
              >
                {cloudScanStatus}
              </motion.p>
            )}

            {/* Local Models Dropdown */}
            <div>
              <label className="block text-xs text-[var(--fg-muted)] mb-1">Select Installed Local Model</label>
              {modelsData?.ollama?.models?.length > 0 ? (
                <select
                  value={modelId}
                  onChange={e => setModelId(e.target.value)}
                  className="input input-lg font-mono"
                >
                  {modelsData.ollama.models.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={modelId}
                  onChange={e => setModelId(e.target.value)}
                  placeholder="e.g. llama3.2, mistral, qwen2.5:7b, deepseek-r1:8b, phi3:mini"
                  className="input input-lg font-mono"
                />
              )}
            </div>

            {/* Ollama Cloud Models */}
            {ollamaCloudModels.length > 0 && (
              <div>
                <label className="block text-xs text-[var(--fg-muted)] mb-1 flex items-center gap-2">
                  <Cloud size={14} className="text-purple-400" />
                  Install from Ollama Cloud Library ({ollamaCloudModels.length} models)
                </label>
                <div className="max-h-60 overflow-y-auto custom-scrollbar bg-[var(--bg-input)] rounded-xl border border-[var(--border-default)] p-2">
                  <input
                    type="text"
                    placeholder="Search models..."
                    className="input input-sm mb-2"
                    onChange={(e) => setCloudSearch(e.target.value)}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {ollamaCloudModels
                      .filter(m => m.toLowerCase().includes((cloudSearch || '').toLowerCase()))
                      .slice(0, 50)
                      .map(model => (
                        <button
                          key={model}
                          type="button"
                          onClick={() => {
                            setModelId(model);
                            setCloudScanStatus(`Selected: ${model}. Click "Set as Active Model" to use.`);
                          }}
                          className="btn btn-ghost btn-sm px-3 py-2 text-left justify-start font-mono text-xs hover:bg-cyan-500/10 hover:text-[var(--brand-300)]"
                        >
                          {model}
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Direct GGUF */}
        {provider === 'gguf' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-center gap-2 mb-2">
                <HardDrive size={18} className="text-[var(--accent-400)]" />
                <span className="font-semibold text-[var(--fg-primary)]">Rajjo Direct GGUF Engine</span>
              </div>
              <p className="text-sm text-[var(--fg-secondary)]">
                Directly execute any quantized .gguf model file from your SSD, HDD, Downloads, or external drive with zero directory setup. Supports CPU/GPU acceleration via llama.cpp.
              </p>
            </div>

            <div>
              <label className="block text-xs text-[var(--fg-muted)] mb-1">Local GGUF File Path</label>
              <div className="flex gap-2">
                <input
                  value={ggufPath}
                  onChange={async e => {
                    setGgufPath(e.target.value);
                    const info = await validateGGUFPath(e.target.value);
                    setGgufValidation(info);
                  }}
                  placeholder="D:\\Models\\llama-3-8b-instruct.Q4_K_M.gguf or /home/user/models/mistral-7b.q4_k_m.gguf"
                  className="input input-lg font-mono flex-1"
                />
                <button
                  onClick={handleSelectGGUF}
                  className="btn btn-primary btn-lg gap-2 shrink-0"
                >
                  <FolderOpen size={16} />
                  <span>Browse GGUF</span>
                </button>
              </div>
            </div>

            {ggufValidation && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'p-4 rounded-xl border text-sm',
                  ggufValidation.valid
                    ? 'bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success)]'
                    : 'bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger)]'
                )}
              >
                {ggufValidation.valid ? (
                  <div>
                    <div className="flex items-center gap-2 font-semibold mb-1">
                      <CheckCircle2 size={16} />
                      Valid GGUF Model File Ready
                    </div>
                    <div className="text-xs text-[var(--fg-muted)] font-mono space-y-1">
                      <div>File: {ggufValidation.filename}</div>
                      <div>Size: {formatBytes(ggufValidation.size_bytes)}</div>
                      {ggufValidation.arch && <div>Arch: {ggufValidation.arch}</div>}
                      {ggufValidation.quantization && <div>Quant: {ggufValidation.quantization}</div>}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 font-semibold mb-1">
                      <AlertCircle size={16} />
                      GGUF File Notice
                    </div>
                    <div className="text-xs">{ggufValidation.error}</div>
                  </div>
                )}
              </motion.div>
            )}

            {/* GGUF Settings */}
            <div className="pt-4 border-t border-[var(--border-default)] grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-[var(--fg-muted)] mb-1">Context Window</label>
                <select className="input input-lg font-mono" defaultValue="4096">
                  <option value="2048">2048</option>
                  <option value="4096">4096 (Default)</option>
                  <option value="8192">8192</option>
                  <option value="16384">16384</option>
                  <option value="32768">32768</option>
                  <option value="65536">65536</option>
                  <option value="131072">131072</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--fg-muted)] mb-1">GPU Layers</label>
                <input type="number" className="input input-lg font-mono" defaultValue="0" min="0" max="99" placeholder="0 = CPU only" />
              </div>
              <div>
                <label className="block text-xs text-[var(--fg-muted)] mb-1">Threads</label>
                <input type="number" className="input input-lg font-mono" defaultValue="0" min="0" max="64" placeholder="0 = Auto" />
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="pt-4 border-t border-[var(--border-default)] flex flex-col sm:flex-row items-center justify-between gap-4"
        >
          <button
            onClick={handleTest}
            disabled={isTesting}
            className="btn btn-outline btn-md gap-2 flex-1 sm:flex-none"
          >
            {isTesting && <RefreshCw size={16} className="animate-spin" />}
            <span>Test Connection</span>
          </button>

          <button
            onClick={handleSaveActive}
            disabled={isSaving}
            className="btn btn-primary btn-md gap-2 flex-1 sm:flex-none"
          >
            {isSaving && <RefreshCw size={16} className="animate-spin" />}
            <span>{isSaving ? 'Saving...' : 'Set as Active Model'}</span>
          </button>
        </motion.div>

        {testResult && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              'p-4 rounded-xl border text-sm',
              testResult.success
                ? 'bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success)]'
                : 'bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger)]'
            )}
          >
            <div className="flex items-center gap-2 font-semibold mb-2">
              {testResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{testResult.success ? 'Test Passed' : 'Test Failed'}</span>
            </div>
            <p className="text-xs font-mono text-[var(--fg-secondary)]">{testResult.message}</p>
          </motion.div>
        )}
      </motion.div>

      {/* Current Active Model Display */}
      {modelsData && (
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
              <div className="font-mono text-[var(--fg-primary)] font-semibold">{modelsData.active_provider?.toUpperCase()}</div>
            </div>
            <div className="p-3 bg-[var(--bg-input)] rounded-xl">
              <div className="text-xs text-[var(--fg-muted)]">Model</div>
              <div className="font-mono text-[var(--brand-400)] font-semibold truncate">{modelsData.active_model_id}</div>
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
      )}

      {/* State for cloud search */}
      const [cloudSearch, setCloudSearch] = useState('');
    </div>
  );
}