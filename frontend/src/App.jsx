import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Cpu,
  Wrench,
  Database,
  Settings,
  Send,
  Bot,
  User,
  Minus,
  Square,
  X,
  Plus,
  Camera,
  Mail,
  ArrowRightLeft,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  Terminal,
  Globe,
  Compass,
  FileText,
  Trash2,
  Download,
  Upload,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Play,
  Eye,
  Layers,
  Sparkles,
  StopCircle,
  Menu,
  X as XIcon,
  Sun,
  Moon,
  Monitor,
  Smartphone,
  Zap,
  Brain,
  Network,
  HardDrive,
  Cloud,
  Key,
  Lock,
  Unlock,
  Activity,
  BarChart3,
  GitBranch,
  Link2,
  Wifi,
  WifiOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Copy,
  Edit2,
  MoreVertical,
  Filter,
  Clock,
  History,
  BookOpen,
  Lightbulb,
  Star,
  Heart,
  Share2,
  Flag,
  Bell,
  BellOff,
  LayoutDashboard,
  Terminal as TerminalIcon,
  Server,
  Database as DatabaseIcon,
  Code,
  Layers as LayersIcon,
  Wand2,
  Palette,
  Contrast,
  Move,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Fullscreen,
  Minimize2,
  Maximize2,
  PanelLeft,
  PanelRight,
  PanelTop,
  PanelBottom,
  SplitSquareHorizontal,
  SplitSquareVertical,
  Grid,
  List,
  Table,
  Kanban,
  Calendar,
  Clock as ClockIcon,
  Timer,
  AlarmClock,
  CalendarDays,
  CalendarRange,
  CalendarCheck,
  CalendarX,
  CalendarPlus,
  CalendarMinus,
  CalendarSearch,
  CalendarClock,
  CalendarArrowUp,
  CalendarArrowDown,
} from 'lucide-react';
import { useStore } from './store/useStore';
import { cn } from './lib/utils';
import MarkdownRenderer from './components/MarkdownRenderer';
import LiveExecutionViewer from './components/LiveExecutionViewer';
import ModelManager from './components/ModelManager';
import ToolManager from './components/ToolManager';
import MemoryViewer from './components/MemoryViewer';
import SettingsPanel from './components/SettingsPanel';
import CommandPalette from './components/CommandPalette';
import ToastContainer from './components/ToastContainer';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ChatArea from './components/ChatArea';
import './design-system.css';

// Main App Component
export default function App() {
  const {
    activeTab,
    setActiveTab,
    checkHealth,
    fetchModels,
    isProcessing,
    healthData,
    theme,
    setTheme,
    sidebarOpen,
    setSidebarOpen,
    commandPaletteOpen,
    setCommandPaletteOpen,
  } = useStore();

  const [isVisibleWindowOpen, setIsVisibleWindowOpen] = useState(false);
  const [visibleActivities, setVisibleActivities] = useState([]);
  const [liveStreamMsg, setLiveStreamMsg] = useState('');
  const abortTaskRef = useRef(null);
  const [toasts, setToasts] = useState([]);

  // Initialize
  useEffect(() => {
    checkHealth();
    fetchModels();
    const interval = setInterval(() => checkHealth(), 5000);
    return () => clearInterval(interval);
  }, [checkHealth, fetchModels]);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const handleAbortTask = useCallback(() => {
    if (abortTaskRef.current) {
      abortTaskRef.current();
    }
  }, []);

  const addToast = useCallback((toast) => {
    const id = Date.now();
    setToasts(prev => [...prev, { ...toast, id }]);
    if (toast.duration !== 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, toast.duration || 4000);
    }
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Cmd/Ctrl + K for command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
      // Cmd/Ctrl + B for sidebar toggle
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setSidebarOpen(!sidebarOpen);
      }
      // Escape to close modals
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
        if (isVisibleWindowOpen) setIsVisibleWindowOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sidebarOpen, setSidebarOpen, setCommandPaletteOpen, isVisibleWindowOpen]);

  const tabConfig = [
    { id: 'chat', icon: MessageSquare, label: 'Chat', short: 'Agent' },
    { id: 'models', icon: Cpu, label: 'Models', short: 'LLM' },
    { id: 'tools', icon: Wrench, label: 'Tools', short: 'Auto' },
    { id: 'memory', icon: Database, label: 'Memory', short: 'Brain' },
    { id: 'mcp', icon: Link2, label: 'MCP', short: 'Ext' },
    { id: 'agents', icon: GitBranch, label: 'Agents', short: 'Team' },
    { id: 'settings', icon: Settings, label: 'Settings', short: 'Cfg' },
  ];

  return (
    <div className="flex flex-col h-screen w-full bg-[var(--bg-deepest)] text-[var(--fg-primary)] overflow-hidden font-sans">
      {/* Global background mesh gradient */}
      <div className="fixed inset-0 bg-gradient-mesh pointer-events-none z-[var(--z-base)]" aria-hidden="true" />

      {/* Header */}
      <Header
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        sidebarOpen={sidebarOpen}
        isVisibleWindowOpen={isVisibleWindowOpen}
        onToggleVisibleWindow={() => setIsVisibleWindowOpen(!isVisibleWindowOpen)}
        isProcessing={isProcessing}
        onAbort={handleAbortTask}
        healthData={healthData}
        theme={theme}
        onThemeChange={setTheme}
        onCommandPalette={() => setCommandPaletteOpen(true)}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar */}
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          tabs={tabConfig}
          healthData={healthData}
          isProcessing={isProcessing}
        />

        {/* Main Content */}
        <main className="flex-1 relative overflow-hidden bg-[var(--bg-deepest)]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="h-full w-full overflow-y-auto"
            >
              {activeTab === 'chat' && (
                <ChatArea
                  onTriggerVisibleWindow={(open) => setIsVisibleWindowOpen(open)}
                  setVisibleActivities={setVisibleActivities}
                  setLiveStreamMsg={setLiveStreamMsg}
                  onAbortTaskRef={abortTaskRef}
                />
              )}
              {activeTab === 'models' && <ModelManager />}
              {activeTab === 'tools' && <ToolManager />}
              {activeTab === 'memory' && <MemoryViewer />}
              {activeTab === 'mcp' && <MCPManager />}
              {activeTab === 'agents' && <AgentManager />}
              {activeTab === 'settings' && <SettingsPanel />}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Floating Visible Agent Execution Window */}
        <LiveExecutionViewer
          isOpen={isVisibleWindowOpen}
          onClose={() => setIsVisibleWindowOpen(false)}
          onAbort={handleAbortTask}
          activities={visibleActivities}
          liveMessage={liveStreamMsg}
          isProcessing={isProcessing}
          activeModel={healthData ? `${healthData.active_provider}:${healthData.active_model_id}` : ''}
        />
      </div>

      {/* Command Palette */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        healthData={healthData}
        isProcessing={isProcessing}
        onAbort={handleAbortTask}
        onToggleVisibleWindow={() => setIsVisibleWindowOpen(!isVisibleWindowOpen)}
        theme={theme}
        onThemeChange={setTheme}
      />

      {/* Toast Container */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}

// Placeholder components for new tabs
function MCPManager() {
  const { mcpServers, fetchMCPServers, toggleMCPServer, addMCPServer, removeMCPServer } = useStore();
  const [showAddServer, setShowAddServer] = useState(false);
  const [newServer, setNewServer] = useState({ name: '', command: '', args: '', env: {} });

  useEffect(() => {
    fetchMCPServers();
  }, [fetchMCPServers]);

  const quickAddMCP = async (server) => {
    await addMCPServer({
      name: server.name.toLowerCase().replace(/\s+/g, '-'),
      command: 'npx',
      args: ['-y', `@modelcontextprotocol/server-${server.id}`],
      env: {}
    });
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!newServer.name || !newServer.command) return;
    const argsArr = newServer.args.trim() ? newServer.args.trim().split(/\s+/) : [];
    await addMCPServer({
      name: newServer.name.trim(),
      command: newServer.command.trim(),
      args: argsArr,
      env: newServer.env || {}
    });
    setNewServer({ name: '', command: '', args: '', env: {} });
    setShowAddServer(false);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[var(--fg-primary)] tracking-tight">MCP Server Manager</h2>
          <p className="text-[var(--fg-muted)] text-sm mt-1">Manage Model Context Protocol servers for extended capabilities</p>
        </div>
        <button
          onClick={() => setShowAddServer(true)}
          className="btn btn-primary btn-md"
        >
          <Plus size={16} /> Add Server
        </button>
      </div>

      {showAddServer && (
        <div className="card p-6 border-cyan-500/30 bg-[var(--bg-elevated)] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-[var(--fg-primary)]">Add New MCP Server</h3>
            <button onClick={() => setShowAddServer(false)} className="btn btn-ghost btn-sm p-1">
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleAddSubmit} className="space-y-3">
            <div>
              <label className="block text-xs text-[var(--fg-secondary)] mb-1">Server Name</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. filesystem"
                value={newServer.name}
                onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[var(--fg-secondary)] mb-1">Command</label>
                <input
                  type="text"
                  className="input font-mono"
                  placeholder="e.g. npx"
                  value={newServer.command}
                  onChange={(e) => setNewServer({ ...newServer, command: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--fg-secondary)] mb-1">Arguments</label>
                <input
                  type="text"
                  className="input font-mono"
                  placeholder="e.g. -y @modelcontextprotocol/server-filesystem C:\Users"
                  value={newServer.args}
                  onChange={(e) => setNewServer({ ...newServer, args: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowAddServer(false)} className="btn btn-ghost btn-md">
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-md">
                Save & Connect
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card p-6 space-y-4">
        {(!mcpServers || mcpServers.length === 0) ? (
          <div className="empty-state">
            <Link2 className="empty-state-icon" size={64} />
            <h3 className="empty-state-title">No MCP Servers Configured</h3>
            <p className="empty-state-desc">Add MCP servers to extend Rajjo with WhatsApp, Instagram, Telegram, file systems, databases, and more.</p>
            <button className="btn btn-primary btn-md mt-4" onClick={() => setShowAddServer(true)}>
              <Plus size={16} /> Add Your First Server
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {mcpServers.map(server => (
              <div key={server.name} className="flex items-center justify-between p-4 bg-[var(--bg-input)] rounded-xl border border-[var(--border-default)] transition-all hover:border-[var(--border-emphasized)]">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/15 flex items-center justify-center">
                    <Server size={20} className="text-[var(--brand-400)]" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-[var(--fg-primary)]">{server.name}</h4>
                    <p className="text-xs text-[var(--fg-muted)] font-mono">{server.command} {Array.isArray(server.args) ? server.args.join(' ') : (server.args || '')}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn(
                        "badge badge-sm",
                        server.status === 'connected' ? 'badge-success' : 'badge-danger'
                      )}>
                        {server.status === 'connected' ? 'Connected' : 'Disconnected'}
                      </span>
                      <span className="text-xs text-[var(--fg-muted)]">{server.tools?.length || 0} tools</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleMCPServer(server.name, server.status !== 'connected')}
                    className="btn btn-sm btn-ghost"
                    title={server.status === 'connected' ? 'Disconnect' : 'Connect'}
                  >
                    {server.status === 'connected' ? <WifiOff size={16} /> : <Wifi size={16} />}
                  </button>
                  <button
                    onClick={() => removeMCPServer(server.name)}
                    className="btn btn-sm btn-ghost text-[var(--danger)] hover:bg-[var(--danger-bg)]"
                    title="Remove"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Popular MCP Servers Quick Add */}
      <div className="card p-6">
        <h3 className="font-semibold text-[var(--fg-primary)] mb-4">Popular MCP Servers</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {popularMCPServers.map(server => (
            <button
              key={server.id}
              onClick={() => quickAddMCP(server)}
              className="card-interactive p-4 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--bg-hover)] flex items-center justify-center">
                  {server.icon}
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-[var(--fg-primary)]">{server.name}</h4>
                  <p className="text-xs text-[var(--fg-muted)]">{server.description}</p>
                </div>
                <Plus size={18} className="text-[var(--fg-muted)]" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const popularMCPServers = [
  { id: 'whatsapp', name: 'WhatsApp', description: 'Send/receive messages, manage chats', icon: <MessageSquare size={20} className="text-green-500" /> },
  { id: 'telegram', name: 'Telegram', description: 'Full Telegram bot & user API', icon: <Send size={20} className="text-blue-500" /> },
  { id: 'instagram', name: 'Instagram', description: 'DM automation, media management', icon: <Camera size={20} className="text-pink-500" /> },
  { id: 'gmail', name: 'Gmail', description: 'Email read/send/search', icon: <Mail size={20} className="text-red-500" /> },
  { id: 'filesystem', name: 'File System', description: 'Read/write/list files anywhere', icon: <FolderOpen size={20} className="text-[var(--brand-400)]" /> },
  { id: 'postgres', name: 'PostgreSQL', description: 'Query & manage databases', icon: <DatabaseIcon size={20} className="text-blue-600" /> },
];

function AgentManager() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-[var(--fg-primary)] tracking-tight">Multi-Agent Orchestration</h2>
        <p className="text-[var(--fg-muted)] text-sm mt-1">Spawn, coordinate, and manage autonomous agent workflows</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Agent Spawner */}
        <div className="card p-6 space-y-4">
          <h3 className="font-semibold text-[var(--fg-primary)] flex items-center gap-2">
            <Zap size={20} className="text-[var(--brand-400)]" />
            Spawn New Agent
          </h3>
          <p className="text-sm text-[var(--fg-muted)]">Launch independent agent processes for parallel workstreams</p>
          
          <div className="space-y-3 pt-2">
            <label className="block text-xs text-[var(--fg-secondary)]">Agent Role</label>
            <select className="input">
              <option value="coder">💻 Code Agent - Feature development, refactoring</option>
              <option value="researcher">🔬 Research Agent - Deep web research, analysis</option>
              <option value="reviewer">👁️ Review Agent - Code review, security audit</option>
              <option value="designer">🎨 Design Agent - UI/UX, prototypes, design systems</option>
              <option value="orchestrator">🎭 Orchestrator - Coordinate multiple agents</option>
            </select>
            
            <label className="block text-xs text-[var(--fg-secondary)]">Task Description</label>
            <textarea className="input" rows={4} placeholder="Describe the task for this agent..." />
            
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-[var(--fg-secondary)] cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-[var(--border-default)] bg-[var(--bg-input)] accent-[var(--brand-500)]" />
                Run in background (tmux)
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--fg-secondary)] cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-[var(--border-default)] bg-[var(--bg-input)] accent-[var(--brand-500)]" />
                Enable delegation
              </label>
            </div>
            
            <button className="btn btn-primary w-full">Spawn Agent</button>
          </div>
        </div>

        {/* Active Agents */}
        <div className="card p-6 space-y-4">
          <h3 className="font-semibold text-[var(--fg-primary)] flex items-center justify-between">
            <span><GitBranch size={20} className="text-[var(--accent-400)]" /> Active Agents</span>
            <span className="badge badge-brand">3 running</span>
          </h3>
          
          <div className="space-y-3">
            {activeAgents.map(agent => (
              <div key={agent.id} className="p-4 bg-[var(--bg-input)] rounded-xl border border-[var(--border-default)]">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-cyan-500/15 flex items-center justify-center shrink-0">
                      {agent.icon}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-medium text-[var(--fg-primary)] truncate">{agent.name}</h4>
                      <p className="text-xs text-[var(--fg-muted)] truncate">{agent.task}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className={cn("badge badge-xs", agent.status === 'running' ? 'badge-success' : 'badge-warning')}>
                          {agent.status}
                        </span>
                        <span className="text-xs text-[var(--fg-muted)] font-mono">{agent.duration}</span>
                        <span className="text-xs text-[var(--fg-muted)]">{agent.tools} tools</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button className="btn btn-sm btn-ghost" title="View logs"><TerminalIcon size={14} /></button>
                    <button className="btn btn-sm btn-ghost" title="Steer"><Move size={14} /></button>
                    <button className="btn btn-sm btn-ghost text-[var(--danger)] hover:bg-[var(--danger-bg)]" title="Stop"><Square size={14} /></button>
                  </div>
                </div>
                <div className="mt-3 h-2 bg-[var(--bg-deep)] rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--brand-500)] rounded-full transition-all duration-500" style={{ width: `${agent.progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Agent Templates */}
      <div className="card p-6">
        <h3 className="font-semibold text-[var(--fg-primary)] mb-4 flex items-center gap-2">
          <BookOpen size={20} className="text-[var(--accent-400)]" />
          Agent Templates & Workflows
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {agentTemplates.map(template => (
            <button key={template.id} className="card-interactive p-4 text-left">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--bg-hover)] flex items-center justify-center shrink-0">
                  {template.icon}
                </div>
                <div>
                  <h4 className="font-medium text-[var(--fg-primary)]">{template.name}</h4>
                  <p className="text-xs text-[var(--fg-muted)]">{template.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    {template.tags.map(tag => (
                      <span key={tag} className="badge badge-xs badge-default">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const activeAgents = [
  { id: 1, name: 'Backend API Agent', task: 'Building REST API with authentication', status: 'running', duration: '2m 34s', progress: 65, tools: 12, icon: <Server size={18} className="text-[var(--brand-400)]" /> },
  { id: 2, name: 'Frontend Dashboard Agent', task: 'Creating React dashboard components', status: 'running', duration: '1m 12s', progress: 40, tools: 8, icon: <LayoutDashboard size={18} className="text-[var(--accent-400)]" /> },
  { id: 3, name: 'Test Writer Agent', task: 'Generating unit & integration tests', status: 'waiting', duration: '0s', progress: 0, tools: 5, icon: <CheckCircle2 size={18} className="text-[var(--success)]" /> },
];

const agentTemplates = [
  { id: 'fullstack', name: 'Full-Stack Feature', description: 'Backend API + Frontend UI + Tests', icon: <GitBranch size={20} className="text-[var(--brand-400)]" />, tags: ['backend', 'frontend', 'testing'] },
  { id: 'refactor', name: 'Code Refactoring', description: 'Analyze, plan, and execute refactoring', icon: <RotateCw size={20} className="text-[var(--accent-400)]" />, tags: ['cleanup', 'architecture'] },
  { id: 'research', name: 'Deep Research', description: 'Multi-source research with citations', icon: <Lightbulb size={20} className="text-[var(--success)]" />, tags: ['web', 'analysis', 'report'] },
  { id: 'debug', name: 'Bug Investigation', description: 'Systematic debugging & root cause', icon: <Search size={20} className="text-[var(--danger)]" />, tags: ['debug', 'analysis', 'fix'] },
  { id: 'migrate', name: 'Migration Assistant', description: 'Framework/library migration guide', icon: <ArrowRightLeft size={20} className="text-[var(--info)]" />, tags: ['migration', 'upgrade'] },
  { id: 'docs', name: 'Documentation Writer', description: 'Generate comprehensive docs from code', icon: <FileText size={20} className="text-[var(--fg-muted)]" />, tags: ['docs', 'api', 'guides'] },
];