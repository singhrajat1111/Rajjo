import React from 'react';
import { motion } from 'framer-motion';
import { HardDrive, FolderOpen, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn, formatBytes } from '../../lib/utils';

export default function GGUFConfigSection({
  ggufPath,
  setGgufPath,
  ggufValidation,
  setGgufValidation,
  validateGGUFPath,
}) {
  const handleSelectGGUF = async () => {
    try {
      if (window.electron && window.electron.selectFile) {
        const selected = await window.electron.selectFile({
          title: 'Select GGUF Model File',
          filters: [{ name: 'GGUF Models', extensions: ['gguf'] }]
        });
        if (selected) {
          setGgufPath(selected);
          const info = await validateGGUFPath(selected);
          setGgufValidation(info);
        }
      }
    } catch (e) {
      console.error('File selection error:', e);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
        <div className="flex items-center gap-2 mb-2">
          <HardDrive size={18} className="text-[var(--accent-400)]" />
          <span className="font-semibold text-[var(--fg-primary)]">Rajjo Direct GGUF Engine</span>
        </div>
        <p className="text-sm text-[var(--fg-secondary)]">
          Directly execute any quantized .gguf model file from your SSD, HDD, Downloads, or external drive with zero directory setup. Supports CPU/GPU acceleration via llama.cpp.
        </p>
      </div>

      <div>
        <label className="block text-xs text-[var(--fg-muted)] mb-1">Local GGUF File Path</label>
        <div className="flex gap-2">
          <input
            value={ggufPath}
            onChange={async e => {
              setGgufPath(e.target.value);
              const info = await validateGGUFPath(e.target.value);
              setGgufValidation(info);
            }}
            placeholder="D:\\Models\\llama-3-8b-instruct.Q4_K_M.gguf or /home/user/models/mistral-7b.q4_k_m.gguf"
            className="input input-lg font-mono flex-1"
          />
          <button
            onClick={handleSelectGGUF}
            className="btn btn-primary btn-lg gap-2 shrink-0"
          >
            <FolderOpen size={16} />
            <span>Browse GGUF</span>
          </button>
        </div>
      </div>

      {ggufValidation && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'p-4 rounded-xl border text-sm',
            ggufValidation.valid
              ? 'bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success)]'
              : 'bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger)]'
          )}
        >
          {ggufValidation.valid ? (
            <div>
              <div className="flex items-center gap-2 font-semibold mb-1">
                <CheckCircle2 size={16} />
                Valid GGUF Model File Ready
              </div>
              <div className="text-xs text-[var(--fg-muted)] font-mono space-y-1">
                <div>File: {ggufValidation.filename}</div>
                <div>Size: {formatBytes(ggufValidation.size_bytes)}</div>
                {ggufValidation.arch && <div>Arch: {ggufValidation.arch}</div>}
                {ggufValidation.quantization && <div>Quant: {ggufValidation.quantization}</div>}
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 font-semibold mb-1">
                <AlertCircle size={16} />
                GGUF File Notice
              </div>
              <div className="text-xs">{ggufValidation.error}</div>
            </div>
          )}
        </motion.div>
      )}

      {/* GGUF Settings */}
      <div className="pt-4 border-t border-[var(--border-default)] grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs text-[var(--fg-muted)] mb-1">Context Window</label>
          <select className="input input-lg font-mono" defaultValue="4096">
            <option value="2048">2048</option>
            <option value="4096">4096 (Default)</option>
            <option value="8192">8192</option>
            <option value="16384">16384</option>
            <option value="32768">32768</option>
            <option value="65536">65536</option>
            <option value="131072">131072</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-[var(--fg-muted)] mb-1">GPU Layers</label>
          <input type="number" className="input input-lg font-mono" defaultValue="0" min="0" max="99" placeholder="0 = CPU only" />
        </div>
        <div>
          <label className="block text-xs text-[var(--fg-muted)] mb-1">Threads</label>
          <input type="number" className="input input-lg font-mono" defaultValue="0" min="0" max="64" placeholder="0 = Auto" />
        </div>
      </div>
    </div>
  );
}
