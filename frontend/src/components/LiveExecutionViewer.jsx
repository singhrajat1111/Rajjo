import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Terminal,
  Activity,
  Globe,
  Bot,
  Play,
  CheckCircle2,
  AlertCircle,
  Minimize2,
  Maximize2,
  X,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Radio,
  Eye,
  Layers,
  Square
} from 'lucide-react';

export default function LiveExecutionViewer({
  isOpen,
  onClose,
  onAbort,
  activities = [],
  liveMessage = '',
  isProcessing = false,
  activeModel = ''
}) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState('stream'); // 'stream' | 'activity'
  const terminalEndRef = useRef(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activities, liveMessage]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2 }}
        className={`fixed z-50 transition-all ${
          isMinimized
            ? 'bottom-4 right-4 w-80 h-12 shadow-2xl rounded-2xl overflow-hidden'
            : 'bottom-6 right-6 w-[520px] max-w-[92vw] h-[540px] max-h-[85vh] rounded-2xl shadow-2xl overflow-hidden'
        } bg-[#090a10]/95 backdrop-blur-md border border-blue-500/40 flex flex-col font-mono`}
      >
        {/* Header Bar */}
        <div className="h-11 bg-[#10121d] border-b border-gray-800 px-3.5 flex items-center justify-between select-none">
          <div className="flex items-center gap-2.5">
            <div className={`w-2.5 h-2.5 rounded-full ${isProcessing ? 'bg-amber-400 animate-ping' : 'bg-blue-500'} shrink-0`} />
            <div className="flex items-center gap-1.5">
              <Eye size={14} className="text-blue-400" />
              <span className="text-xs font-bold text-gray-100 tracking-wide">
                Agent Live Visible Window
              </span>
            </div>
            {isProcessing && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                <Radio size={10} className="animate-pulse text-amber-400" />
                Processing
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {isProcessing && onAbort && (
              <button
                onClick={onAbort}
                className="px-2 py-0.5 mr-1 rounded bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 border border-rose-500/40 text-[10px] font-bold flex items-center gap-1 transition-all"
                title="Stop / Abort Active Task"
              >
                <Square size={9} className="fill-current" />
                <span>Abort</span>
              </button>
            )}
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded transition-colors"
              title={isMinimized ? 'Expand Window' : 'Minimize Window'}
            >
              {isMinimized ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
            </button>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-rose-400 hover:bg-rose-950/40 rounded transition-colors"
              title="Close Visible Window"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        {!isMinimized && (
          <div className="flex-1 flex flex-col overflow-hidden bg-[#07080e]">
            {/* Secondary Controls & View Tabs */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-[#0d0e17] border-b border-gray-800/80 text-[11px]">
              <div className="flex gap-1">
                <button
                  onClick={() => setActiveTab('stream')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    activeTab === 'stream'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                  }`}
                >
                  <Terminal size={12} />
                  <span>Live Stream</span>
                </button>
                <button
                  onClick={() => setActiveTab('activity')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    activeTab === 'activity'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                  }`}
                >
                  <Activity size={12} />
                  <span>Steps ({activities.length})</span>
                </button>
              </div>

              {activeModel && (
                <span className="text-[10px] text-gray-400 font-mono">
                  Engine: <strong className="text-gray-300">{activeModel}</strong>
                </span>
              )}
            </div>

            {/* Main Terminal / Live Viewport */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3 custom-scrollbar text-xs">
              {activeTab === 'stream' && (
                <div className="space-y-2 font-mono">
                  <div className="text-[11px] text-emerald-400/90 flex items-center gap-2">
                    <span className="text-emerald-500 font-bold">[Rajjo-OS]</span>
                    <span>Autonomous execution session active. Monitoring live telemetry...</span>
                  </div>

                  {/* Real-time Activity Feed */}
                  {activities.map((act, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-lg bg-gray-900/60 border border-gray-800/80 text-[11px] space-y-1"
                    >
                      <div className="flex items-center justify-between text-gray-400">
                        <div className="flex items-center gap-1.5">
                          {act.type === 'tool_start' && <Play size={11} className="text-amber-400 animate-pulse" />}
                          {act.type === 'tool_end' && (
                            act.success ? <CheckCircle2 size={11} className="text-emerald-400" /> : <AlertCircle size={11} className="text-rose-400" />
                          )}
                          {act.type === 'status' && <Radio size={11} className="text-blue-400" />}
                          {act.type === 'reflection' && <Layers size={11} className="text-purple-400" />}
                          <span className="uppercase text-[10px] font-bold text-gray-300">
                            {act.type.replace('_', ' ')}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-500">Step #{idx + 1}</span>
                      </div>
                      <div className="text-gray-200">{act.message}</div>
                      {act.args && Object.keys(act.args).length > 0 && (
                        <div className="p-1.5 rounded bg-black/50 text-[10px] text-blue-300/90 overflow-x-auto">
                          {JSON.stringify(act.args, null, 1)}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Live typing text */}
                  {liveMessage && (
                    <div className="p-3 rounded-xl bg-blue-950/20 border border-blue-500/30 text-gray-100 text-xs leading-relaxed space-y-1">
                      <div className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider">
                        Generating Output:
                      </div>
                      <div className="whitespace-pre-wrap font-sans">
                        {liveMessage}
                        <span className="inline-block w-2 h-3.5 ml-1 bg-blue-400 animate-pulse" />
                      </div>
                    </div>
                  )}

                  {!isProcessing && activities.length === 0 && !liveMessage && (
                    <div className="h-48 flex flex-col items-center justify-center text-center text-gray-500 space-y-2">
                      <Bot size={28} className="text-gray-600" />
                      <p className="text-xs">Visible live monitor is idle. Run a task or command to see live telemetry.</p>
                    </div>
                  )}

                  <div ref={terminalEndRef} />
                </div>
              )}

              {activeTab === 'activity' && (
                <div className="space-y-2">
                  {activities.length === 0 ? (
                    <div className="text-center py-10 text-gray-500 text-xs">No execution steps yet.</div>
                  ) : (
                    activities.map((act, i) => (
                      <div key={i} className="p-2.5 rounded-xl bg-gray-900/80 border border-gray-800 text-xs space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-blue-400 font-mono">#{i + 1} {act.type}</span>
                          {act.tool && <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 text-[10px]">{act.tool}</span>}
                        </div>
                        <p className="text-gray-200 text-[11.5px]">{act.message}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Bottom Status Bar */}
            <div className="px-3.5 py-2 bg-[#0c0d15] border-t border-gray-800 flex items-center justify-between text-[10px] text-gray-400">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-amber-400 animate-ping' : 'bg-emerald-500'}`} />
                <span>{isProcessing ? 'Agent Active' : 'Ready'}</span>
              </div>
              <div className="flex items-center gap-2">
                {isProcessing && onAbort && (
                  <button
                    onClick={onAbort}
                    className="px-2 py-0.5 rounded bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 text-[10px] font-semibold transition-colors"
                  >
                    Stop Task
                  </button>
                )}
                <span>Visible Headful Engine: Enabled</span>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
