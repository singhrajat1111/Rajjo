import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Cpu,
  Wrench,
  Database,
  Settings,
  Link2,
  GitBranch,
  ChevronRight,
  ChevronLeft,
  Activity,
  Zap,
  Brain,
  Network,
  HardDrive,
  Cloud,
  Key,
  Lock,
  Unlock,
  BarChart3,
  LayoutDashboard,
  Terminal,
  Server,
  Code,
  Layers,
  Wand2,
  Palette,
  Contrast,
} from 'lucide-react';
import { cn } from '../lib/utils';

const TabIcon = ({ icon: Icon, active, className }) => (
  <span className={cn(
    'w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200',
    active
      ? 'bg-cyan-500/15 text-[var(--brand-400)]'
      : 'text-[var(--fg-muted)] hover:text-[var(--fg-secondary)] hover:bg-[var(--bg-hover)]'
  )}>
    <Icon size={18} className={className} />
  </span>
);

const SidebarItem = ({ tab, active, onClick, isCollapsed }) => (
  <button
    onClick={() => onClick(tab.id)}
    className={cn(
      'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200',
      'group relative overflow-hidden',
      active
        ? 'bg-cyan-500/10 text-[var(--brand-300)] border border-cyan-500/20'
        : 'text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-hover)]'
    )}
    title={isCollapsed ? tab.label : undefined}
  >
    <TabIcon icon={tab.icon} active={active} />
    {!isCollapsed && (
      <span className="font-medium text-sm truncate">{tab.label}</span>
    )}
    {active && !isCollapsed && (
      <motion.div
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: 3, opacity: 1 }}
        className="absolute left-0 top-1 bottom-1 bg-[var(--brand-500)] rounded-r-xl"
      />
    )}
  </button>
);

export default function Sidebar({ 
  isOpen, 
  onClose, 
  activeTab, 
  onTabChange, 
  tabs, 
  healthData, 
  isProcessing 
}) {
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  if (!isOpen && !isCollapsed) return null;

  const width = isCollapsed ? 64 : 260;

  return (
    <AnimatePresence mode="wait">
      <motion.aside
        initial={{ x: -width }}
        animate={{ x: 0 }}
        exit={{ x: -width }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="relative z-[var(--z-sticky)] bg-[var(--bg-deep)] border-r border-[var(--border-default)] flex flex-col"
        style={{ width, minWidth: width, maxWidth: width }}
      >
        {/* Brand / Logo */}
        <div className="flex items-center justify-between h-14 px-3 border-b border-[var(--border-default)]">
          {!isCollapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-brand flex items-center justify-center">
                <span className="font-black text-[var(--fg-primary)] text-sm">R</span>
              </div>
              <span className="font-bold text-[var(--fg-primary)] tracking-tight">Rajjo</span>
            </div>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="btn btn-ghost btn-sm p-1.5"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto custom-scrollbar" role="navigation" aria-label="Main navigation">
          {tabs.map(tab => (
            <SidebarItem
              key={tab.id}
              tab={tab}
              active={activeTab === tab.id}
              onClick={onTabChange}
              isCollapsed={isCollapsed}
            />
          ))}
        </nav>

        {/* Status Bar */}
        <div className="p-3 border-t border-[var(--border-default)]">
          {!isCollapsed ? (
            <div className="space-y-3">
              {/* Backend Status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className={cn(
                      'w-2 h-2 rounded-full',
                      healthData?.backendOnline ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'
                    )}
                  />
                  <span className="text-xs font-medium text-[var(--fg-secondary)]">
                    {healthData?.backendOnline ? 'Backend Connected' : 'Backend Offline'}
                  </span>
                </div>
                {healthData && (
                  <span className="badge badge-xs badge-brand font-mono">
                    {healthData.active_provider}:{healthData.active_model_id}
                  </span>
                )}
              </div>

              {/* Processing Indicator */}
              {isProcessing && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[var(--accent-400)]">Processing Task</span>
                    <motion.span
                      animate={{ opacity: [1, 0.4, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="text-xs text-[var(--accent-400)] font-mono"
                    >
                      ● LIVE
                    </motion.span>
                  </div>
                  <div className="h-1.5 bg-[var(--bg-deep)] rounded-full overflow-hidden">
                    <motion.div
                      animate={{ width: ['0%', '100%', '0%'] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                      className="h-full bg-gradient-to-r from-[var(--accent-500)] to-[var(--brand-500)] rounded-full"
                    />
                  </div>
                </div>
              )}

              {/* Quick Stats */}
              {!isProcessing && healthData && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 bg-[var(--bg-input)] rounded-lg">
                    <div className="text-xs text-[var(--fg-muted)]">Provider</div>
                    <div className="text-xs font-medium text-[var(--fg-primary)] font-mono truncate">
                      {healthData.active_provider}
                    </div>
                  </div>
                  <div className="p-2 bg-[var(--bg-input)] rounded-lg">
                    <div className="text-xs text-[var(--fg-muted)]">Model</div>
                    <div className="text-xs font-medium text-[var(--fg-primary)] font-mono truncate">
                      {healthData.active_model_id}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className={cn(
                'w-2 h-2 rounded-full',
                healthData?.backendOnline ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'
              )} title={healthData?.backendOnline ? 'Connected' : 'Offline'} />
              {isProcessing && (
                <motion.div
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="w-2 h-2 rounded-full bg-[var(--accent-500)]"
                  title="Processing"
                />
              )}
            </div>
          )}
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}