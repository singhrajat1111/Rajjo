import React, { useState, useEffect, useRef } from 'react';
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
  StopCircle
} from 'lucide-react';
import { useStore } from './store/useStore';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import MarkdownRenderer from './components/MarkdownRenderer';
import LiveExecutionViewer from './components/LiveExecutionViewer';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// ----------------- Top Window Bar -----------------

const TitleBar = ({ onToggleVisibleWindow, isVisibleWindowOpen, isProcessing, onAbort }) => {
  const { backendOnline, checkHealth, healthData } = useStore();

  const handleMinimize = () => window.electronAPI?.minimizeWindow();
  const handleMaximize = () => window.electronAPI?.maximizeWindow();
  const handleClose = () => window.electronAPI?.closeWindow();

  return (
    <header className="h-10 bg-[#0c0d12] border-b border-gray-800 flex items-center justify-between px-4 select-none drag-region">
      {/* Brand & Status */}
      <div className="flex items-center gap-3 no-drag">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center text-xs font-black text-white shadow-sm">
            R
          </div>
          <span className="text-xs font-bold tracking-wider text-gray-200 uppercase">Rajjo Desktop</span>
        </div>

        <div className="h-3 w-[1px] bg-gray-800" />

        {/* Backend Status Pill */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gray-900 border border-gray-800 text-[11px]">
          <span className={cn("w-2 h-2 rounded-full", backendOnline ? "bg-emerald-500 animate-pulse" : "bg-rose-500")} />
          <span className={backendOnline ? "text-emerald-400 font-medium" : "text-rose-400 font-medium"}>
            {backendOnline ? "Backend Live" : "Backend Offline"}
          </span>
          {!backendOnline && (
            <button onClick={() => checkHealth()} title="Retry connection" className="hover:text-white text-gray-400 ml-1">
              <RefreshCw size={10} />
            </button>
          )}
        </div>

        {healthData && (
          <span className="text-[11px] text-gray-400 hidden sm:inline">
            Model: <strong className="text-gray-300 font-medium">{healthData.active_provider}/{healthData.active_model_id}</strong>
          </span>
        )}
      </div>

      {/* Action & Window Controls */}
      <div className="flex items-center gap-2 no-drag">
        {/* Abort Task Button (if processing) */}
        {isProcessing && onAbort && (
          <button
            onClick={onAbort}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 border border-rose-500/50 shadow-sm transition-all animate-pulse"
            title="Stop Current Task Immediately"
          >
            <Square size={11} className="fill-current" />
            <span>Stop Task</span>
          </button>
        )}

        {/* Toggle Visible Window Button */}
        <button
          onClick={onToggleVisibleWindow}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border",
            isVisibleWindowOpen
              ? "bg-blue-600/20 text-blue-300 border-blue-500/40 shadow-sm"
              : isProcessing
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                : "bg-gray-900 text-gray-400 hover:text-gray-200 border-gray-800 hover:border-gray-700"
          )}
          title="Toggle Visible Live Agent Processing Window"
        >
          <Eye size={13} className={isProcessing ? "text-amber-400" : "text-blue-400"} />
          <span>Visible Window</span>
          {isProcessing && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />}
        </button>

        <div className="flex items-center">
          <button onClick={handleMinimize} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800/80 rounded transition-colors">
            <Minus size={14} />
          </button>
          <button onClick={handleMaximize} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800/80 rounded transition-colors">
            <Square size={12} />
          </button>
          <button onClick={handleClose} className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-rose-950/40 rounded transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>
    </header>
  );
};

// ----------------- Sidebar Item -----------------

const SidebarItem = ({ id, icon: Icon, label, active, onClick, badge }) => (
  <button
    onClick={() => onClick(id)}
    className={cn(
      "w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150",
      active
        ? "bg-blue-600/15 text-blue-400 border border-blue-500/25 shadow-sm"
        : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 border border-transparent"
    )}
  >
    <div className="flex items-center gap-2.5">
      <Icon size={16} />
      <span>{label}</span>
    </div>
    {badge && (
      <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-gray-800 text-gray-300 border border-gray-700 font-mono">
        {badge}
      </span>
    )}
  </button>
);

// ----------------- Chat Page -----------------

const ChatPage = ({ onTriggerVisibleWindow, setVisibleActivities, setLiveStreamMsg, onAbortTaskRef }) => {
  const { messages, input, setInput, addMessage, clearMessages, isProcessing, setProcessing, healthData } = useStore();
  const [streamActivities, setStreamActivities] = useState([]);
  const [liveAgentMessage, setLiveAgentMessage] = useState('');
  const [isActivityOpen, setIsActivityOpen] = useState(true);
  const [expandedMessageSteps, setExpandedMessageSteps] = useState({});
  const messagesEndRef = useRef(null);
  const activitiesRef = useRef([]);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamActivities, liveAgentMessage]);

  const toggleMessageSteps = (idx) => {
    setExpandedMessageSteps(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleAbort = async () => {
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
  };

  // Expose abort handler to parent shell
  useEffect(() => {
    if (onAbortTaskRef) {
      onAbortTaskRef.current = handleAbort;
    }
  }, [isProcessing]);

  const handleSend = async (overrideText) => {
    const textToSend = overrideText || input;
    if (!textToSend.trim() || isProcessing) return;

    // Check if user specifically requested a visible window
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
        buffer = lines.pop(); // Keep incomplete line

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));

              // Check if visible browser tool was invoked
              if (data.type === 'tool_start' && (data.tool === 'open_visible_browser' || (data.args && data.args.visible))) {
                onTriggerVisibleWindow(true);
              }

              // Handle structured high-level event types
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
  };

  return (
    <div className="flex flex-col h-full max-w-5xl mx-auto p-4 relative">
      {/* Chat Header Actions */}
      <div className="flex items-center justify-between pb-3 mb-2 border-b border-gray-800/80">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-300">Active Task Workspace</span>
          {healthData && (
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-gray-900 text-blue-400 border border-gray-800">
              {healthData.active_provider}:{healthData.active_model_id}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isProcessing && (
            <button
              onClick={handleAbort}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-rose-300 bg-rose-950/40 hover:bg-rose-950/70 border border-rose-800/50 rounded-lg transition-colors shadow-sm"
            >
              <Square size={11} className="fill-current text-rose-400" />
              <span>Abort Task</span>
            </button>
          )}

          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              disabled={isProcessing}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors"
            >
              <Trash2 size={13} />
              <span>Clear Chat</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto space-y-5 pr-2 custom-scrollbar">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-5 py-12">
            <div className="w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shadow-inner">
              <Bot size={32} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-100">Welcome to Rajjo</h2>
              <p className="text-sm text-gray-400 max-w-md mt-1">
                Your local-first autonomous AI desktop agent. Delegate file manipulation, shell scripts, live web automation, and visible browser sessions.
              </p>
            </div>

            {/* Quick Task Starters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-lg w-full pt-4">
              <button
                onClick={() => handleSend("Show a visible window and search DuckDuckGo for the latest autonomous AI agent frameworks.")}
                className="p-3 bg-gray-900/60 hover:bg-gray-800/70 border border-blue-500/30 hover:border-blue-500/50 rounded-xl text-left text-xs transition-all group"
              >
                <span className="font-semibold text-blue-300 block mb-1 group-hover:text-blue-200 flex items-center gap-1.5">
                  <Eye size={13} className="text-blue-400" /> Visible Window Search
                </span>
                <span className="text-gray-400 line-clamp-1">Launch visible window and watch agent browse</span>
              </button>

              <button
                onClick={() => handleSend("Create a folder named rajjo-demo and write a summary of local AI advantages inside summary.md")}
                className="p-3 bg-gray-900/60 hover:bg-gray-800/70 border border-gray-800 hover:border-gray-700 rounded-xl text-left text-xs transition-all group"
              >
                <span className="font-semibold text-gray-200 block mb-1 group-hover:text-blue-400 flex items-center gap-1.5">
                  <FolderOpen size={13} /> Create Files & Folders
                </span>
                <span className="text-gray-400 line-clamp-1">Create demo directory and markdown files</span>
              </button>

              <button
                onClick={() => handleSend("List the contents of the current directory and report how many files exist.")}
                className="p-3 bg-gray-900/60 hover:bg-gray-800/70 border border-gray-800 hover:border-gray-700 rounded-xl text-left text-xs transition-all group"
              >
                <span className="font-semibold text-gray-200 block mb-1 group-hover:text-blue-400 flex items-center gap-1.5">
                  <Terminal size={13} /> List Current Directory
                </span>
                <span className="text-gray-400 line-clamp-1">Inspect directory entries and structure</span>
              </button>

              <button
                onClick={() => handleSend("Run a safe shell command to display current system date, time, and Python version.")}
                className="p-3 bg-gray-900/60 hover:bg-gray-800/70 border border-gray-800 hover:border-gray-700 rounded-xl text-left text-xs transition-all group"
              >
                <span className="font-semibold text-gray-200 block mb-1 group-hover:text-blue-400 flex items-center gap-1.5">
                  <Play size={13} /> Run Shell Command
                </span>
                <span className="text-gray-400 line-clamp-1">Execute safe system commands with timeouts</span>
              </button>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              "flex gap-3.5",
              msg.role === 'user' ? "flex-row-reverse" : "flex-row"
            )}
          >
            <div className={cn(
              "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
              msg.role === 'user' ? "bg-blue-600 text-white" : "bg-[#12141f] text-blue-400 border border-blue-500/30"
            )}>
              {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
            </div>

            <div className={cn(
              "max-w-[88%] rounded-2xl p-4 text-xs leading-relaxed space-y-3",
              msg.role === 'user'
                ? "bg-blue-600 text-white shadow-md font-medium"
                : msg.isError
                  ? "bg-rose-950/40 border border-rose-800/50 text-rose-200"
                  : "bg-gray-900/90 border border-gray-800/90 text-gray-200 shadow-md"
            )}>
              {/* Message Execution Step Accordion (if activities exist) */}
              {msg.activities && msg.activities.length > 0 && (
                <div className="border-b border-gray-800/80 pb-2 mb-2">
                  <button
                    onClick={() => toggleMessageSteps(i)}
                    className="flex items-center justify-between w-full text-[11px] text-gray-400 hover:text-gray-200 font-medium"
                  >
                    <div className="flex items-center gap-1.5 text-blue-400">
                      <CheckCircle2 size={12} className="text-emerald-400" />
                      <span>Execution Trace ({msg.activities.length} steps)</span>
                    </div>
                    {expandedMessageSteps[i] ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>

                  {expandedMessageSteps[i] && (
                    <div className="mt-2 space-y-1 pl-2 border-l border-gray-800">
                      {msg.activities.map((act, actIdx) => (
                        <div key={actIdx} className="text-[10.5px] text-gray-400 flex items-center gap-1.5 font-mono">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          <span className="text-gray-300">{act.message || act.type}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Render User plain text or Agent rich Markdown */}
              {msg.role === 'user' ? (
                <div className="whitespace-pre-wrap font-sans">{msg.content}</div>
              ) : (
                <MarkdownRenderer content={msg.content} />
              )}
            </div>
          </div>
        ))}

        {/* Live Streaming Activity & Live Response */}
        {isProcessing && (
          <div className="flex gap-3.5">
            <div className="w-8 h-8 rounded-xl bg-gray-800 border border-blue-500/40 text-blue-400 flex items-center justify-center shrink-0 animate-pulse">
              <Bot size={16} />
            </div>

            <div className="flex-1 max-w-[88%] space-y-3">
              {/* High-level Activity Stream */}
              {streamActivities.length > 0 && (
                <div className="bg-gray-900/90 border border-gray-800 rounded-xl p-3 text-xs space-y-2">
                  <div
                    onClick={() => setIsActivityOpen(!isActivityOpen)}
                    className="flex items-center justify-between cursor-pointer font-semibold text-gray-300 hover:text-white"
                  >
                    <div className="flex items-center gap-2 text-blue-400">
                      <RefreshCw size={12} className="animate-spin" />
                      <span>Agent Execution Activity ({streamActivities.length} steps)</span>
                    </div>
                    {isActivityOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>

                  {isActivityOpen && (
                    <div className="space-y-1.5 pt-1 border-t border-gray-800">
                      {streamActivities.map((act, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-gray-400 text-[11px]">
                          {act.type === 'tool_start' ? (
                            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 animate-pulse" />
                          ) : act.type === 'tool_end' ? (
                            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                          ) : act.type === 'reflection' ? (
                            <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                          )}
                          <span className="text-gray-300 font-mono">{act.message || act.type}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Live content typing */}
              {liveAgentMessage && (
                <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-4 text-xs text-gray-200 shadow-md">
                  <MarkdownRenderer content={liveAgentMessage} />
                  <span className="inline-block w-2 h-3.5 ml-1 bg-blue-400 animate-pulse" />
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <div className="mt-3 relative">
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (isProcessing) {
                handleAbort();
              } else {
                handleSend();
              }
            }
          }}
          placeholder={isProcessing ? "Task in progress... Click Stop button or press Enter to abort." : "Message Rajjo agent (e.g. 'show a visible window and browse...', Shift+Enter for newline)..."}
          className="w-full bg-gray-900/90 border border-gray-800 rounded-2xl py-3.5 pl-4 pr-14 text-xs text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all resize-none custom-scrollbar"
        />
        {isProcessing ? (
          <button
            onClick={handleAbort}
            className="absolute right-3 top-3.5 p-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white hover:scale-105 active:scale-95 transition-all shadow-md animate-pulse"
            title="Stop / Abort Active Task"
          >
            <Square size={15} className="fill-current" />
          </button>
        ) : (
          <button
            onClick={() => handleSend()}
            disabled={!input.trim()}
            className="absolute right-3 top-3.5 p-2 rounded-xl bg-blue-600 text-white disabled:opacity-40 disabled:hover:scale-100 hover:scale-105 active:scale-95 transition-all shadow-md"
            title="Send Message"
          >
            <Send size={15} />
          </button>
        )}
      </div>
    </div>
  );
};

// ----------------- Models Page -----------------

const ModelsPage = () => {
  const { modelsData, fetchModels, selectModel, testModelConnection, detectOllama, validateGGUFPath } = useStore();
  const [provider, setProvider] = useState(modelsData.active_provider || 'openai');
  const [modelId, setModelId] = useState(modelsData.active_model_id || 'gpt-4o');
  const [apiKey, setApiKey] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState(modelsData.custom_base_url || '');
  const [ggufPath, setGgufPath] = useState(modelsData.gguf?.model_path || '');
  const [ggufValidation, setGgufValidation] = useState(modelsData.gguf?.info || null);
  const [testResult, setTestResult] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isScanningOllama, setIsScanningOllama] = useState(false);
  const [ollamaScanStatus, setOllamaScanStatus] = useState('');

  useEffect(() => {
    fetchModels();
  }, []);

  const handleProviderSelect = (newProvider) => {
    setProvider(newProvider);
    setTestResult(null);
    if (newProvider === 'ollama') {
      if (modelsData.ollama?.models?.length > 0) {
        if (!modelsData.ollama.models.includes(modelId) || modelId === 'gpt-4o') {
          setModelId(modelsData.ollama.models[0]);
        }
      } else {
        setModelId('llama3');
      }
    } else if (newProvider === 'groq') {
      if (!modelId.includes('llama') && !modelId.includes('mixtral')) {
        setModelId('llama-3.3-70b-versatile');
      }
    } else if (newProvider === 'openai') {
      if (!modelId.startsWith('gpt-') && !modelId.startsWith('o1') && !modelId.startsWith('o3')) {
        setModelId('gpt-4o');
      }
    } else if (newProvider === 'universal' || newProvider === 'custom') {
      if (!modelId || modelId === 'gpt-4o') {
        setModelId('deepseek-chat');
      }
    }
  };

  const handleScanOllama = async () => {
    setIsScanningOllama(true);
    setTestResult(null);
    setOllamaScanStatus('Scanning Ollama endpoints (localhost & 127.0.0.1:11434)...');
    try {
      const data = await detectOllama();
      if (data && data.models && data.models.length > 0) {
        setOllamaScanStatus(`Found ${data.models.length} local models: ${data.models.join(', ')}`);
        setModelId(data.models[0]);
      } else if (data && data.running) {
        setOllamaScanStatus('Ollama is running, but no models have been pulled yet.');
      } else {
        setOllamaScanStatus(data.message || 'Ollama is unreachable.');
      }
    } finally {
      setIsScanningOllama(false);
    }
  };

  const handleSelectGGUF = async () => {
    if (window.electronAPI?.selectGGUFFile) {
      const selected = await window.electronAPI.selectGGUFFile();
      if (selected) {
        setGgufPath(selected);
        const info = await validateGGUFPath(selected);
        setGgufValidation(info);
      }
    }
  };

  const getEffectiveModelId = () => {
    if (provider === 'ollama') {
      if (modelsData.ollama?.models?.length > 0) {
        return modelsData.ollama.models.includes(modelId) ? modelId : modelsData.ollama.models[0];
      }
      return modelId || 'llama3';
    }
    if (provider === 'openai') return modelId || 'gpt-4o';
    if (provider === 'groq') return modelId || 'llama-3.3-70b-versatile';
    if (provider === 'universal' || provider === 'custom') return modelId || 'default';
    if (provider === 'gguf') return 'rajjo-direct-gguf';
    return modelId;
  };

  const handleSaveActive = async () => {
    const effectiveModel = getEffectiveModelId();
    const payload = {
      provider,
      model_id: effectiveModel,
      custom_base_url: customBaseUrl,
      gguf_model_path: ggufPath,
      api_key: apiKey || undefined
    };
    const ok = await selectModel(payload);
    if (ok) {
      setModelId(effectiveModel);
      alert(`Model successfully activated: ${provider.toUpperCase()} (${effectiveModel})`);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    const effectiveModel = getEffectiveModelId();
    const payload = {
      provider,
      model_id: effectiveModel,
      base_url: customBaseUrl,
      gguf_model_path: ggufPath,
      api_key: apiKey || undefined
    };
    const res = await testModelConnection(payload);
    setTestResult(res);
    setIsTesting(false);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-100">Model Manager & Engine Router</h2>
        <p className="text-xs text-gray-400 mt-1">
          Switch dynamically between Cloud APIs, local Ollama downloads, Universal OpenAI-compatible endpoints, and Rajjo's Direct GGUF Engine.
        </p>
      </div>

      {/* Provider Selector Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { id: 'openai', label: 'OpenAI / Cloud', desc: 'GPT-4o, o3-mini' },
          { id: 'groq', label: 'Groq Fast Cloud', desc: 'Llama 3.3 70B, High Speed' },
          { id: 'ollama', label: 'Local Ollama', desc: 'Installed local models' },
          { id: 'gguf', label: 'Rajjo Direct GGUF', desc: 'Direct SSD/HDD inference' },
          { id: 'universal', label: 'Universal API', desc: 'DeepSeek, OpenRouter, LM Studio' },
        ].map(item => (
          <div
            key={item.id}
            onClick={() => handleProviderSelect(item.id)}
            className={cn(
              "p-4 rounded-xl border cursor-pointer transition-all",
              provider === item.id
                ? "bg-blue-600/10 border-blue-500/40 shadow-sm"
                : "bg-gray-900/60 border-gray-800 hover:border-gray-700"
            )}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-xs text-gray-200">{item.label}</span>
              {provider === item.id && <span className="w-2 h-2 rounded-full bg-blue-500" />}
            </div>
            <p className="text-[11px] text-gray-400">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* Configuration Form */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 space-y-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-200">
          Configure {provider.toUpperCase()} Settings
        </h3>

        {provider === 'openai' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Model Name</label>
              <input
                value={modelId}
                onChange={e => setModelId(e.target.value)}
                placeholder="gpt-4o or gpt-4o-mini"
                className="w-full bg-gray-950 border border-gray-800 rounded-xl p-2.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">OpenAI API Key (Stored Securely)</label>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={modelsData.credentials?.openai?.configured ? "•••••••••••••••• (Configured)" : "sk-..."}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl p-2.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {provider === 'groq' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Groq Model ID</label>
              <input
                value={modelId}
                onChange={e => setModelId(e.target.value)}
                placeholder="llama-3.3-70b-versatile"
                className="w-full bg-gray-950 border border-gray-800 rounded-xl p-2.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Groq API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={modelsData.credentials?.groq?.configured ? "•••••••••••••••• (Configured)" : "gsk_..."}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl p-2.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {provider === 'ollama' && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 bg-gray-950 rounded-xl border border-gray-800">
              <div className="flex items-center gap-2">
                <span className={cn("w-2 h-2 rounded-full", modelsData.ollama?.running ? "bg-emerald-500" : "bg-rose-500")} />
                <span className="text-xs text-gray-300">
                  {modelsData.ollama?.running ? "Ollama Service Live" : "Ollama Not Detected at http://localhost:11434"}
                </span>
              </div>
              <button
                onClick={handleScanOllama}
                disabled={isScanningOllama}
                className="px-3 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
              >
                <RefreshCw size={11} className={isScanningOllama ? "animate-spin" : ""} />
                <span>{isScanningOllama ? "Scanning Local Models..." : "Scan Ollama Models"}</span>
              </button>
            </div>

            {ollamaScanStatus && (
              <p className="text-[11px] text-gray-400 italic px-1">{ollamaScanStatus}</p>
            )}

            <div>
              <label className="block text-xs text-gray-400 mb-1">Select Installed Local Model</label>
              {modelsData.ollama?.models?.length > 0 ? (
                <select
                  value={modelId}
                  onChange={e => setModelId(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl p-2.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                >
                  {modelsData.ollama.models.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={modelId}
                  onChange={e => setModelId(e.target.value)}
                  placeholder="e.g. llama3.2, mistral, qwen2.5:7b, deepseek-r1:8b"
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl p-2.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
              )}
            </div>
          </div>
        )}

        {provider === 'gguf' && (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-blue-950/20 border border-blue-500/30 text-xs text-gray-300">
              <span className="font-semibold text-blue-300 block mb-1">Rajjo Direct GGUF Engine</span>
              <span>Directly execute any quantized .gguf model file from your SSD, HDD, Downloads, or external drive with zero directory setup.</span>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Local GGUF File Path</label>
              <div className="flex gap-2">
                <input
                  value={ggufPath}
                  onChange={async e => {
                    setGgufPath(e.target.value);
                    const info = await validateGGUFPath(e.target.value);
                    setGgufValidation(info);
                  }}
                  placeholder="D:\Models\llama-3-8b-instruct.Q4_K_M.gguf"
                  className="flex-1 bg-gray-950 border border-gray-800 rounded-xl p-2.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
                <button
                  onClick={handleSelectGGUF}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <FolderOpen size={14} />
                  <span>Browse GGUF</span>
                </button>
              </div>
            </div>

            {ggufValidation && (
              <div className={cn("p-3 rounded-xl border text-xs", ggufValidation.valid ? "bg-emerald-950/20 border-emerald-800/40 text-emerald-300" : "bg-rose-950/20 border-rose-800/40 text-rose-300")}>
                {ggufValidation.valid ? (
                  <div>
                    <span className="font-semibold block">Valid GGUF Model File Ready</span>
                    <span className="text-[11px] text-gray-400 font-mono">File: {ggufValidation.filename} • Size: {ggufValidation.size_gb} GB</span>
                  </div>
                ) : (
                  <div>
                    <span className="font-semibold block">GGUF File Notice</span>
                    <span className="text-[11px]">{ggufValidation.error}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {(provider === 'universal' || provider === 'custom') && (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-500/30 text-xs text-gray-300">
              <span className="font-semibold text-purple-300 block mb-1">Universal API Accepter</span>
              <span>Connect to ANY OpenAI-compatible service: DeepSeek, OpenRouter, Together AI, Mistral, LM Studio (http://localhost:1234/v1), vLLM, or Jan.</span>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Base URL Endpoint</label>
              <input
                value={customBaseUrl}
                onChange={e => setCustomBaseUrl(e.target.value)}
                placeholder="https://api.deepseek.com/v1 or http://localhost:1234/v1"
                className="w-full bg-gray-950 border border-gray-800 rounded-xl p-2.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Model Identifier</label>
              <input
                value={modelId}
                onChange={e => setModelId(e.target.value)}
                placeholder="deepseek-chat or mistralai/mistral-large"
                className="w-full bg-gray-950 border border-gray-800 rounded-xl p-2.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">API Key (Optional for local servers)</label>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full bg-gray-950 border border-gray-800 rounded-xl p-2.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-3 border-t border-gray-800 flex items-center justify-between">
          <button
            onClick={handleTest}
            disabled={isTesting}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            {isTesting && <RefreshCw size={12} className="animate-spin" />}
            <span>Test Connection</span>
          </button>

          <button
            onClick={handleSaveActive}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md transition-colors"
          >
            Set as Active Model
          </button>
        </div>

        {testResult && (
          <div className={cn("p-3 rounded-xl border text-xs mt-3", testResult.success ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-300" : "bg-rose-950/30 border-rose-800/40 text-rose-300")}>
            <div className="flex items-center gap-2 font-semibold mb-1">
              {testResult.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              <span>{testResult.success ? "Test Passed" : "Test Failed"}</span>
            </div>
            <p className="text-[11px] font-mono">{testResult.message}</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ----------------- Tools Page -----------------

const ToolsPage = () => {
  const { toolsList, fetchTools, toggleTool } = useStore();

  useEffect(() => {
    fetchTools();
  }, []);

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-100">Tool Ecosystem & Automation Registry</h2>
        <p className="text-xs text-gray-400 mt-1">Manage autonomous tool capabilities, safety restrictions, and parameter schemas.</p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {toolsList.map(tool => (
          <div
            key={tool.name}
            className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4.5 flex items-center justify-between shadow-sm hover:border-gray-700/80 transition-all"
          >
            <div className="space-y-1 max-w-xl">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs text-gray-200 font-mono">{tool.name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-blue-400 border border-gray-700 font-medium">
                  {tool.category}
                </span>
              </div>
              <p className="text-xs text-gray-400">{tool.description}</p>
            </div>

            {/* Toggle switch */}
            <div
              onClick={() => toggleTool(tool.name, !tool.enabled)}
              className={cn(
                "w-11 h-6 rounded-full relative cursor-pointer transition-colors duration-200 shrink-0",
                tool.enabled ? "bg-blue-600" : "bg-gray-800"
              )}
            >
              <div
                className={cn(
                  "w-4 h-4 rounded-full bg-white absolute top-1 transition-transform duration-200",
                  tool.enabled ? "left-6" : "left-1"
                )}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ----------------- Memory Page -----------------

const MemoryPage = () => {
  const { episodicTasks, semanticMemories, fetchMemory, clearEpisodicMemory, clearSemanticMemory, exportMemory, importMemory } = useStore();
  const [tab, setTab] = useState('episodic');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchMemory();
  }, []);

  const handleExport = async () => {
    const data = await exportMemory();
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rajjo_memory_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result);
        const res = await importMemory(parsed);
        alert(`Imported ${res.imported_episodic} episodic tasks and ${res.imported_semantic} semantic insights.`);
      } catch (err) {
        alert('Invalid JSON file format.');
      }
    };
    reader.readAsText(file);
  };

  const filteredTasks = episodicTasks.filter(t =>
    t.user_input?.toLowerCase().includes(search.toLowerCase()) ||
    t.outcome?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredSemantic = semanticMemories.filter(m =>
    m.document?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Self-Learning Memory</h2>
          <p className="text-xs text-gray-400 mt-1">Explore episodic task logs and extracted semantic knowledge stored locally.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 rounded-xl text-xs font-semibold transition-colors"
          >
            <Download size={13} />
            <span>Export</span>
          </button>

          <label className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 rounded-xl text-xs font-semibold cursor-pointer transition-colors">
            <Upload size={13} />
            <span>Import</span>
            <input type="file" accept=".json" onChange={handleImportFile} className="hidden" />
          </label>
        </div>
      </div>

      {/* Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex bg-gray-900/90 border border-gray-800 rounded-xl p-1 w-full sm:w-auto">
          <button
            onClick={() => setTab('episodic')}
            className={cn(
              "px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors",
              tab === 'episodic' ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200"
            )}
          >
            Episodic Tasks ({episodicTasks.length})
          </button>
          <button
            onClick={() => setTab('semantic')}
            className={cn(
              "px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors",
              tab === 'semantic' ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200"
            )}
          >
            Semantic Insights ({semanticMemories.length})
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-2.5 text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search memory..."
            className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Memory Content */}
      <div className="space-y-3">
        {tab === 'episodic' ? (
          filteredTasks.length === 0 ? (
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-12 text-center text-gray-500 space-y-2">
              <Database size={36} className="mx-auto text-gray-600" />
              <p className="text-xs">No episodic tasks recorded yet. Completed agent tasks will appear here.</p>
            </div>
          ) : (
            filteredTasks.map(task => (
              <div key={task.id} className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4 text-xs space-y-2 shadow-sm">
                <div className="flex items-center justify-between text-gray-400 text-[11px]">
                  <span className="font-mono text-blue-400 font-semibold">Task #{task.id}</span>
                  <span>{new Date(task.timestamp).toLocaleString()}</span>
                </div>
                <div className="font-semibold text-gray-200">{task.user_input}</div>
                <div className="p-2 rounded-lg bg-gray-950 border border-gray-800 text-gray-400 font-mono text-[11px]">
                  Outcome: {task.outcome}
                </div>
              </div>
            ))
          )
        ) : (
          filteredSemantic.length === 0 ? (
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-12 text-center text-gray-500 space-y-2">
              <Database size={36} className="mx-auto text-gray-600" />
              <p className="text-xs">Semantic vector memory is empty. Reflections and learned facts will appear here.</p>
            </div>
          ) : (
            filteredSemantic.map((mem, idx) => (
              <div key={idx} className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4 text-xs space-y-2 shadow-sm">
                <div className="flex items-center justify-between text-gray-400 text-[11px]">
                  <span className="text-purple-400 font-semibold">Learned Insight</span>
                </div>
                <p className="text-gray-200 leading-relaxed">{mem.document}</p>
              </div>
            ))
          )
        )}
      </div>

      {/* Clear Memory Button */}
      {(episodicTasks.length > 0 || semanticMemories.length > 0) && (
        <div className="pt-4 border-t border-gray-800 flex justify-end">
          <button
            onClick={() => {
              if (confirm('Are you sure you want to clear memory records?')) {
                if (tab === 'episodic') clearEpisodicMemory();
                else clearSemanticMemory();
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/30 hover:bg-rose-950/60 text-rose-300 border border-rose-800/40 rounded-xl text-xs font-semibold transition-colors"
          >
            <Trash2 size={13} />
            <span>Clear {tab === 'episodic' ? 'Episodic' : 'Semantic'} Memory</span>
          </button>
        </div>
      )}
    </div>
  );
};

// ----------------- Settings Page -----------------

const SettingsPage = () => {
  const { settingsData, fetchSettings, updateSettings } = useStore();
  const [openaiKey, setOpenaiKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [customKey, setCustomKey] = useState('');
  const [shellTimeout, setShellTimeout] = useState(30);

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async () => {
    const updates = {
      shell_timeout: Number(shellTimeout),
      openai_api_key: openaiKey || undefined,
      groq_api_key: groqKey || undefined,
      custom_api_key: customKey || undefined
    };
    const ok = await updateSettings(updates);
    if (ok) {
      alert('Settings updated successfully!');
      setOpenaiKey('');
      setGroqKey('');
      setCustomKey('');
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-100">Application Settings</h2>
        <p className="text-xs text-gray-400 mt-1">Configure secure credentials, data storage paths, and execution safety limits.</p>
      </div>

      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 space-y-5 shadow-sm">
        {/* Credentials Section */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-200">Secure API Credentials</h3>
          <p className="text-[11px] text-gray-400">Keys are never transmitted in plaintext and are masked in user interfaces.</p>

          <div>
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
              <span>OpenAI API Key</span>
              <span className="text-[11px] text-blue-400">{settingsData.credentials?.openai?.masked || "Not set"}</span>
            </div>
            <input
              type="password"
              value={openaiKey}
              onChange={e => setOpenaiKey(e.target.value)}
              placeholder="Enter new OpenAI key to update..."
              className="w-full bg-gray-950 border border-gray-800 rounded-xl p-2.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
              <span>Groq API Key</span>
              <span className="text-[11px] text-blue-400">{settingsData.credentials?.groq?.masked || "Not set"}</span>
            </div>
            <input
              type="password"
              value={groqKey}
              onChange={e => setGroqKey(e.target.value)}
              placeholder="Enter new Groq key to update..."
              className="w-full bg-gray-950 border border-gray-800 rounded-xl p-2.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
              <span>Universal / Custom Endpoint API Key</span>
              <span className="text-[11px] text-blue-400">{settingsData.credentials?.custom?.masked || "Not set"}</span>
            </div>
            <input
              type="password"
              value={customKey}
              onChange={e => setCustomKey(e.target.value)}
              placeholder="Enter custom API key..."
              className="w-full bg-gray-950 border border-gray-800 rounded-xl p-2.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Safety & Execution */}
        <div className="pt-4 border-t border-gray-800 space-y-3">
          <h3 className="text-sm font-semibold text-gray-200">Execution Safety & Limits</h3>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Shell Execution Timeout (Seconds)</label>
            <input
              type="number"
              value={shellTimeout}
              onChange={e => setShellTimeout(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-xl p-2.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Local Data & Vector Directory</label>
            <input
              disabled
              value={settingsData.settings?.data_dir || "~/.rajjo"}
              className="w-full bg-gray-950/50 border border-gray-800 rounded-xl p-2.5 text-xs text-gray-400 font-mono"
            />
          </div>
        </div>

        {/* Save button */}
        <div className="pt-4 border-t border-gray-800 flex justify-end">
          <button
            onClick={handleSave}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md transition-colors"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};

// ----------------- Main App Shell -----------------

export default function App() {
  const { activeTab, setActiveTab, checkHealth, fetchModels, isProcessing, healthData } = useStore();
  const [isVisibleWindowOpen, setIsVisibleWindowOpen] = useState(false);
  const [visibleActivities, setVisibleActivities] = useState([]);
  const [liveStreamMsg, setLiveStreamMsg] = useState('');
  const abortTaskRef = useRef(null);

  useEffect(() => {
    checkHealth();
    fetchModels();
    const interval = setInterval(() => {
      checkHealth();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleAbortTask = () => {
    if (abortTaskRef.current) {
      abortTaskRef.current();
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#090A0F] text-gray-100 overflow-hidden font-sans">
      <TitleBar
        onToggleVisibleWindow={() => setIsVisibleWindowOpen(!isVisibleWindowOpen)}
        isVisibleWindowOpen={isVisibleWindowOpen}
        isProcessing={isProcessing}
        onAbort={handleAbortTask}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left Navigation Sidebar */}
        <nav className="w-56 border-r border-gray-800/80 bg-[#0c0d12]/70 flex flex-col p-3 gap-5 justify-between">
          <div className="space-y-1">
            <SidebarItem id="chat" icon={MessageSquare} label="Chat & Agent" active={activeTab === 'chat'} onClick={setActiveTab} />
            <SidebarItem id="models" icon={Cpu} label="Models" active={activeTab === 'models'} onClick={setActiveTab} />
            <SidebarItem id="tools" icon={Wrench} label="Tools" active={activeTab === 'tools'} onClick={setActiveTab} />
            <SidebarItem id="memory" icon={Database} label="Memory" active={activeTab === 'memory'} onClick={setActiveTab} />
          </div>

          <div className="border-t border-gray-800/80 pt-3">
            <SidebarItem id="settings" icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={setActiveTab} />
          </div>
        </nav>

        {/* Main Content Area */}
        <main className="flex-1 relative overflow-hidden bg-gradient-to-br from-[#090A0F] to-[#0d0e15]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="h-full w-full overflow-y-auto"
            >
              {activeTab === 'chat' && (
                <ChatPage
                  onTriggerVisibleWindow={(open) => setIsVisibleWindowOpen(open)}
                  setVisibleActivities={setVisibleActivities}
                  setLiveStreamMsg={setLiveStreamMsg}
                  onAbortTaskRef={abortTaskRef}
                />
              )}
              {activeTab === 'models' && <ModelsPage />}
              {activeTab === 'tools' && <ToolsPage />}
              {activeTab === 'memory' && <MemoryPage />}
              {activeTab === 'settings' && <SettingsPage />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

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
  );
}
