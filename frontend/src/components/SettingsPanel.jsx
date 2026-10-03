import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings,
  Key,
  FolderOpen,
  HardDrive,
  Database,
  Shield,
  Palette,
  Contrast,
  Wand2,
  Terminal,
  Cpu,
  Network,
  Zap,
  Brain,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  FileText,
  Camera,
  RefreshCw,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { cn } from '../lib/utils';
import GeneralTab from './settings/GeneralTab';
import CredentialField from './settings/CredentialField';
import StorageItem from './settings/StorageItem';

export default function SettingsPanel() {
  const {
    settingsData,
    fetchSettings,
    updateSettings,
  } = useStore();

  const [openaiKey, setOpenaiKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [customKey, setCustomKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [openrouterKey, setOpenrouterKey] = useState('');

  const [workspaceDir, setWorkspaceDir] = useState('');
  const [dataDir, setDataDir] = useState('');
  const [shellTimeout, setShellTimeout] = useState(30);
  const [maxIterations, setMaxIterations] = useState(10);
  const [shellConfirmDestructive, setShellConfirmDestructive] = useState(true);
  const [autoSaveConversations, setAutoSaveConversations] = useState(true);

  const [httpProxy, setHttpProxy] = useState('');
  const [httpsProxy, setHttpsProxy] = useState('');
  const [noProxy, setNoProxy] = useState('localhost,127.0.0.1,.local');

  const [theme, setThemeState] = useState('dark');
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showCustomKey, setShowCustomKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showOpenrouterKey, setShowOpenrouterKey] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (settingsData?.settings) {
      const s = settingsData.settings;
      if (s.theme) setThemeState(s.theme);
      if (s.shell_timeout !== undefined) setShellTimeout(s.shell_timeout);
      if (s.max_iterations !== undefined) setMaxIterations(s.max_iterations);
      if (s.workspace_dir) setWorkspaceDir(s.workspace_dir);
      if (s.data_dir) setDataDir(s.data_dir);
      if (s.shell_confirm_destructive !== undefined) setShellConfirmDestructive(s.shell_confirm_destructive);
      if (s.auto_save_conversations !== undefined) setAutoSaveConversations(s.auto_save_conversations);
      if (s.http_proxy !== undefined) setHttpProxy(s.http_proxy);
      if (s.https_proxy !== undefined) setHttpsProxy(s.https_proxy);
      if (s.no_proxy !== undefined) setNoProxy(s.no_proxy);
    }
  }, [settingsData]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    const updates = {
      shell_timeout: Number(shellTimeout),
      max_iterations: Number(maxIterations),
      workspace_dir: workspaceDir.trim() || undefined,
      data_dir: dataDir.trim() || undefined,
      shell_confirm_destructive: Boolean(shellConfirmDestructive),
      auto_save_conversations: Boolean(autoSaveConversations),
      http_proxy: httpProxy.trim(),
      https_proxy: httpsProxy.trim(),
      no_proxy: noProxy.trim(),
      theme,
      openai_api_key: openaiKey || undefined,
      groq_api_key: groqKey || undefined,
      anthropic_api_key: anthropicKey || undefined,
      custom_api_key: customKey || undefined,
      gemini_api_key: geminiKey || undefined,
      openrouter_api_key: openrouterKey || undefined,
    };
    const ok = await updateSettings(updates);
    if (ok) {
      setSaveSuccess(true);
      setOpenaiKey('');
      setGroqKey('');
      setAnthropicKey('');
      setCustomKey('');
      setGeminiKey('');
      setOpenrouterKey('');
      setTimeout(() => setSaveSuccess(false), 3000);
    }
    setIsSaving(false);
  }, [
    shellTimeout, maxIterations, workspaceDir, dataDir,
    shellConfirmDestructive, autoSaveConversations,
    httpProxy, httpsProxy, noProxy, theme,
    openaiKey, groqKey, anthropicKey, customKey, geminiKey, openrouterKey,
    updateSettings
  ]);

  const tabs = [
    { id: 'general', icon: Settings, label: 'General' },
    { id: 'credentials', icon: Key, label: 'Credentials' },
    { id: 'execution', icon: Terminal, label: 'Execution & Jail' },
    { id: 'appearance', icon: Palette, label: 'Appearance' },
    { id: 'data', icon: Database, label: 'Data & Storage' },
    { id: 'advanced', icon: Network, label: 'Network & Proxy' },
  ];

  const [activeTab, setActiveTab] = useState('general');

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 animate-fade-in">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h2 className="text-2xl font-bold text-[var(--fg-primary)] tracking-tight flex items-center gap-3">
            <Settings size={28} className="text-[var(--accent-400)]" />
            Application Settings
          </h2>
          <p className="text-[var(--fg-muted)] text-sm mt-1">
            Configure secure credentials, workspace isolation, human approval gates, and network proxy
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="btn btn-primary btn-md gap-2"
        >
          {isSaving && <RefreshCw size={16} className="animate-spin" />}
          <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
          {saveSuccess && <CheckCircle2 size={16} className="text-[var(--success)]" />}
        </button>
      </motion.div>

      {/* Tab Navigation */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card p-1 flex flex-wrap gap-1"
      >
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all',
              activeTab === tab.id
                ? 'bg-[var(--brand-500)] text-[var(--fg-primary)] shadow-[var(--shadow-sm)]'
                : 'text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-hover)]'
            )}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </motion.div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="card p-6 space-y-6"
        >
          {/* General Tab */}
          {activeTab === 'general' && (
            <GeneralTab settingsData={settingsData} />
          )}

          {/* Credentials Tab */}
          {activeTab === 'credentials' && (
            <div className="space-y-6">
              <div className="p-4 bg-[var(--bg-input)] rounded-xl border border-[var(--border-default)]">
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <Key size={20} className="text-[var(--accent-400)]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--fg-primary)]">Encrypted Credentials Store</h3>
                    <p className="text-sm text-[var(--fg-secondary)]">Keys are stored in OS Keyring, masked in UI, and never exposed to models.</p>
                  </div>
                </div>
              </div>

              <CredentialField
                label="OpenAI API Key"
                placeholder="sk-..."
                value={openaiKey}
                onChange={setOpenaiKey}
                show={showOpenaiKey}
                onToggleShow={setShowOpenaiKey}
                configured={settingsData?.credentials?.openai?.configured}
                icon={<Brain size={18} className="text-green-400" />}
                helpText="OpenAI models: gpt-4o, o3-mini, o1"
              />
              <CredentialField
                label="Anthropic API Key"
                placeholder="sk-ant-..."
                value={anthropicKey}
                onChange={setAnthropicKey}
                show={showAnthropicKey}
                onToggleShow={setShowAnthropicKey}
                configured={settingsData?.credentials?.anthropic?.configured}
                icon={<Sparkles size={18} className="text-orange-400" />}
                helpText="Anthropic models: claude-3-7-sonnet, claude-3-5-sonnet"
              />
              <CredentialField
                label="Groq API Key"
                placeholder="gsk_..."
                value={groqKey}
                onChange={setGroqKey}
                show={showGroqKey}
                onToggleShow={setShowGroqKey}
                configured={settingsData?.credentials?.groq?.configured}
                icon={<Zap size={18} className="text-emerald-400" />}
                helpText="Groq fast inference: llama-3.3-70b-versatile"
              />
              <CredentialField
                label="Google Gemini API Key"
                placeholder="AIzaSy..."
                value={geminiKey}
                onChange={setGeminiKey}
                show={showGeminiKey}
                onToggleShow={setShowGeminiKey}
                configured={settingsData?.credentials?.gemini?.configured}
                icon={<Sparkles size={18} className="text-blue-400" />}
                helpText="Google Gemini: gemini-2.0-flash, gemini-1.5-pro"
              />
              <CredentialField
                label="OpenRouter API Key"
                placeholder="sk-or-..."
                value={openrouterKey}
                onChange={setOpenrouterKey}
                show={showOpenrouterKey}
                onToggleShow={setShowOpenrouterKey}
                configured={settingsData?.credentials?.openrouter?.configured}
                icon={<Network size={18} className="text-purple-400" />}
                helpText="Access 100+ models via openrouter.ai"
              />
              <CredentialField
                label="Universal / Custom API Key"
                placeholder="API Key for custom OpenAI-compatible endpoint"
                value={customKey}
                onChange={setCustomKey}
                show={showCustomKey}
                onToggleShow={setShowCustomKey}
                configured={settingsData?.credentials?.custom?.configured}
                icon={<Terminal size={18} className="text-cyan-400" />}
                helpText="DeepSeek, Together, vLLM, LM Studio, or local servers"
              />
            </div>
          )}

          {/* Execution & Jail Tab */}
          {activeTab === 'execution' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-[var(--fg-primary)] mb-4 flex items-center gap-2">
                  <Shield size={20} className="text-[var(--brand-400)]" />
                  Workspace Jail & Safety Boundaries
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-[var(--fg-muted)] mb-1">
                      Active Workspace Root (Strict Security Boundary)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={workspaceDir}
                        onChange={e => setWorkspaceDir(e.target.value)}
                        placeholder="Path to workspace directory"
                        className="input font-mono flex-1 text-xs"
                      />
                    </div>
                    <p className="text-xs text-[var(--fg-muted)] mt-1">
                      All file operations and shell commands run strictly jailed inside this folder. The agent cannot modify its own source code.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-[var(--fg-muted)] mb-1 flex items-center justify-between">
                        <span>Command Execution Timeout (Seconds)</span>
                        <span className="font-mono">{shellTimeout}s</span>
                      </label>
                      <input
                        type="number"
                        min="5"
                        max="300"
                        value={shellTimeout}
                        onChange={e => setShellTimeout(Number(e.target.value))}
                        className="input text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--fg-muted)] mb-1 flex items-center justify-between">
                        <span>Max Agent Iterations</span>
                        <span className="font-mono">{maxIterations}</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={maxIterations}
                        onChange={e => setMaxIterations(Number(e.target.value))}
                        className="input text-sm"
                      />
                    </div>
                  </div>

                  {/* Confirm Destructive Commands Real Toggle */}
                  <div className="flex items-center justify-between p-4 bg-[var(--bg-input)] rounded-xl border border-[var(--border-default)]">
                    <div>
                      <div className="font-medium text-[var(--fg-primary)]">Human Approval Gate (LangGraph Interrupt)</div>
                      <div className="text-xs text-[var(--fg-muted)]">
                        Prompt user with an on-screen Approve/Deny modal before executing shell commands, file deletions, or destructive operations.
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={shellConfirmDestructive}
                        onChange={e => setShellConfirmDestructive(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-[var(--bg-hover)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--brand-500)]"></div>
                    </label>
                  </div>

                  {/* Auto-save conversations Real Toggle */}
                  <div className="flex items-center justify-between p-4 bg-[var(--bg-input)] rounded-xl border border-[var(--border-default)]">
                    <div>
                      <div className="font-medium text-[var(--fg-primary)]">Auto-Save Conversations to SQLite Threads</div>
                      <div className="text-xs text-[var(--fg-muted)]">
                        Persist conversation history and execution steps across app restarts.
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoSaveConversations}
                        onChange={e => setAutoSaveConversations(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-[var(--bg-hover)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--brand-500)]"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-[var(--fg-primary)] mb-4 flex items-center gap-2">
                  <Palette size={20} className="text-[var(--brand-400)]" />
                  Theme & Appearance
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {['dark', 'light', 'system'].map(t => (
                    <button
                      key={t}
                      onClick={() => setThemeState(t)}
                      className={cn(
                        'p-4 rounded-xl border-2 transition-all',
                        theme === t
                          ? 'border-[var(--brand-500)] bg-cyan-500/5 shadow-[var(--glow-brand)]'
                          : 'border-[var(--border-default)] hover:border-[var(--border-emphasized)]'
                      )}
                    >
                      <div className="font-medium text-[var(--fg-primary)] capitalize">{t}</div>
                      <div className="text-xs text-[var(--fg-muted)] mt-1">
                        {t === 'dark' ? 'Sleek dark mode' : t === 'light' ? 'Light mode' : 'Follow system setting'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Data & Storage Tab */}
          {activeTab === 'data' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-[var(--fg-primary)] mb-4 flex items-center gap-2">
                  <HardDrive size={20} className="text-[var(--accent-400)]" />
                  Data Directory & Storage Paths
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-[var(--fg-muted)] mb-1">
                      Rajjo Base Data Directory
                    </label>
                    <input
                      type="text"
                      value={dataDir}
                      onChange={e => setDataDir(e.target.value)}
                      placeholder="e.g. D:\RajjoData or ~/.rajjo"
                      className="input font-mono text-xs w-full"
                    />
                    <p className="text-xs text-[var(--fg-muted)] mt-1">
                      Contains SQLite databases, semantic memory vector store, logs, and screenshots.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <StorageItem label="Episodic Memory" value="SQLite (rajjo.db)" icon={FileText} />
                    <StorageItem label="Semantic Store" value="Local Vectors (Deterministic)" icon={Brain} />
                    <StorageItem label="Model Cache" value="In-Memory RAM" icon={Cpu} />
                    <StorageItem label="Screenshots" value="Local Folder" icon={Camera} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Network & Proxy Tab */}
          {activeTab === 'advanced' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-[var(--fg-primary)] mb-4 flex items-center gap-2">
                  <Network size={20} className="text-[var(--accent-400)]" />
                  Network Proxy Configuration
                </h3>
                <p className="text-sm text-[var(--fg-secondary)] mb-4">
                  Proxies are automatically propagated to all backend HTTP clients (urllib, httpx, requests, and model router).
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-[var(--fg-muted)] mb-1">HTTP Proxy</label>
                    <input
                      type="text"
                      value={httpProxy}
                      onChange={e => setHttpProxy(e.target.value)}
                      className="input font-mono text-xs"
                      placeholder="http://127.0.0.1:8080 or http://proxy.corp.net:3128"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--fg-muted)] mb-1">HTTPS Proxy</label>
                    <input
                      type="text"
                      value={httpsProxy}
                      onChange={e => setHttpsProxy(e.target.value)}
                      className="input font-mono text-xs"
                      placeholder="http://127.0.0.1:8080 or https://proxy.corp.net:3128"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--fg-muted)] mb-1">No Proxy (Bypass Hosts)</label>
                    <input
                      type="text"
                      value={noProxy}
                      onChange={e => setNoProxy(e.target.value)}
                      className="input font-mono text-xs"
                      placeholder="localhost,127.0.0.1,.local"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}