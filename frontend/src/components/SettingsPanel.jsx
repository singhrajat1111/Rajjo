import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings,
  Key,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Save,
  RefreshCw,
  FolderOpen,
  HardDrive,
  Database,
  Shield,
  Bell,
  BellOff,
  Moon,
  Sun,
  Monitor,
  Smartphone,
  Tablet,
  Laptop,
  Palette,
  Contrast,
  Wand2,
  LayoutDashboard,
  Terminal,
  Server,
  Code,
  Layers,
  Network,
  Globe,
  Zap,
  Brain,
  Activity,
  BarChart3,
  GitBranch,
  Link2,
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
  HelpCircle,
  User,
  LogOut,
  Info,
  AlertCircle,
  CheckCircle2,
  Wrench,
  Cpu,
  MessageSquare,
  Sparkles,
  FileText,
  Camera,
  Wrench as WrenchIcon,
  Database as DatabaseIcon,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { cn, formatBytes } from '../lib/utils';

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
  const [shellTimeout, setShellTimeout] = useState(30);
  const [maxIterations, setMaxIterations] = useState(10);
  const [theme, setThemeState] = useState('dark');
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showCustomKey, setShowCustomKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    fetchSettings();
    if (settingsData?.settings?.theme) {
      setThemeState(settingsData.settings.theme);
    }
    if (settingsData?.settings?.shell_timeout) {
      setShellTimeout(settingsData.settings.shell_timeout);
    }
    if (settingsData?.settings?.max_iterations) {
      setMaxIterations(settingsData.settings.max_iterations);
    }
  }, [fetchSettings, settingsData]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    const updates = {
      shell_timeout: Number(shellTimeout),
      max_iterations: Number(maxIterations),
      theme,
      openai_api_key: openaiKey || undefined,
      groq_api_key: groqKey || undefined,
      anthropic_api_key: anthropicKey || undefined,
      custom_api_key: customKey || undefined,
    };
    const ok = await updateSettings(updates);
    if (ok) {
      setSaveSuccess(true);
      setOpenaiKey('');
      setGroqKey('');
      setAnthropicKey('');
      setCustomKey('');
      setTimeout(() => setSaveSuccess(false), 3000);
    }
    setIsSaving(false);
  }, [shellTimeout, maxIterations, theme, openaiKey, groqKey, anthropicKey, customKey, updateSettings]);

  const tabs = [
    { id: 'general', icon: Settings, label: 'General' },
    { id: 'credentials', icon: Key, label: 'Credentials' },
    { id: 'execution', icon: Terminal, label: 'Execution' },
    { id: 'appearance', icon: Palette, label: 'Appearance' },
    { id: 'data', icon: Database, label: 'Data & Storage' },
    { id: 'advanced', icon: Wrench, label: 'Advanced' },
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
            Configure secure credentials, data storage paths, execution safety limits, and appearance
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
                    <div className="font-mono text-[var(--fg-primary)]">1.0.0</div>
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
          )}

          {/* Credentials Tab */}
          {activeTab === 'credentials' && (
            <div className="space-y-6">
              <div className="p-4 bg-[var(--bg-input)] rounded-xl border border-[var(--border-default)]">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <Key size={20} className="text-[var(--accent-400)]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--fg-primary)]">Secure API Credentials</h3>
                    <p className="text-sm text-[var(--fg-secondary)]">Keys are encrypted at rest, masked in UI, and never transmitted in plaintext.</p>
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
                helpText="Get your key at platform.openai.com/api-keys"
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
                helpText="Get your key at console.anthropic.com"
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
                helpText="Get your key at console.groq.com/keys"
              />
              <CredentialField
                label="Universal / Custom API Key"
                placeholder="sk-... or your universal key"
                value={customKey}
                onChange={setCustomKey}
                show={showCustomKey}
                onToggleShow={setShowCustomKey}
                configured={settingsData?.credentials?.custom?.configured}
                icon={<Globe size={18} className="text-purple-400" />}
                helpText="Works with DeepSeek, OpenRouter, Together AI, LM Studio, vLLM, and any OpenAI-compatible endpoint"
              />
            </div>
          )}

          {/* Execution Tab */}
          {activeTab === 'execution' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-[var(--fg-primary)] mb-4 flex items-center gap-2">
                  <Shield size={20} className="text-[var(--danger)]" />
                  Execution Safety & Limits
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-[var(--fg-muted)] mb-1 flex items-center justify-between">
                      Shell Execution Timeout (Seconds)
                      <span className="text-xs text-[var(--fg-muted)] font-mono">{shellTimeout}s</span>
                    </label>
                    <input
                      type="range"
                      min="5"
                      max="300"
                      step="5"
                      value={shellTimeout}
                      onChange={e => setShellTimeout(Number(e.target.value))}
                      className="w-full h-2 bg-[var(--bg-input)] rounded-lg appearance-none accent-[var(--brand-500)]"
                    />
                    <div className="flex justify-between text-xs text-[var(--fg-muted)] mt-1">
                      <span>5s (Fast)</span>
                      <span>300s (Long-running)</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-[var(--fg-muted)] mb-1 flex items-center justify-between">
                      Max Agent Iterations
                      <span className="text-xs text-[var(--fg-muted)] font-mono">{maxIterations}</span>
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="50"
                      step="1"
                      value={maxIterations}
                      onChange={e => setMaxIterations(Number(e.target.value))}
                      className="w-full h-2 bg-[var(--bg-input)] rounded-lg appearance-none accent-[var(--brand-500)]"
                    />
                    <div className="flex justify-between text-xs text-[var(--fg-muted)] mt-1">
                      <span>1 (Single step)</span>
                      <span>50 (Complex tasks)</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-[var(--bg-input)] rounded-xl border border-[var(--border-default)]">
                    <div>
                      <div className="font-medium text-[var(--fg-primary)]">Confirm Destructive Commands</div>
                      <div className="text-xs text-[var(--fg-muted)]">Require confirmation before running rm -rf, format, etc.</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" defaultChecked className="sr-only peer" />
                      <div className="w-11 h-6 bg-[var(--bg-hover)] peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[var(--brand-500)/20] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--brand-500)]"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-[var(--bg-input)] rounded-xl border border-[var(--border-default)]">
                    <div>
                      <div className="font-medium text-[var(--fg-primary)]">Allow Network Access</div>
                      <div className="text-xs text-[var(--fg-muted)]">Enable web search, browser automation, API calls</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" defaultChecked className="sr-only peer" />
                      <div className="w-11 h-6 bg-[var(--bg-hover)] peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[var(--brand-500)/20] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--brand-500)]"></div>
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-[var(--fg-primary)] mb-4 flex items-center gap-2">
                  <Terminal size={20} className="text-[var(--accent-400)]" />
                  Default Working Directory
                </h3>
                <div className="p-3 bg-[var(--bg-input)] rounded-xl border border-[var(--border-default)]">
                  <div className="font-mono text-sm text-[var(--fg-secondary)] truncate">
                    {settingsData?.settings?.data_dir || '~/.rajjo'}
                  </div>
                  <div className="text-xs text-[var(--fg-muted)] mt-1">Change via RAJJO_DATA_DIR environment variable</div>
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
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'w-10 h-10 rounded-xl flex items-center justify-center',
                          t === 'dark' && 'bg-[var(--bg-deep)]',
                          t === 'light' && 'bg-white',
                          t === 'system' && 'bg-gradient-to-br from-[var(--bg-deep)] to-white'
                        )}>
                          {t === 'dark' && <Moon size={20} className="text-[var(--fg-secondary)]" />}
                          {t === 'light' && <Sun size={20} className="text-[var(--fg-secondary)]" />}
                          {t === 'system' && <Monitor size={20} className="text-[var(--fg-secondary)]" />}
                        </div>
                        <div>
                          <div className="font-medium text-[var(--fg-primary)] capitalize">{t}</div>
                          <div className="text-xs text-[var(--fg-muted)]">
                            {t === 'dark' ? 'Dark mode always' : t === 'light' ? 'Light mode always' : 'Follow system'}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-[var(--fg-primary)] mb-4 flex items-center gap-2">
                  <Contrast size={20} className="text-[var(--accent-400)]" />
                  Accent Color
                </h3>
                <div className="flex flex-wrap gap-3">
                  {[
                    { name: 'Teal (Default)', css: 'var(--brand-500)', bg: 'var(--brand-500)' },
                    { name: 'Blue', css: '#3b82f6', bg: '#3b82f6' },
                    { name: 'Purple', css: '#a855f7', bg: '#a855f7' },
                    { name: 'Green', css: '#22c55e', bg: '#22c55e' },
                    { name: 'Orange', css: '#f97316', bg: '#f97316' },
                    { name: 'Red', css: '#ef4444', bg: '#ef4444' },
                    { name: 'Pink', css: '#ec4899', bg: '#ec4899' },
                    { name: 'Cyan', css: '#06b6d4', bg: '#06b6d4' },
                  ].map(color => (
                    <button
                      key={color.name}
                      className={cn(
                        'w-12 h-12 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-1',
                        theme === color.css ? 'border-[var(--fg-primary)] scale-110' : 'border-transparent hover:border-[var(--border-emphasized)]'
                      )}
                      style={{ backgroundColor: color.bg }}
                      onClick={() => document.documentElement.style.setProperty('--brand-500', color.css)}
                      title={color.name}
                    >
                      <span className="text-[10px] font-mono text-white/80">{color.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-[var(--fg-primary)] mb-4 flex items-center gap-2">
                  <Wand2 size={20} className="text-[var(--accent-400)]" />
                  UI Density
                </h3>
                <div className="flex gap-3">
                  {['comfortable', 'compact', 'spacious'].map(d => (
                    <button
                      key={d}
                      className={cn(
                        'flex-1 p-4 rounded-xl border-2 transition-all text-center',
                        theme === d ? 'border-[var(--brand-500)] bg-cyan-500/5' : 'border-[var(--border-default)] hover:border-[var(--border-emphasized)]'
                      )}
                    >
                      <div className="font-medium text-[var(--fg-primary)] capitalize">{d}</div>
                      <div className="text-xs text-[var(--fg-muted)]">
                        {d === 'comfortable' ? 'Default spacing' : d === 'compact' ? 'More content' : 'More breathing room'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-[var(--fg-primary)] mb-4 flex items-center gap-2">
                  <Monitor size={20} className="text-[var(--brand-400)]" />
                  Animations
                </h3>
                <div className="flex items-center justify-between p-3 bg-[var(--bg-input)] rounded-xl border border-[var(--border-default)]">
                  <div>
                    <div className="font-medium text-[var(--fg-primary)]">Reduce Motion</div>
                    <div className="text-xs text-[var(--fg-muted)]">Disable non-essential animations for accessibility</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" />
                    <div className="w-11 h-6 bg-[var(--bg-hover)] peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[var(--brand-500)/20] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--brand-500)]"></div>
                  </label>
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
                  Data Directory
                </h3>
                <div className="space-y-4">
                  <div className="p-4 bg-[var(--bg-input)] rounded-xl border border-[var(--border-default)]">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs text-[var(--fg-muted)]">Location</div>
                        <div className="font-mono text-sm text-[var(--fg-secondary)] truncate max-w-md">
                          {settingsData?.settings?.data_dir || '~/.rajjo'}
                        </div>
                      </div>
                      <button className="btn btn-outline btn-sm">Open Folder</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <StorageItem label="Episodic Memory" value={`${(settingsData?.storage?.episodic_size || 0).toFixed(2)} MB`} icon={FileText} />
                    <StorageItem label="Semantic Vectors" value={`${(settingsData?.storage?.semantic_size || 0).toFixed(2)} MB`} icon={Brain} />
                    <StorageItem label="Model Cache" value={`${(settingsData?.storage?.model_cache || 0).toFixed(2)} MB`} icon={Cpu} />
                    <StorageItem label="Screenshots" value={`${(settingsData?.storage?.screenshots || 0).toFixed(2)} MB`} icon={Camera} />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-[var(--fg-primary)] mb-4 flex items-center gap-2">
                  <Database size={20} className="text-purple-400" />
                  Memory Management
                </h3>
                <div className="space-y-3">
                  <button className="btn btn-outline w-full justify-start gap-3 p-4">
                    <RefreshCw size={20} className="text-[var(--brand-400)]" />
                    <div className="text-left">
                      <div className="font-medium text-[var(--fg-primary)]">Rebuild Semantic Index</div>
                      <div className="text-xs text-[var(--fg-muted)]">Re-index all semantic memories for better search</div>
                    </div>
                  </button>
                  <button className="btn btn-outline w-full justify-start gap-3 p-4 text-[var(--danger)] hover:bg-[var(--danger-bg)] border-[var(--danger-border)]">
                    <Trash2 size={20} />
                    <div className="text-left">
                      <div className="font-medium text-[var(--fg-primary)]">Clear All Memory</div>
                      <div className="text-xs text-[var(--fg-muted)]">Permanently delete all episodic and semantic data</div>
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-[var(--fg-primary)] mb-4 flex items-center gap-2">
                  <Download size={20} className="text-[var(--accent-400)]" />
                  Backup & Export
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <button className="btn btn-outline p-4 text-left">
                    <Download size={20} className="text-[var(--brand-400)]" />
                    <div className="mt-2">
                      <div className="font-medium text-[var(--fg-primary)]">Export All Data</div>
                      <div className="text-xs text-[var(--fg-muted)]">Download complete backup as JSON</div>
                    </div>
                  </button>
                  <button className="btn btn-outline p-4 text-left">
                    <Upload size={20} className="text-[var(--accent-400)]" />
                    <div className="mt-2">
                      <div className="font-medium text-[var(--fg-primary)]">Import Data</div>
                      <div className="text-xs text-[var(--fg-muted)]">Restore from a previous backup</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Advanced Tab */}
          {activeTab === 'advanced' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-[var(--fg-primary)] mb-4 flex items-center gap-2">
                  <Cpu size={20} className="text-[var(--brand-400)]" />
                  Model Router Configuration
                </h3>
                <div className="space-y-3">
                  <div className="p-3 bg-[var(--bg-input)] rounded-xl border border-[var(--border-default)]">
                    <div className="font-mono text-sm text-[var(--fg-secondary)]">Ollama Base URL</div>
                    <div className="text-xs text-[var(--fg-muted)] font-mono">{settingsData?.settings?.ollama_base_url || 'http://localhost:11434'}</div>
                  </div>
                  <div className="p-3 bg-[var(--bg-input)] rounded-xl border border-[var(--border-default)]">
                    <div className="font-mono text-sm text-[var(--fg-secondary)]">Default Provider</div>
                    <div className="text-xs text-[var(--fg-muted)] font-mono">{settingsData?.settings?.active_provider || 'universal'}</div>
                  </div>
                  <div className="p-3 bg-[var(--bg-input)] rounded-xl border border-[var(--border-default)]">
                    <div className="font-mono text-sm text-[var(--fg-secondary)]">Default Model</div>
                    <div className="text-xs text-[var(--fg-muted)] font-mono">{settingsData?.settings?.active_model_id || 'deepseek-chat'}</div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-[var(--fg-primary)] mb-4 flex items-center gap-2">
                  <Network size={20} className="text-[var(--accent-400)]" />
                  Network & Proxy
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-[var(--fg-muted)] mb-1">HTTP Proxy</label>
                    <input type="text" className="input input-lg font-mono" placeholder="http://proxy:8080" />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--fg-muted)] mb-1">HTTPS Proxy</label>
                    <input type="text" className="input input-lg font-mono" placeholder="http://proxy:8080" />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--fg-muted)] mb-1">No Proxy</label>
                    <input type="text" className="input input-lg font-mono" placeholder="localhost,127.0.0.1,.local" />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-[var(--fg-primary)] mb-4 flex items-center gap-2">
                  <AlertCircle size={20} className="text-[var(--danger)]" />
                  Danger Zone
                </h3>
                <div className="p-4 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-xl">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--danger)]/20 flex items-center justify-center">
                      <AlertCircle size={20} className="text-[var(--danger)]" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-[var(--danger)]">Irreversible Actions</h4>
                      <p className="text-sm text-[var(--fg-secondary)]">These actions cannot be undone. Proceed with caution.</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button className="btn btn-danger btn-sm">Reset All Settings</button>
                    <button className="btn btn-outline btn-sm text-[var(--danger)] border-[var(--danger-border)] hover:bg-[var(--danger-bg)]">Clear All Data</button>
                    <button className="btn btn-outline btn-sm text-[var(--danger)] border-[var(--danger-border)] hover:bg-[var(--danger-bg)]">Uninstall Rajjo</button>
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

function CredentialField({ label, placeholder, value, onChange, show, onToggleShow, configured, icon, helpText }) {
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

function StorageItem({ label, value, icon: Icon }) {
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