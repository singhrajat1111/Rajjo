import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database,
  Download,
  Upload,
  Trash2,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Clock,
  FileText,
  Brain,
  Zap,
  Lightbulb,
  Archive,
  Copy,
  Edit2,
  Eye,
  EyeOff,
  Share2,
  Flag,
  Star,
  Heart,
  MoreVertical,
  Plus,
  Minus,
  X,
  Settings,
  Filter as FilterIcon,
  BarChart3,
  Activity,
  Layers,
  Network,
  HardDrive,
  Cloud,
  Globe,
  Terminal,
  Server,
  Code,
  Wand2,
  Palette,
  Contrast,
  LayoutDashboard,
  AlertCircle,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { cn, formatRelativeTime } from '../lib/utils';

export default function MemoryViewer() {
  const {
    episodicTasks,
    semanticMemories,
    fetchMemory,
    clearEpisodicMemory,
    clearSemanticMemory,
    exportMemory,
    importMemory,
    searchSemanticMemory,
  } = useStore();

  const [tab, setTab] = useState('episodic');
  const [search, setSearch] = useState('');
  const [semanticSearch, setSemanticSearch] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);

  useEffect(() => {
    fetchMemory();
  }, [fetchMemory]);

  const handleExport = useCallback(async () => {
    const data = await exportMemory();
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rajjo_memory_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportMemory]);

  const handleImportFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result);
        const res = await importMemory(parsed);
        alert(`Imported ${res.imported_episodic} episodic tasks and ${res.imported_semantic} semantic insights.`);
        setShowImport(false);
        setImportFile(null);
      } catch (err) {
        alert('Invalid JSON file format.');
      }
    };
    reader.readAsText(file);
  }, [importMemory]);

  const filteredTasks = episodicTasks.filter(t =>
    t.user_input?.toLowerCase().includes(search.toLowerCase()) ||
    t.outcome?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredSemantic = semanticMemories.filter(m =>
    m.document?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div>
          <h2 className="text-2xl font-bold text-[var(--fg-primary)] tracking-tight flex items-center gap-3">
            <Brain size={28} className="text-purple-400" />
            Self-Learning Memory
          </h2>
          <p className="text-[var(--fg-muted)] text-sm mt-1">
            Explore episodic task logs and extracted semantic knowledge stored locally
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button onClick={handleExport} className="btn btn-outline btn-sm gap-2">
            <Download size={14} /> Export
          </button>
          <label className="btn btn-outline btn-sm gap-2 cursor-pointer">
            <Upload size={14} /> Import
            <input type="file" accept=".json" onChange={handleImportFile} className="hidden" />
          </label>
        </div>
      </motion.div>

      {/* Tabs & Search */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card p-4 flex flex-col sm:flex-row items-center justify-between gap-4"
      >
        <div className="flex bg-[var(--bg-input)] border border-[var(--border-default)] rounded-xl p-1 w-full sm:w-auto">
          <button
            onClick={() => setTab('episodic')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-semibold transition-all',
              tab === 'episodic' ? 'bg-[var(--brand-500)] text-[var(--fg-primary)]' : 'text-[var(--fg-muted)] hover:text-[var(--fg-primary)]'
            )}
          >
            Episodic Tasks ({episodicTasks.length})
          </button>
          <button
            onClick={() => setTab('semantic')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-semibold transition-all',
              tab === 'semantic' ? 'bg-[var(--brand-500)] text-[var(--fg-primary)]' : 'text-[var(--fg-muted)] hover:text-[var(--fg-primary)]'
            )}
          >
            Semantic Insights ({semanticMemories.length})
          </button>
        </div>

        <div className="relative w-full sm:w-80">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-muted)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${tab === 'episodic' ? 'episodic tasks' : 'semantic insights'}...`}
            className="input w-full pl-9 pr-4"
          />
        </div>
      </motion.div>

      {/* Memory Content */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="space-y-3"
      >
        {tab === 'episodic' ? (
          filteredTasks.length === 0 ? (
            <div className="card p-12 empty-state">
              <Database className="empty-state-icon" size={64} />
              <h3 className="empty-state-title">No Episodic Tasks Recorded</h3>
              <p className="empty-state-desc">
                {search ? 'No tasks match your search.' : 'Completed agent tasks will appear here.'}
              </p>
            </div>
          ) : (
            filteredTasks.map(task => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="card p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-mono text-[var(--brand-400)] font-semibold text-sm">Task #{task.id}</span>
                      <span className="text-xs text-[var(--fg-muted)] font-mono">{formatRelativeTime(task.timestamp)}</span>
                      <span className={cn(
                        'badge badge-xs',
                        task.status === 'completed' ? 'badge-success' :
                        task.status === 'error' ? 'badge-danger' : 'badge-warning'
                      )}>
                        {task.status}
                      </span>
                    </div>
                    <div className="font-medium text-[var(--fg-primary)] mb-2">{task.user_input}</div>
                    <div className="p-3 bg-[var(--bg-input)] rounded-lg border border-[var(--border-default)] text-sm text-[var(--fg-secondary)] font-mono">
                      Outcome: {task.outcome}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button className="btn btn-ghost btn-sm p-1.5" title="View details"><Eye size={14} /></button>
                    <button className="btn btn-ghost btn-sm p-1.5" title="Copy"><Copy size={14} /></button>
                    <button className="btn btn-ghost btn-sm p-1.5" title="Share"><Share2 size={14} /></button>
                  </div>
                </div>
              </motion.div>
            ))
          )
        ) : (
          filteredSemantic.length === 0 ? (
            <div className="card p-12 empty-state">
              <Lightbulb className="empty-state-icon" size={64} />
              <h3 className="empty-state-title">Semantic Memory is Empty</h3>
              <p className="empty-state-desc">
                {search ? 'No insights match your search.' : 'Reflections and learned facts will appear here.'}
              </p>
            </div>
          ) : (
            filteredSemantic.map((mem, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="card p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-purple-400 font-semibold text-sm flex items-center gap-1">
                        <Lightbulb size={14} />
                        Learned Insight
                      </span>
                      <span className="text-xs text-[var(--fg-muted)]">#{idx + 1}</span>
                    </div>
                    <p className="text-[var(--fg-secondary)] leading-relaxed">{mem.document}</p>
                    {mem.metadata && Object.keys(mem.metadata).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {Object.entries(mem.metadata).map(([k, v]) => (
                          <span key={k} className="badge badge-xs badge-purple">{k}: {v}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button className="btn btn-ghost btn-sm p-1.5" title="Copy"><Copy size={14} /></button>
                    <button className="btn btn-ghost btn-sm p-1.5" title="Bookmark"><Star size={14} /></button>
                    <button className="btn btn-ghost btn-sm p-1.5" title="Share"><Share2 size={14} /></button>
                  </div>
                </div>
              </motion.div>
            ))
          )
        )}

        {/* Clear Memory Buttons */}
        {(episodicTasks.length > 0 || semanticMemories.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="pt-4 border-t border-[var(--border-default)] flex justify-end gap-3"
          >
            {tab === 'episodic' && episodicTasks.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to clear all episodic task records?')) {
                    clearEpisodicMemory();
                  }
                }}
                className="btn btn-danger btn-sm gap-2"
              >
                <Trash2 size={14} /> Clear Episodic Memory
              </button>
            )}
            {tab === 'semantic' && semanticMemories.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to clear all semantic insights?')) {
                    clearSemanticMemory();
                  }
                }}
                className="btn btn-danger btn-sm gap-2"
              >
                <Trash2 size={14} /> Clear Semantic Memory
              </button>
            )}
          </motion.div>
        )}
      </motion.div>

      {/* Memory Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        <StatCard
          icon={Database}
          iconColor="text-blue-400"
          value={episodicTasks.length}
          label="Episodic Tasks"
        />
        <StatCard
          icon={Lightbulb}
          iconColor="text-purple-400"
          value={semanticMemories.length}
          label="Semantic Insights"
        />
        <StatCard
          icon={Activity}
          iconColor="text-[var(--brand-400)]"
          value={episodicTasks.filter(t => t.status === 'completed').length}
          label="Successful"
        />
        <StatCard
          icon={AlertCircle}
          iconColor="text-[var(--danger)]"
          value={episodicTasks.filter(t => t.status === 'error').length}
          label="Failed"
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