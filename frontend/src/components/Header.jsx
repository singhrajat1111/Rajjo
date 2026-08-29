import React from 'react';
import { motion } from 'framer-motion';
import {
  Minus,
  Square,
  X,
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
  LayoutDashboard,
  Terminal,
  Server,
  Code,
  Layers,
  Wand2,
  Palette,
  Contrast,
  Search,
  Command,
  Bell,
  BellOff,
  HelpCircle,
  User,
  LogOut,
  Menu,
  RefreshCw,
  Settings,
  X as XIcon,
} from 'lucide-react';
import { cn } from '../lib/utils';

export default function Header({
  onToggleSidebar,
  sidebarOpen,
  isVisibleWindowOpen,
  onToggleVisibleWindow,
  isProcessing,
  onAbort,
  healthData,
  theme,
  onThemeChange,
  onCommandPalette,
}) {
  const [showProfileMenu, setShowProfileMenu] = React.useState(false);

  const handleMinimize = () => window.electronAPI?.minimizeWindow();
  const handleMaximize = () => window.electronAPI?.maximizeWindow();
  const handleClose = () => window.electronAPI?.closeWindow();

  return (
    <header className="h-12 bg-[var(--bg-deep)] backdrop-blur-xl border-b border-[var(--border-default)] flex items-center justify-between px-4 drag-region relative z-[var(--z-sticky)]">
      {/* Left: Brand & Status */}
      <div className="flex items-center gap-4 no-drag">
        <button
          onClick={onToggleSidebar}
          className="btn btn-ghost btn-sm p-2 drag-region"
          aria-label="Toggle sidebar"
        >
          <Menu size={18} />
        </button>

        <div className="flex items-center gap-2 no-drag">
          <div className="w-7 h-7 rounded-lg bg-gradient-brand flex items-center justify-center">
            <span className="font-black text-[var(--fg-primary)] text-xs">R</span>
          </div>
          <span className="font-bold text-[var(--fg-primary)] text-sm tracking-tight">Rajjo</span>
        </div>

        <div className="h-5 w-px bg-[var(--border-default)] no-drag" />

        {/* Backend Status Pill */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-input)] border border-[var(--border-default)] text-xs no-drag">
          <motion.span
            animate={healthData?.backendOnline ? { scale: [1, 1.15, 1] } : {}}
            transition={{ duration: 1.5, repeat: Infinity }}
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              healthData?.backendOnline ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'
            )}
          />
          <span className={cn(
            'font-medium',
            healthData?.backendOnline ? 'text-[var(--success)]' : 'text-[var(--danger)]'
          )}>
            {healthData?.backendOnline ? 'Connected' : 'Offline'}
          </span>
          {!healthData?.backendOnline && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('check-health'))}
              className="btn btn-ghost btn-sm p-1 text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
              title="Retry connection"
            >
              <RefreshCw size={12} />
            </button>
          )}
        </div>

        {healthData && (
          <span className="text-xs text-[var(--fg-muted)] hidden sm:inline no-drag">
            <span className="font-mono text-[var(--fg-secondary)]">
              {healthData.active_provider}
            </span>
            <span className="text-[var(--border-default)] mx-1">/</span>
            <span className="font-mono text-[var(--brand-400)] font-medium">
              {healthData.active_model_id}
            </span>
          </span>
        )}
      </div>

      {/* Center: Global Search / Command */}
      <div className="flex-1 max-w-md mx-8 no-drag">
        <button
          onClick={onCommandPalette}
          className="btn btn-ghost w-full justify-start px-3 py-2 gap-2 bg-[var(--bg-input)] border-[var(--border-default)] hover:border-cyan-500/30 hover:bg-[var(--bg-hover)]"
          aria-label="Open command palette (⌘K)"
        >
          <Search size={16} className="text-[var(--fg-muted)]" />
          <span className="text-sm text-[var(--fg-muted)]">Search or run command...</span>
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-[var(--bg-deep)] border border-[var(--border-default)] rounded text-[var(--fg-muted)]">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: Actions & Window Controls */}
      <div className="flex items-center gap-2 no-drag">
        {/* Abort Task Button */}
        {isProcessing && onAbort && (
          <motion.button
            onClick={onAbort}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="btn btn-danger btn-sm gap-2 px-3 animate-pulse"
            title="Stop Current Task (Esc)"
          >
            <Square size={14} className="fill-current" />
            <span className="font-semibold">Abort</span>
          </motion.button>
        )}

        {/* Visible Window Toggle */}
        <button
          onClick={onToggleVisibleWindow}
          className={cn(
            'btn btn-sm gap-2 px-3 transition-all',
            isVisibleWindowOpen
              ? 'bg-cyan-500/15 text-[var(--brand-300)] border-cyan-500/30 shadow-[var(--glow-brand)]'
              : isProcessing
                ? 'bg-amber-500/15 text-[var(--accent-300)] border-amber-500/30'
                : 'bg-[var(--bg-input)] text-[var(--fg-secondary)] border-[var(--border-default)] hover:text-[var(--fg-primary)] hover:border-[var(--border-emphasized)]'
          )}
          title="Toggle Visible Agent Window"
        >
          <Monitor size={14} className={isProcessing ? 'text-[var(--accent-400)]' : 'text-[var(--brand-400)]'} />
          <span className="font-medium hidden sm:inline">Visible Window</span>
          {isProcessing && (
            <motion.span
              animate={{ scale: [1, 1.5, 1], opacity: [1, 0.3, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full bg-[var(--accent-400)]"
            />
          )}
        </button>

        {/* Theme Toggle */}
        <button
          onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
          className="btn btn-ghost btn-sm p-2"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Notifications */}
        <button className="btn btn-ghost btn-sm p-2" title="Notifications">
          <Bell size={18} />
        </button>

        {/* Profile Menu */}
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="btn btn-ghost btn-sm p-2 gap-2"
            aria-label="User menu"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-brand flex items-center justify-center">
              <User size={14} className="text-[var(--fg-primary)]" />
            </div>
          </button>

          {showProfileMenu && (
            <>
              <div
                className="fixed inset-0 z-[var(--z-dropdown)]"
                onClick={() => setShowProfileMenu(false)}
              />
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="absolute right-0 top-full mt-2 w-56 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-[var(--shadow-xl)] overflow-hidden z-[var(--z-dropdown)]"
              >
                <div className="p-3 border-b border-[var(--border-default)]">
                  <div className="font-semibold text-[var(--fg-primary)] text-sm">Rajjo User</div>
                  <div className="text-xs text-[var(--fg-muted)] font-mono">local-first agent</div>
                </div>
                <nav className="py-2">
                  <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-hover)] transition-colors">
                    <Settings size={16} />
                    Settings
                  </button>
                  <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-hover)] transition-colors">
                    <HelpCircle size={16} />
                    Help & Docs
                  </button>
                  <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-hover)] transition-colors">
                    <Key size={16} />
                    API Keys
                  </button>
                </nav>
                <div className="border-t border-[var(--border-default)] p-2">
                  <button
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[var(--danger)] hover:bg-[var(--danger-bg)] rounded-lg transition-colors"
                  >
                    <LogOut size={16} />
                    Sign Out
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </div>

        {/* Window Controls */}
        <div className="flex items-center gap-1 ml-2 drag-region">
          <button
            onClick={handleMinimize}
            className="btn btn-ghost btn-sm p-1.5 drag-region"
            title="Minimize"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={handleMaximize}
            className="btn btn-ghost btn-sm p-1.5 drag-region"
            title="Maximize"
          >
            <Square size={12} />
          </button>
          <button
            onClick={handleClose}
            className="btn btn-ghost btn-sm p-1.5 text-[var(--fg-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)] drag-region"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </header>
  );
}