import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Square,
  Trash2,
  Eye,
  FolderOpen,
  Terminal,
  Play,
  Bot,
  User,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Copy,
  Edit2,
  MoreVertical,
  Flag,
  Star,
  Share2,
  Download,
  Upload,
  Search,
  ExternalLink,
  Sparkles,
  Zap,
  Brain,
  Network,
  HardDrive,
  Cloud,
  Key,
  Lock,
  Unlock,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { cn, formatRelativeTime, generateId } from '../lib/utils';
import MarkdownRenderer from './MarkdownRenderer';

export default function ChatArea({
  onTriggerVisibleWindow,
  setVisibleActivities,
  setLiveStreamMsg,
  onAbortTaskRef,
}) {
  const {
    messages,
    input,
    setInput,
    addMessage,
    clearMessages,
    isProcessing,
    setProcessing,
    healthData,
  } = useStore();
  
  const [streamActivities, setStreamActivities] = useState([]);
  const [liveAgentMessage, setLiveAgentMessage] = useState('');
  const [isActivityOpen, setIsActivityOpen] = useState(true);
  const [expandedMessageSteps, setExpandedMessageSteps] = useState({});
  const messagesEndRef = useRef(null);
  const activitiesRef = useRef([]);
  const abortControllerRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamActivities, liveAgentMessage]);

  const toggleMessageSteps = (idx) => {
    setExpandedMessageSteps(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleAbort = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    try {
      await fetch('http://127.0.0.1:8000/chat/abort', { method: 'POST' });
    } catch (e) {
      console.error('Abort request failed:', e);
    }
    setProcessing(false);
    addMessage({
      role: 'agent',
      content: '⏹️ *Task execution was stopped by user request.*',
      activities: [...activitiesRef.current, { type: 'status', message: 'Task aborted by user.' }],
      timestamp: new Date().toISOString()
    });
    setStreamActivities([]);
    setLiveAgentMessage('');
    if (setLiveStreamMsg) setLiveStreamMsg('');
  }, [addMessage, setProcessing, setLiveStreamMsg]);

  useEffect(() => {
    if (onAbortTaskRef) {
      onAbortTaskRef.current = handleAbort;
    }
  }, [isProcessing, handleAbort, onAbortTaskRef]);

  const handleSend = useCallback(async (overrideText) => {
    const textToSend = overrideText || input;
    if (!textToSend.trim() || isProcessing) return;

    const lower = textToSend.toLowerCase();
    if (lower.includes('visible window') || lower.includes('show window') || lower.includes('visible browser') || lower.includes('show a window')) {
      onTriggerVisibleWindow(true);
    }

    const userMsg = { role: 'user', content: textToSend, timestamp: new Date().toISOString() };
    addMessage(userMsg);
    if (!overrideText) setInput('');
    setProcessing(true);
    setStreamActivities([]);
    activitiesRef.current = [];
    setLiveAgentMessage('');
    if (setVisibleActivities) setVisibleActivities([]);
    if (setLiveStreamMsg) setLiveStreamMsg('');

    const currentHistory = messages.map(m => ({ role: m.role, content: m.content }));
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('http://127.0.0.1:8000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          history: currentHistory
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let collectedText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));

              if (data.type === 'tool_start' && (data.tool === 'open_visible_browser' || (data.args && data.args.visible))) {
                onTriggerVisibleWindow(true);
              }

              if (data.type === 'status' || data.type === 'plan_summary' || data.type === 'tool_start' || data.type === 'tool_end' || data.type === 'reflection') {
                activitiesRef.current = [...activitiesRef.current, data];
                setStreamActivities([...activitiesRef.current]);
                if (setVisibleActivities) setVisibleActivities([...activitiesRef.current]);
              } else if (data.type === 'final' || data.role === 'agent') {
                collectedText = data.content;
                setLiveAgentMessage(data.content);
                if (setLiveStreamMsg) setLiveStreamMsg(data.content);
              } else if (data.type === 'error') {
                activitiesRef.current = [...activitiesRef.current, { type: 'error', message: data.message }];
                setStreamActivities([...activitiesRef.current]);
                if (setVisibleActivities) setVisibleActivities([...activitiesRef.current]);
              }
            } catch (e) {
              console.error('SSE JSON parse error:', e, trimmed);
            }
          }
        }
      }

      const finalMsgContent = collectedText || liveAgentMessage || 'Task finished.';
      addMessage({
        role: 'agent',
        content: finalMsgContent,
        activities: [...activitiesRef.current],
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      if (e.name === 'AbortError') {
        console.log('Task aborted by client controller.');
      } else {
        console.error(e);
        addMessage({
          role: 'agent',
          content: `Error communicating with Rajjo backend: ${e.message}. Please ensure the backend is running and your model is connected.`,
          isError: true,
          activities: [...activitiesRef.current],
          timestamp: new Date().toISOString()
        });
      }
    } finally {
      setProcessing(false);
      setStreamActivities([]);
      setLiveAgentMessage('');
      if (setLiveStreamMsg) setLiveStreamMsg('');
      abortControllerRef.current = null;
    }
  }, [input, isProcessing, messages, addMessage, setInput, setProcessing, onTriggerVisibleWindow, setVisibleActivities, setLiveStreamMsg, setLiveAgentMessage, liveAgentMessage]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isProcessing) {
        handleAbort();
      } else {
        handleSend();
      }
    }
  };

  const quickActions = [
    {
      label: 'Visible Window Search',
      desc: 'Launch visible window and watch agent browse',
      icon: Eye,
      iconColor: 'text-[var(--brand-400)]',
      prompt: "Show a visible window and search DuckDuckGo for the latest autonomous AI agent frameworks."
    },
    {
      label: 'Create Files & Folders',
      desc: 'Create demo directory and markdown files',
      icon: FolderOpen,
      iconColor: 'text-[var(--accent-400)]',
      prompt: "Create a folder named rajjo-demo and write a summary of local AI advantages inside summary.md"
    },
    {
      label: 'List Current Directory',
      desc: 'Inspect directory entries and structure',
      icon: Terminal,
      iconColor: 'text-[var(--success)]',
      prompt: "List the contents of the current directory and report how many files exist."
    },
    {
      label: 'Run Shell Command',
      desc: 'Execute safe system commands with timeouts',
      icon: Play,
      iconColor: 'text-[var(--info)]',
      prompt: "Run a safe shell command to display current system date, time, and Python version."
    },
    {
      label: 'Web Research',
      desc: 'Deep web search with citations',
      icon: Search,
      iconColor: 'text-[var(--brand-400)]',
      prompt: "Research the latest developments in local LLM inference optimization and summarize key findings."
    },
    {
      label: 'Code Generation',
      desc: 'Generate production-ready code',
      icon: Zap,
      iconColor: 'text-[var(--danger)]',
      prompt: "Create a complete FastAPI REST API with authentication, rate limiting, and PostgreSQL integration."
    },
  ];

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto p-4 relative">
      {/* Chat Header */}
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--border-default)]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/15 flex items-center justify-center">
              <Bot size={18} className="text-[var(--brand-400)]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--fg-primary)]">Active Workspace</h2>
              <p className="text-xs text-[var(--fg-muted)]">Chat with your autonomous agent</p>
            </div>
          </div>
          {healthData && (
            <span className="badge badge-brand font-mono">
              {healthData.active_provider}:{healthData.active_model_id}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isProcessing && (
            <button
              onClick={handleAbort}
              className="btn btn-danger btn-sm gap-2"
            >
              <Square size={12} className="fill-current" />
              <span>Abort</span>
            </button>
          )}
          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              disabled={isProcessing}
              className="btn btn-ghost btn-sm gap-2 text-[var(--fg-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)]"
            >
              <Trash2 size={14} />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-5 pr-2 custom-scrollbar">
        <AnimatePresence mode="popLayout">
          {messages.length === 0 && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="min-h-[420px] my-auto flex flex-col items-center justify-center text-center space-y-6 px-6"
            >
              <motion.div
                initial={{ scale: 0.8, rotate: -12 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.2 }}
                className="w-20 h-20 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center"
              >
                <Bot size={40} className="text-[var(--brand-400)]" />
              </motion.div>
              <div className="space-y-2 max-w-md">
                <motion.h2
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-2xl font-bold text-[var(--fg-primary)] tracking-tight"
                >
                  Welcome to Rajjo
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="text-[var(--fg-secondary)] text-base"
                >
                  Your local-first autonomous AI desktop agent. Delegate file manipulation, shell scripts, live web automation, visible browser sessions, and multi-agent workflows.
                </motion.p>
              </div>

              {/* Quick Task Starters */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-2xl pt-2"
              >
                {quickActions.map((action, i) => (
                  <motion.button
                    key={action.label}
                    onClick={() => handleSend(action.prompt)}
                    whileHover={{ y: -2, scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    className="card-interactive p-4 text-left group"
                    style={{ transitionDelay: `${i * 50}ms` }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-xl bg-[var(--bg-input)] flex items-center justify-center">
                        <action.icon size={16} className={action.iconColor} />
                      </div>
                      <span className="font-semibold text-sm text-[var(--fg-primary)] group-hover:text-[var(--brand-400)] transition-colors">
                        {action.label}
                      </span>
                    </div>
                    <span className="text-xs text-[var(--fg-muted)] line-clamp-1">{action.desc}</span>
                  </motion.button>
                ))}
              </motion.div>
            </motion.div>
          )}

          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className={cn('flex gap-3.5', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}
            >
              <div className={cn(
                'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm',
                msg.role === 'user'
                  ? 'bg-[var(--brand-500)] text-[var(--fg-primary)]'
                  : 'bg-[var(--bg-elevated)] text-[var(--brand-400)] border border-cyan-500/30'
              )}>
                {msg.role === 'user' ? <User size={18} /> : <Bot size={18} />}
              </div>

              <div className={cn(
                'max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed space-y-3',
                msg.role === 'user'
                  ? 'bg-[var(--brand-500)] text-[var(--fg-primary)] shadow-[var(--shadow-md)]'
                  : msg.isError
                    ? 'bg-[var(--danger-bg)] border border-[var(--danger-border)] text-[var(--danger)]'
                    : 'bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--fg-secondary)] shadow-[var(--shadow-sm)]'
              )}>
                {/* Message Execution Step Accordion */}
                {msg.activities && msg.activities.length > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-b border-[var(--border-default)] pb-2 mb-2"
                  >
                    <button
                      onClick={() => toggleMessageSteps(i)}
                      className="flex items-center justify-between w-full text-xs text-[var(--fg-muted)] hover:text-[var(--fg-secondary)] font-medium"
                    >
                      <div className="flex items-center gap-2 text-[var(--brand-400)]">
                        <CheckCircle2 size={12} className="text-[var(--success)]" />
                        <span>Execution Trace ({msg.activities.length} steps)</span>
                      </div>
                      {expandedMessageSteps[i] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>

                    {expandedMessageSteps[i] && (
                      <AnimatePresence>
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-2 space-y-1 pl-2 border-l border-[var(--border-default)]"
                        >
                          {msg.activities.map((act, actIdx) => (
                            <motion.div
                              key={actIdx}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: actIdx * 30 }}
                              className="text-xs text-[var(--fg-muted)] flex items-center gap-2 font-mono"
                            >
                              <span className={cn(
                                'w-1.5 h-1.5 rounded-full shrink-0',
                                act.type === 'tool_start' ? 'bg-[var(--accent-400)] animate-pulse' :
                                act.type === 'tool_end' ? 'bg-[var(--success)]' :
                                act.type === 'reflection' ? 'bg-[var(--info)]' :
                                'bg-[var(--brand-400)]'
                              )} />
                              <span className="text-[var(--fg-secondary)]">{act.message || act.type}</span>
                            </motion.div>
                          ))}
                        </motion.div>
                      </AnimatePresence>
                    )}
                  </motion.div>
                )}

                {/* Message Content */}
                {msg.role === 'user' ? (
                  <div className="whitespace-pre-wrap font-sans">{msg.content}</div>
                ) : (
                  <MarkdownRenderer content={msg.content} />
                )}

                {/* Message Actions */}
                <div className="flex items-center gap-1 pt-2 border-t border-[var(--border-default)]">
                  <button className="btn btn-ghost btn-sm p-1.5" title="Copy" aria-label="Copy message">
                    <Copy size={12} />
                  </button>
                  <button className="btn btn-ghost btn-sm p-1.5" title="Regenerate" aria-label="Regenerate response">
                    <RefreshCw size={12} />
                  </button>
                  <button className="btn btn-ghost btn-sm p-1.5" title="Share" aria-label="Share message">
                    <Share2 size={12} />
                  </button>
                  <button className="btn btn-ghost btn-sm p-1.5" title="Bookmark" aria-label="Bookmark message">
                    <Star size={12} />
                  </button>
                  <button className="btn btn-ghost btn-sm p-1.5" title="Flag" aria-label="Flag message">
                    <Flag size={12} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}

          {/* Live Streaming Activity & Response */}
          {isProcessing && (
            <motion.div
              key="streaming"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex gap-3.5"
            >
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="w-8 h-8 rounded-xl bg-[var(--bg-input)] border border-cyan-500/40 text-[var(--brand-400)] flex items-center justify-center shrink-0"
              >
                <Bot size={18} />
              </motion.div>

              <div className="flex-1 max-w-[85%] space-y-3">
                {/* High-level Activity Stream */}
                {streamActivities.length > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="card p-3"
                  >
                    <button
                      onClick={() => setIsActivityOpen(!isActivityOpen)}
                      className="flex items-center justify-between w-full cursor-pointer font-semibold text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
                    >
                      <div className="flex items-center gap-2 text-[var(--brand-400)]">
                        <motion.span
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        >
                          <RefreshCw size={14} />
                        </motion.span>
                        <span>Agent Activity ({streamActivities.length} steps)</span>
                      </div>
                      {isActivityOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>

                    {isActivityOpen && (
                      <AnimatePresence>
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-2 space-y-1.5 pt-2 border-t border-[var(--border-default)]"
                        >
                          {streamActivities.map((act, idx) => (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: idx * 20 }}
                              className="flex items-center gap-2 text-[var(--fg-secondary)] text-xs"
                            >
                              <span className={cn(
                                'w-2 h-2 rounded-full shrink-0',
                                act.type === 'tool_start' ? 'bg-[var(--accent-400)] animate-pulse' :
                                act.type === 'tool_end' ? 'bg-[var(--success)]' :
                                act.type === 'reflection' ? 'bg-[var(--info)]' :
                                'bg-[var(--brand-400)]'
                              )} />
                              <span className="text-[var(--fg-primary)] font-mono">{act.message || act.type}</span>
                            </motion.div>
                          ))}
                        </motion.div>
                      </AnimatePresence>
                    )}
                  </motion.div>
                )}

                {/* Live content typing */}
                {liveAgentMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="card p-4"
                  >
                    <MarkdownRenderer content={liveAgentMessage} />
                    <motion.span
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 0.8, repeat: Infinity }}
                      className="inline-block w-2 h-5 ml-1 bg-[var(--brand-400)]"
                    />
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </AnimatePresence>
      </div>

      {/* Input Box */}
      <div className="mt-4 relative">
        <div className="flex items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isProcessing ? "Task in progress... Press Enter to abort." : "Message Rajjo (e.g. 'show a visible window and browse...', Shift+Enter for newline)..."}
              className="input w-full bg-[var(--bg-input)] border-[var(--border-default)] resize-none min-h-[44px] max-h-48 pr-12"
              style={{ height: 'auto' }}
              disabled={isProcessing}
            />
            {isProcessing ? (
              <button
                onClick={handleAbort}
                className="absolute right-3 bottom-3 btn btn-danger btn-sm p-2 animate-pulse"
                title="Abort Task"
              >
                <Square size={16} className="fill-current" />
              </button>
            ) : (
              <button
                onClick={() => handleSend()}
                disabled={!input.trim()}
                className="absolute right-3 bottom-3 btn btn-primary btn-sm p-2"
                title="Send Message (Enter)"
                aria-label="Send message"
              >
                <Send size={16} />
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-[var(--fg-muted)] mt-2 text-center">
          <kbd className="px-1.5 py-0.5 bg-[var(--bg-deep)] border border-[var(--border-default)] rounded text-[var(--fg-secondary)] font-mono">Enter</kbd> Send &nbsp;
          <kbd className="px-1.5 py-0.5 bg-[var(--bg-deep)] border border-[var(--border-default)] rounded text-[var(--fg-secondary)] font-mono">Shift+Enter</kbd> New line &nbsp;
          <kbd className="px-1.5 py-0.5 bg-[var(--bg-deep)] border border-[var(--border-default)] rounded text-[var(--fg-secondary)] font-mono">⌘K</kbd> Command palette
        </p>
      </div>
    </div>
  );
}