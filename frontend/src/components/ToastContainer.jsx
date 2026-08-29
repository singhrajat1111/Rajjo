import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

const TOAST_ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  loading: Loader2,
};

const TOAST_COLORS = {
  success: 'bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success)]',
  error: 'bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger)]',
  warning: 'bg-[var(--warning-bg)] border-[var(--warning-border)] text-[var(--warning)]',
  info: 'bg-[var(--info-bg)] border-[var(--info-border)] text-[var(--info)]',
  loading: 'bg-[var(--bg-input)] border-cyan-500/30 text-[var(--brand-400)]',
};

export default function ToastContainer({ toasts, onDismiss }) {
  return (
    <AnimatePresence>
      <div className="fixed bottom-6 right-6 z-[var(--z-toast)] flex flex-col gap-3 pointer-events-none">
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            toast={toast}
            onDismiss={onDismiss}
          />
        ))}
      </div>
    </AnimatePresence>
  );
}

function Toast({ toast, onDismiss }) {
  const [isExiting, setIsExiting] = useState(false);
  const Icon = TOAST_ICONS[toast.type] || Info;
  const colorClass = TOAST_COLORS[toast.type] || TOAST_COLORS.info;

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => onDismiss(toast.id), 200);
  };

  useEffect(() => {
    if (toast.duration !== 0) {
      const timer = setTimeout(handleDismiss, toast.duration || 4000);
      return () => clearTimeout(timer);
    }
  }, [toast.duration, toast.id, onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 100, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={cn(
        'pointer-events-auto flex items-start gap-3 p-4 min-w-[300px] max-w-[450px] rounded-xl border shadow-[var(--shadow-lg)]',
        colorClass
      )}
    >
      <div className={cn(
        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
        toast.type === 'loading' && 'animate-spin'
      )}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        {toast.title && (
          <div className="font-semibold text-sm">{toast.title}</div>
        )}
        {toast.message && (
          <div className="text-sm opacity-90 mt-1">{toast.message}</div>
        )}
        {toast.action && (
          <button
            onClick={() => {
              toast.action.onClick();
              onDismiss(toast.id);
            }}
            className="mt-2 text-xs font-medium underline hover:opacity-80"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 p-1 rounded-lg hover:bg-black/10 transition-colors"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </motion.div>
  );
}

// Toast helper functions
export function createToast(type, title, message, options = {}) {
  return {
    type,
    title,
    message,
    duration: options.duration ?? 4000,
    action: options.action,
  };
}

export const toast = {
  success: (title, message, options) => createToast('success', title, message, options),
  error: (title, message, options) => createToast('error', title, message, options),
  warning: (title, message, options) => createToast('warning', title, message, options),
  info: (title, message, options) => createToast('info', title, message, options),
  loading: (title, message, options) => createToast('loading', title, message, { ...options, duration: 0 }),
};