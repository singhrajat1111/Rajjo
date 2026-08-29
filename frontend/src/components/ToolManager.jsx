import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wrench,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  Terminal,
  Globe,
  Search,
  Camera,
  MousePointer,
  Monitor,
  HardDrive,
  Server,
  Database,
  Code,
  Layers,
  Shield,
  Zap,
  Brain,
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
  Tablet,
  Laptop,
  Database as DatabaseIcon,
  LayoutDashboard,
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
  Settings,
  SlidersHorizontal,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { cn } from '../lib/utils';

export default function ToolManager() {
  const { toolsList, fetchTools, toggleTool, addCustomTool, removeCustomTool } = useStore();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showAddTool, setShowAddTool] = useState(false);
  const [newTool, setNewTool] = useState({
    name: '',
    description: '',
    category: 'Custom',
    schema: {},
  });

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  const categories = ['all', 'Filesystem', 'Shell Execution', 'Web Search', 'Browser Control', 'Visible Window & Browser', 'Custom'];

  const filteredTools = toolsList.filter(tool => {
    const matchesFilter = filter === 'all' || tool.category === filter;
    const matchesSearch = tool.name.toLowerCase().includes(search.toLowerCase()) ||
      tool.description.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const handleToggle = useCallback((name, enabled) => {
    toggleTool(name, enabled);
  }, [toggleTool]);

  const handleAddTool = useCallback(async (e) => {
    e.preventDefault();
    if (!newTool.name || !newTool.description) return;
    await addCustomTool(newTool);
    setShowAddTool(false);
    setNewTool({ name: '', description: '', category: 'Custom', schema: {} });
  }, [addCustomTool, newTool]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h2 className="text-2xl font-bold text-[var(--fg-primary)] tracking-tight flex items-center gap-3">
            <Wrench size={28} className="text-[var(--accent-400)]" />
            Tool Ecosystem & Automation Registry
          </h2>
          <p className="text-[var(--fg-muted)] text-sm mt-1">
            Manage autonomous tool capabilities, safety restrictions, parameter schemas, and custom extensions
          </p>
        </div>
        <button
          onClick={() => setShowAddTool(true)}
          className="btn btn-primary btn-md gap-2"
        >
          <Plus size={16} /> Add Custom Tool
        </button>
      </motion.div>

      {/* Filters & Search */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card p-4 flex flex-col sm:flex-row gap-4"
      >
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-muted)]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tools..."
            className="input w-full pl-10 pr-4"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={cn(
                'btn btn-sm px-3 py-1.5 font-medium transition-all',
                filter === cat
                  ? 'bg-[var(--brand-500)] text-[var(--fg-primary)] border-[var(--brand-500)]'
                  : 'bg-[var(--bg-input)] text-[var(--fg-secondary)] border-[var(--border-default)] hover:text-[var(--fg-primary)] hover:border-[var(--border-emphasized)]'
              )}
            >
              {cat === 'all' ? 'All' : cat}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Tools Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-1 gap-3"
      >
        {filteredTools.length === 0 ? (
          <div className="card p-12 empty-state">
            <Wrench className="empty-state-icon" size={64} />
            <h3 className="empty-state-title">No Tools Found</h3>
            <p className="empty-state-desc">
              {search ? 'Try adjusting your search or filter.' : 'No tools are currently registered.'}
            </p>
          </div>
        ) : (
          filteredTools.map(tool => (
            <motion.div
              key={tool.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="card p-4 flex items-center justify-between"
            >
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <div className={cn(
                  'w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
                  getCategoryStyle(tool.category).bg
                )}>
                  {(() => {
                    const Icon = getCategoryIcon(tool.category);
                    return <Icon size={24} className={getCategoryStyle(tool.category).icon} />;
                  })()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <h4 className="font-semibold text-[var(--fg-primary)] font-mono text-sm truncate">{tool.name}</h4>
                    <span className={cn(
                      'badge badge-xs font-mono',
                      getCategoryStyle(tool.category).badge
                    )}>
                      {tool.category}
                    </span>
                    {tool.enabled && (
                      <span className="badge badge-xs badge-success">Enabled</span>
                    )}
                    {!tool.enabled && (
                      <span className="badge badge-xs badge-default">Disabled</span>
                    )}
                  </div>
                  <p className="text-sm text-[var(--fg-secondary)] mt-1 line-clamp-2">{tool.description}</p>
                  {tool.args_schema && (
                    <details className="mt-2 group">
                      <summary className="text-xs text-[var(--fg-muted)] cursor-pointer flex items-center gap-1 hover:text-[var(--fg-secondary)]">
                        <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
                        Parameters Schema
                      </summary>
                      <pre className="mt-2 p-2 bg-[var(--bg-deep)] rounded-lg text-[10px] text-[var(--fg-muted)] font-mono overflow-x-auto max-h-32">
                        {JSON.stringify(tool.args_schema, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <div
                  onClick={() => handleToggle(tool.name, !tool.enabled)}
                  className={cn(
                    'w-11 h-6 rounded-full relative cursor-pointer transition-colors duration-200 shrink-0',
                    tool.enabled ? 'bg-[var(--brand-500)]' : 'bg-[var(--bg-hover)] border border-[var(--border-default)]'
                  )}
                >
                  <motion.div
                    animate={{ x: tool.enabled ? 24 : 2 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className="w-4 h-4 rounded-full bg-white absolute top-1 shadow-md"
                  />
                </div>
                {tool.category === 'Custom' && (
                  <button
                    onClick={() => removeCustomTool(tool.name)}
                    className="btn btn-ghost btn-sm p-1.5 text-[var(--danger)] hover:bg-[var(--danger-bg)]"
                    title="Remove custom tool"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </motion.div>
          ))
        )}
      </motion.div>

      {/* Add Custom Tool Modal */}
      {showAddTool && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4"
            onClick={() => setShowAddTool(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-2xl shadow-[var(--shadow-xl)] w-full max-w-2xl max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-[var(--border-default)] flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[var(--fg-primary)]">Add Custom Tool</h3>
                <button
                  onClick={() => setShowAddTool(false)}
                  className="btn btn-ghost btn-sm p-1.5"
                >
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleAddTool} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs text-[var(--fg-muted)] mb-1">Tool Name</label>
                  <input
                    type="text"
                    value={newTool.name}
                    onChange={e => setNewTool({ ...newTool, name: e.target.value })}
                    placeholder="my_custom_tool"
                    className="input input-lg font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--fg-muted)] mb-1">Description</label>
                  <textarea
                    value={newTool.description}
                    onChange={e => setNewTool({ ...newTool, description: e.target.value })}
                    placeholder="What does this tool do?"
                    className="input"
                    rows={3}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--fg-muted)] mb-1">Category</label>
                  <select
                    value={newTool.category}
                    onChange={e => setNewTool({ ...newTool, category: e.target.value })}
                    className="input input-lg"
                  >
                    <option value="Custom">Custom</option>
                    <option value="Filesystem">Filesystem</option>
                    <option value="Shell Execution">Shell Execution</option>
                    <option value="Web Search">Web Search</option>
                    <option value="Browser Control">Browser Control</option>
                    <option value="Visible Window & Browser">Visible Window & Browser</option>
                    <option value="API Integration">API Integration</option>
                    <option value="Data Processing">Data Processing</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[var(--fg-muted)] mb-1">JSON Schema (Parameters)</label>
                  <textarea
                    value={JSON.stringify(newTool.schema, null, 2)}
                    onChange={e => {
                      try {
                        setNewTool({ ...newTool, schema: JSON.parse(e.target.value) });
                      } catch {}
                    }}
                    placeholder='{"type": "object", "properties": {"param1": {"type": "string"}}, "required": ["param1"]}'
                    className="input font-mono text-xs"
                    rows={6}
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-default)]">
                  <button
                    type="button"
                    onClick={() => setShowAddTool(false)}
                    className="btn btn-outline btn-md"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-md"
                  >
                    <Save size={16} /> Add Tool
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Tool Statistics */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        <StatCard
          icon={Wrench}
          iconColor="text-[var(--accent-400)]"
          value={toolsList.length}
          label="Total Tools"
        />
        <StatCard
          icon={CheckCircle2}
          iconColor="text-[var(--success)]"
          value={toolsList.filter(t => t.enabled).length}
          label="Enabled"
        />
        <StatCard
          icon={AlertCircle}
          iconColor="text-[var(--danger)]"
          value={toolsList.filter(t => !t.enabled).length}
          label="Disabled"
        />
        <StatCard
          icon={Plus}
          iconColor="text-[var(--brand-400)]"
          value={toolsList.filter(t => t.category === 'Custom').length}
          label="Custom Tools"
        />
      </motion.div>
    </div>
  );
}

function StatCard({ icon: Icon, iconColor, value, label }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold text-[var(--fg-primary)]">{value}</div>
          <div className="text-xs text-[var(--fg-muted)]">{label}</div>
        </div>
        <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', iconColor)}>
          <Icon size={24} />
        </div>
      </div>
    </div>
  );
}

function getCategoryStyle(category) {
  const styles = {
    'Filesystem': { bg: 'bg-blue-500/10', icon: 'text-blue-400', badge: 'badge-blue' },
    'Shell Execution': { bg: 'bg-orange-500/10', icon: 'text-orange-400', badge: 'badge-orange' },
    'Web Search': { bg: 'bg-green-500/10', icon: 'text-green-400', badge: 'badge-green' },
    'Browser Control': { bg: 'bg-purple-500/10', icon: 'text-purple-400', badge: 'badge-purple' },
    'Visible Window & Browser': { bg: 'bg-cyan-500/10', icon: 'text-[var(--brand-400)]', badge: 'badge-brand' },
    'Custom': { bg: 'bg-amber-500/10', icon: 'text-[var(--accent-400)]', badge: 'badge-warning' },
    'API Integration': { bg: 'bg-cyan-500/10', icon: 'text-cyan-400', badge: 'badge-cyan' },
    'Data Processing': { bg: 'bg-pink-500/10', icon: 'text-pink-400', badge: 'badge-pink' },
  };
  return styles[category] || { bg: 'bg-[var(--bg-hover)]', icon: 'text-[var(--fg-muted)]', badge: 'badge-default' };
}

function getCategoryIcon(category) {
  const icons = {
    'Filesystem': FolderOpen,
    'Shell Execution': Terminal,
    'Web Search': Search,
    'Browser Control': Globe,
    'Visible Window & Browser': Monitor,
    'Custom': Wrench,
    'API Integration': Network,
    'Data Processing': Database,
  };
  return icons[category] || Wrench;
}

// Badge color variants
const badgeStyles = `
  .badge-blue { background: oklch(0.12 0.03 250); color: oklch(0.58 0.15 250); border-color: oklch(0.28 0.06 250); }
  .badge-orange { background: oklch(0.12 0.03 60); color: oklch(0.65 0.15 60); border-color: oklch(0.3 0.06 60); }
  .badge-green { background: oklch(0.12 0.03 145); color: oklch(0.58 0.14 145); border-color: oklch(0.28 0.06 145); }
  .badge-purple { background: oklch(0.12 0.03 280); color: oklch(0.58 0.15 280); border-color: oklch(0.28 0.06 280); }
  .badge-cyan { background: oklch(0.12 0.03 200); color: oklch(0.58 0.15 200); border-color: oklch(0.28 0.06 200); }
  .badge-pink { background: oklch(0.12 0.03 340); color: oklch(0.58 0.15 340); border-color: oklch(0.28 0.06 340); }
`;

// Inject badge styles
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = badgeStyles;
  document.head.appendChild(style);
}