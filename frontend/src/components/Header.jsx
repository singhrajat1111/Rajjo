import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Minus,
  Square,
  X,
  Sun,
  Moon,
  Monitor,
  Maximize2,
  Minimize2,
  Search,
  Bell,
  BellOff,
  HelpCircle,
  User,
  LogOut,
  Menu,
  RefreshCw,
  Settings,
  Key,
  CheckCircle2,
  AlertCircle,
  Info,
  ShieldCheck,
  Cpu,
  Database
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore } from '../store/useStore';

export default function Header({
  onToggleSidebar,
  sidebarOpen,
  isVisibleWindowOpen,
  onToggleVisibleWindow,
  isProcessing,
  onAbort,
  healthData,
  backendOnline,
  onCheckHealth,
  onTabChange,
  theme,
  onThemeChange,
  onCommandPalette,
}) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isOnline = Boolean(backendOnline ?? healthData?.backendOnline);

  const handleMinimize = (e) => {
    e?.stopPropagation();
    if (window.electronAPI?.minimizeWindow) {
      window.electronAPI.minimizeWindow();
    }
  };

  const handleMaximize = (e) => {
    e?.stopPropagation();
    if (window.electronAPI?.maximizeWindow) {
      window.electronAPI.maximizeWindow();
    } else if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      document.documentElement.requestFullscreen?.();
    }
  };

  const handleFullscreenToggle = (e) => {
    e?.stopPropagation();
    if (window.electronAPI?.fullscreenWindow) {
      window.electronAPI.fullscreenWindow();
      setIsFullscreen(!isFullscreen);
    } else if (document.fullscreenElement) {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    } else {
      document.documentElement.requestFullscreen?.();
      setIsFullscreen(true);
    }
  };

  const handleClose = (e) => {
    e?.stopPropagation();
    if (window.electronAPI?.closeWindow) {
      window.electronAPI.closeWindow();
    }
  };

  const handleRefreshHealth = async (e) => {
    e?.stopPropagation();
    setIsCheckingHealth(true);
    if (onCheckHealth) {
      await onCheckHealth();
    } else {
      window.dispatchEvent(new CustomEvent('check-health'));
    }
    setTimeout(() => setIsCheckingHealth(false), 600);
  };

  const handleNavigate = (tabId) => {
    setShowProfileMenu(false);
    if (onTabChange) {
      onTabChange(tabId);
    }
  };

  const handleSignOut = () => {
    setShowProfileMenu(false);
    useStore.getState().clearMessages();
  };

  return (
    <header
      onDoubleClick={handleMaximize}
      className="h-12 bg-[var(--bg-deep)] backdrop-blur-xl border-b border-[var(--border-default)] flex items-center justify-between px-4 drag-region relative z-[var(--z-sticky)] select-none"
    >
      {/* Left: Brand & Status */}
      <div className="flex items-center gap-3 no-drag">
        <button
          onClick={onToggleSidebar}
          className="btn btn-ghost btn-sm p-2 no-drag"
          aria-label="Toggle sidebar"
          title="Toggle sidebar (Ctrl+B)"
        >
          <Menu size={18} />
        </button>

        <div className="flex items-center gap-2 no-drag">
          <div className="w-7 h-7 rounded-lg bg-gradient-brand flex items-center justify-center shadow-sm">
            <span className="font-black text-[var(--fg-primary)] text-xs">R</span>
          </div>
          <span className="font-bold text-[var(--fg-primary)] text-sm tracking-tight hidden xs:inline">
            Rajjo
          </span>
        </div>

        <div className="h-4 w-px bg-[var(--border-default)] mx-1 no-drag" />

        {/* Backend Status Pill */}
        <div
          onClick={handleRefreshHealth}
          className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[var(--bg-input)] border border-[var(--border-default)] text-xs no-drag cursor-pointer hover:border-cyan-500/40 transition-colors"
          title={isOnline ? 'Backend Connected (Click to re-check)' : 'Backend Disconnected (Click to retry)'}
        >
          <motion.span
            animate={isOnline ? { scale: [1, 1.25, 1] } : {}}
            transition={{ duration: 1.5, repeat: Infinity }}
            className={cn(
              'w-2 h-2 rounded-full',
              isOnline ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'
            )}
          />
          <span className={cn(
            'font-medium text-xs',
            isOnline ? 'text-[var(--success)]' : 'text-[var(--danger)]'
          )}>
            {isOnline ? 'Connected' : 'Offline'}
          </span>
          <button
            onClick={handleRefreshHealth}
            className="p-0.5 text-[var(--fg-muted)] hover:text-[var(--fg-primary)] transition-transform"
            title="Refresh status"
            aria-label="Refresh backend health"
          >
            <RefreshCw
              size={11}
              className={cn(isCheckingHealth && 'animate-spin text-[var(--brand-400)]')}
            />
          </button>
        </div>

        {healthData && healthData.active_provider && (
          <span className="text-xs text-[var(--fg-muted)] hidden md:inline no-drag">
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
      <div className="flex-1 max-w-md mx-4 no-drag">
        <button
          onClick={onCommandPalette}
          className="btn btn-ghost w-full justify-start px-3 py-1.5 gap-2 bg-[var(--bg-input)] border-[var(--border-default)] hover:border-cyan-500/30 hover:bg-[var(--bg-hover)] text-xs"
          aria-label="Open command palette (⌘K)"
        >
          <Search size={14} className="text-[var(--fg-muted)]" />
          <span className="text-xs text-[var(--fg-muted)] truncate">Search or run command...</span>
          <kbd className="ml-auto px-1.5 py-0.5 text-[10px] font-mono bg-[var(--bg-deep)] border border-[var(--border-default)] rounded text-[var(--fg-muted)]">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: Actions & Window Controls */}
      <div className="flex items-center gap-1.5 no-drag">
        {/* Abort Task Button */}
        {isProcessing && onAbort && (
          <motion.button
            onClick={onAbort}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="btn btn-danger btn-sm gap-1.5 px-2.5 py-1 animate-pulse no-drag"
            title="Stop Current Task (Esc)"
          >
            <Square size={12} className="fill-current" />
            <span className="font-semibold text-xs">Abort</span>
          </motion.button>
        )}

        {/* Visible Window Toggle */}
        <button
          onClick={onToggleVisibleWindow}
          className={cn(
            'btn btn-sm gap-1.5 px-2.5 py-1 transition-all no-drag text-xs',
            isVisibleWindowOpen
              ? 'bg-cyan-500/15 text-[var(--brand-300)] border-cyan-500/30 shadow-[var(--glow-brand)]'
              : isProcessing
                ? 'bg-amber-500/15 text-[var(--accent-300)] border-amber-500/30'
                : 'bg-[var(--bg-input)] text-[var(--fg-secondary)] border-[var(--border-default)] hover:text-[var(--fg-primary)] hover:border-[var(--border-emphasized)]'
          )}
          title="Toggle Visible Browser/Automation Window"
        >
          <Monitor size={14} className={isProcessing ? 'text-[var(--accent-400)]' : 'text-[var(--brand-400)]'} />
          <span className="font-medium hidden lg:inline">Visible Window</span>
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
          className="btn btn-ghost btn-sm p-1.5 text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] no-drag"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* Notifications Popover Toggle */}
        <div className="relative no-drag">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="btn btn-ghost btn-sm p-1.5 text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] relative no-drag"
            title="Notifications & System Activity"
            aria-label="Notifications"
          >
            <Bell size={16} />
            {isOnline && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
            )}
          </button>

          {showNotifications && (
            <>
              <div
                className="fixed inset-0 z-[var(--z-dropdown)]"
                onClick={() => setShowNotifications(false)}
              />
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.96 }}
                className="absolute right-0 top-full mt-2 w-72 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-[var(--shadow-xl)] overflow-hidden z-[var(--z-dropdown)] no-drag"
              >
                <div className="p-3 border-b border-[var(--border-default)] flex items-center justify-between">
                  <span className="font-semibold text-[var(--fg-primary)] text-xs">System Activity</span>
                  <span className="badge badge-xs badge-brand font-mono text-[10px]">v2.0.0</span>
                </div>
                <div className="p-3 space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={14} className={isOnline ? "text-[var(--success)]" : "text-[var(--danger)]"} />
                    <span className="text-[var(--fg-secondary)]">
                      {isOnline ? "Backend service online (Port 8000)" : "Backend unreachable"}
                    </span>
                  </div>
                  {healthData && (
                    <>
                      <div className="flex items-center gap-2 text-[var(--fg-muted)]">
                        <Cpu size={14} className="text-[var(--brand-400)]" />
                        <span>Active: <span className="font-mono text-[var(--fg-primary)]">{healthData.active_provider}/{healthData.active_model_id}</span></span>
                      </div>
                      <div className="flex items-center gap-2 text-[var(--fg-muted)]">
                        <Database size={14} className="text-[var(--accent-400)]" />
                        <span>Tools loaded: <span className="font-mono text-[var(--fg-primary)]">{healthData.tools_active ?? 0} active</span></span>
                      </div>
                    </>
                  )}
                </div>
                <div className="p-2 border-t border-[var(--border-default)] bg-[var(--bg-deep)] flex justify-end">
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="btn btn-ghost btn-sm text-[11px] py-0.5 px-2"
                  >
                    Dismiss
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </div>

        {/* Profile Menu */}
        <div className="relative no-drag">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="btn btn-ghost btn-sm p-1 gap-1 no-drag"
            aria-label="User menu"
            title="User Profile & Settings"
          >
            <div className="w-6 h-6 rounded-full bg-gradient-brand flex items-center justify-center text-[var(--fg-primary)]">
              <User size={12} />
            </div>
          </button>

          {showProfileMenu && (
            <>
              <div
                className="fixed inset-0 z-[var(--z-dropdown)]"
                onClick={() => setShowProfileMenu(false)}
              />
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.96 }}
                className="absolute right-0 top-full mt-2 w-52 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-[var(--shadow-xl)] overflow-hidden z-[var(--z-dropdown)] no-drag"
              >
                <div className="p-3 border-b border-[var(--border-default)]">
                  <div className="font-semibold text-[var(--fg-primary)] text-xs">Rajjo Workspace</div>
                  <div className="text-[10px] text-[var(--fg-muted)] font-mono">Local Autonomous Agent</div>
                </div>
                <nav className="py-1 text-xs">
                  <button
                    onClick={() => handleNavigate('settings')}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <Settings size={14} />
                    Settings
                  </button>
                  <button
                    onClick={() => handleNavigate('models')}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <Cpu size={14} />
                    Models & API Keys
                  </button>
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      onCommandPalette?.();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <HelpCircle size={14} />
                    Help & Command Palette
                  </button>
                </nav>
                <div className="border-t border-[var(--border-default)] p-1.5">
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-[var(--danger)] hover:bg-[var(--danger-bg)] rounded-lg transition-colors"
                  >
                    <LogOut size={13} />
                    Clear Chat History
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </div>

        {/* Separator before window controls */}
        <div className="h-4 w-px bg-[var(--border-default)] mx-1 no-drag" />

        {/* Window Controls (Minimize, Maximize, Fullscreen, Close) */}
        <div className="flex items-center gap-0.5 no-drag">
          <button
            onClick={handleMinimize}
            className="btn btn-ghost btn-sm p-1.5 text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-hover)] rounded-md no-drag"
            title="Minimize"
            aria-label="Minimize Window"
          >
            <Minus size={14} />
          </button>

          <button
            onClick={handleMaximize}
            className="btn btn-ghost btn-sm p-1.5 text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-hover)] rounded-md no-drag"
            title="Maximize / Restore"
            aria-label="Maximize Window"
          >
            <Square size={12} />
          </button>

          <button
            onClick={handleFullscreenToggle}
            className="btn btn-ghost btn-sm p-1.5 text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-hover)] rounded-md no-drag"
            title="Toggle Fullscreen"
            aria-label="Fullscreen Toggle"
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>

          <button
            onClick={handleClose}
            className="btn btn-ghost btn-sm p-1.5 text-[var(--fg-muted)] hover:text-white hover:bg-[var(--danger)] rounded-md no-drag transition-colors"
            title="Close"
            aria-label="Close Window"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </header>
  );
}