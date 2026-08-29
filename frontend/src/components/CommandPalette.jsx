import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Command,
  Search,
  ChevronDown,
  ChevronUp,
  Terminal,
  Globe,
  Brain,
  Zap,
  Settings,
  Wrench,
  Database,
  Link2,
  GitBranch,
  Monitor,
  Eye,
  Square,
  RefreshCw,
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
  HelpCircle,
  User,
  LogOut,
  Key,
  Lock,
  Unlock,
  Activity,
  BarChart3,
  LayoutDashboard,
  Server,
  Code,
  Layers,
  Wand2,
  Palette,
  Contrast,
  MessageSquare,
  Cpu,
  FolderOpen,
  Play,
  Search as SearchIcon,
  Sparkles,
  Network,
  HardDrive,
  Cloud,
  Shield,
  List,
} from 'lucide-react';
import { cn } from '../lib/utils';

const COMMANDS = [
  // Navigation
  { id: 'nav-chat', title: 'Go to Chat', description: 'Switch to chat workspace', category: 'Navigation', icon: MessageSquare, action: 'chat', keys: '⌘1' },
  { id: 'nav-models', title: 'Go to Models', description: 'Manage LLM models and providers', category: 'Navigation', icon: Cpu, action: 'models', keys: '⌘2' },
  { id: 'nav-tools', title: 'Go to Tools', description: 'Manage automation tools', category: 'Navigation', icon: Wrench, action: 'tools', keys: '⌘3' },
  { id: 'nav-memory', title: 'Go to Memory', description: 'View episodic and semantic memory', category: 'Navigation', icon: Database, action: 'memory', keys: '⌘4' },
  { id: 'nav-mcp', title: 'Go to MCP', description: 'Manage MCP servers', category: 'Navigation', icon: Link2, action: 'mcp', keys: '⌘5' },
  { id: 'nav-agents', title: 'Go to Agents', description: 'Multi-agent orchestration', category: 'Navigation', icon: GitBranch, action: 'agents', keys: '⌘6' },
  { id: 'nav-settings', title: 'Go to Settings', description: 'Open settings panel', category: 'Navigation', icon: Settings, action: 'settings', keys: '⌘,' },

  // Actions
  { id: 'action-new-chat', title: 'New Chat', description: 'Clear current conversation', category: 'Actions', icon: Plus, action: 'new-chat', keys: '⌘N' },
  { id: 'action-visible-window', title: 'Toggle Visible Window', description: 'Show/hide live agent browser', category: 'Actions', icon: Monitor, action: 'visible-window', keys: '⌘W' },
  { id: 'action-abort', title: 'Abort Current Task', description: 'Stop the running agent task', category: 'Actions', icon: Square, action: 'abort', keys: 'Esc' },
  { id: 'action-refresh', title: 'Refresh Backend', description: 'Reconnect to backend server', category: 'Actions', icon: RefreshCw, action: 'refresh', keys: '⌘R' },

  // Model Management
  { id: 'model-switch', title: 'Switch Model', description: 'Change active LLM model', category: 'Models', icon: Brain, action: 'switch-model' },
  { id: 'model-scan-ollama', title: 'Scan Ollama Models', description: 'Discover local Ollama models', category: 'Models', icon: HardDrive, action: 'scan-ollama' },
  { id: 'model-scan-cloud', title: 'Browse Ollama Cloud', description: 'Search Ollama model library', category: 'Models', icon: Cloud, action: 'scan-cloud' },
  { id: 'model-test', title: 'Test Model Connection', description: 'Verify current model is working', category: 'Models', icon: Activity, action: 'test-model' },

  // Tools
  { id: 'tool-add', title: 'Add Custom Tool', description: 'Create a new automation tool', category: 'Tools', icon: Plus, action: 'add-tool' },
  { id: 'tool-toggle', title: 'Toggle Tool', description: 'Enable/disable a tool', category: 'Tools', icon: Wrench, action: 'toggle-tool' },

  // Memory
  { id: 'memory-export', title: 'Export Memory', description: 'Download memory backup', category: 'Memory', icon: Download, action: 'export-memory' },
  { id: 'memory-import', title: 'Import Memory', description: 'Restore from backup', category: 'Memory', icon: Upload, action: 'import-memory' },
  { id: 'memory-clear-episodic', title: 'Clear Episodic Memory', description: 'Delete all task history', category: 'Memory', icon: Trash2, action: 'clear-episodic' },
  { id: 'memory-clear-semantic', title: 'Clear Semantic Memory', description: 'Delete all learned insights', category: 'Memory', icon: Trash2, action: 'clear-semantic' },

  // Settings
  { id: 'settings-theme', title: 'Toggle Theme', description: 'Switch between dark/light mode', category: 'Settings', icon: Contrast, action: 'toggle-theme' },
  { id: 'settings-credentials', title: 'Manage API Keys', description: 'Configure model credentials', category: 'Settings', icon: Key, action: 'manage-keys' },
  { id: 'settings-execution', title: 'Execution Limits', description: 'Configure timeouts and safety', category: 'Settings', icon: Shield, action: 'execution-limits' },

  // Agent Actions
  { id: 'agent-spawn', title: 'Spawn Agent', description: 'Launch new autonomous agent', category: 'Agents', icon: Plus, action: 'spawn-agent' },
  { id: 'agent-list', title: 'List Active Agents', description: 'View running agent processes', category: 'Agents', icon: List, action: 'list-agents' },
];

export default function CommandPalette({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  healthData,
  isProcessing,
  onAbort,
  onToggleVisibleWindow,
  theme,
  onThemeChange,
}) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Filter commands based on query
  const filteredCommands = COMMANDS.filter(cmd => {
    const searchText = `${cmd.title} ${cmd.description} ${cmd.category} ${cmd.keys || ''}`.toLowerCase();
    return searchText.includes(query.toLowerCase());
  });

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            executeCommand(filteredCommands[selectedIndex]);
          }
          break;
        case 'Escape':
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex, onClose]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const executeCommand = (cmd) => {
    switch (cmd.action) {
      case 'chat': case 'models': case 'tools': case 'memory': case 'mcp': case 'agents': case 'settings':
        onTabChange(cmd.action);
        break;
      case 'new-chat':
        window.dispatchEvent(new CustomEvent('clear-chat'));
        break;
      case 'visible-window':
        onToggleVisibleWindow();
        break;
      case 'abort':
        if (onAbort) onAbort();
        break;
      case 'refresh':
        window.dispatchEvent(new CustomEvent('check-health'));
        break;
      case 'switch-model':
        onTabChange('models');
        break;
      case 'scan-ollama':
        onTabChange('models');
        window.dispatchEvent(new CustomEvent('scan-ollama'));
        break;
      case 'scan-cloud':
        onTabChange('models');
        window.dispatchEvent(new CustomEvent('scan-ollama-cloud'));
        break;
      case 'test-model':
        onTabChange('models');
        window.dispatchEvent(new CustomEvent('test-model'));
        break;
      case 'add-tool':
        onTabChange('tools');
        window.dispatchEvent(new CustomEvent('add-tool'));
        break;
      case 'export-memory':
        onTabChange('memory');
        window.dispatchEvent(new CustomEvent('export-memory'));
        break;
      case 'import-memory':
        onTabChange('memory');
        window.dispatchEvent(new CustomEvent('import-memory'));
        break;
      case 'clear-episodic':
        onTabChange('memory');
        window.dispatchEvent(new CustomEvent('clear-episodic'));
        break;
      case 'clear-semantic':
        onTabChange('memory');
        window.dispatchEvent(new CustomEvent('clear-semantic'));
        break;
      case 'toggle-theme':
        onThemeChange(theme === 'dark' ? 'light' : 'dark');
        break;
      case 'manage-keys':
        onTabChange('settings');
        break;
      case 'execution-limits':
        onTabChange('settings');
        break;
      case 'spawn-agent':
        onTabChange('agents');
        window.dispatchEvent(new CustomEvent('spawn-agent'));
        break;
      case 'list-agents':
        onTabChange('agents');
        break;
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[var(--z-modal)] flex items-start justify-center pt-20"
        onClick={onClose}
      >
        <div className="w-full max-w-2xl mx-4" onClick={e => e.stopPropagation()}>
          {/* Search Input */}
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="relative bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-t-2xl shadow-[var(--shadow-xl)] overflow-hidden"
          >
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--fg-muted)]">
              <Command size={20} />
            </div>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Type a command or search..."
              className="w-full bg-transparent border-none outline-none px-12 py-4 pr-12 text-lg text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] font-mono"
              autoComplete="off"
              spellCheck={false}
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-[var(--fg-muted)]">
              <kbd className="px-2 py-1 text-[10px] font-mono bg-[var(--bg-deep)] border border-[var(--border-default)] rounded">⌘K</kbd>
              <kbd className="px-2 py-1 text-[10px] font-mono bg-[var(--bg-deep)] border border-[var(--border-default)] rounded">Esc</kbd>
            </div>
          </motion.div>

          {/* Results */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[var(--bg-elevated)] border border-[var(--border-default)] border-t-0 rounded-b-2xl shadow-[var(--shadow-xl)] overflow-hidden max-h-[60vh]"
          >
            {filteredCommands.length === 0 ? (
              <div className="p-8 text-center text-[var(--fg-muted)]">
                <SearchIcon size={32} className="mx-auto mb-3 opacity-50" />
                <p>No commands found for "{query}"</p>
                <p className="text-sm mt-1">Try a different search term</p>
              </div>
            ) : (
              <div className="max-h-[50vh] overflow-y-auto custom-scrollbar" ref={listRef}>
                <AnimatePresence mode="popLayout">
                  {filteredCommands.map((cmd, index) => (
                    <motion.button
                      key={cmd.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ delay: index * 0.02 }}
                      onClick={() => executeCommand(cmd)}
                      className={cn(
                        'w-full px-4 py-3 flex items-center gap-4 text-left transition-colors',
                        'hover:bg-[var(--bg-hover)]',
                        selectedIndex === index && 'bg-cyan-500/10 border-l-2 border-[var(--brand-500)]'
                      )}
                      style={{ outline: selectedIndex === index ? 'none' : 'none' }}
                    >
                      <div className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                        selectedIndex === index ? 'bg-cyan-500/20' : 'bg-[var(--bg-input)]'
                      )}>
                        <cmd.icon size={18} className={cn(
                          selectedIndex === index ? 'text-[var(--brand-400)]' : 'text-[var(--fg-muted)]'
                        )} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            'font-medium text-sm truncate',
                            selectedIndex === index ? 'text-[var(--fg-primary)]' : 'text-[var(--fg-secondary)]'
                          )}>
                            {cmd.title}
                          </span>
                          <span className={cn(
                            'badge badge-xs badge-default font-mono shrink-0',
                            selectedIndex === index ? 'bg-cyan-500/20 text-[var(--brand-300)] border-cyan-500/30' : ''
                          )}>
                            {cmd.category}
                          </span>
                        </div>
                        <p className={cn(
                          'text-xs truncate mt-0.5',
                          selectedIndex === index ? 'text-[var(--fg-muted)]' : 'text-[var(--fg-muted)]/70'
                        )}>
                          {cmd.description}
                        </p>
                      </div>
                      {cmd.keys && (
                        <kbd className={cn(
                          'px-2 py-1 text-[10px] font-mono rounded shrink-0',
                          selectedIndex === index
                            ? 'bg-cyan-500/20 text-[var(--brand-300)] border-cyan-500/30'
                            : 'bg-[var(--bg-input)] text-[var(--fg-muted)] border-[var(--border-default)]'
                        )}>
                          {cmd.keys}
                        </kbd>
                      )}
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* Footer Hint */}
            <div className="px-4 py-2 border-t border-[var(--border-default)] bg-[var(--bg-deep)]">
              <p className="text-xs text-[var(--fg-muted)] text-center">
                ↑↓ Navigate • Enter Execute • Esc Close
              </p>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}