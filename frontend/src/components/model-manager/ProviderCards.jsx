import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function ProviderCards({ providerOptions, activeProvider, onSelectProvider }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3"
    >
      {providerOptions.map(item => (
        <motion.button
          key={item.id}
          onClick={() => onSelectProvider(item.id)}
          whileHover={{ y: -2, scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className={cn(
            'p-4 rounded-xl border cursor-pointer transition-all duration-200 relative overflow-hidden group',
            'flex flex-col items-start gap-3',
            activeProvider === item.id
              ? 'bg-cyan-500/5 border-cyan-500/30 shadow-[var(--glow-brand)]'
              : `${item.bg} ${item.border} hover:border-cyan-500/30 hover:shadow-md`
          )}
        >
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', item.bg)}>
            <item.icon size={20} className={item.color} />
          </div>
          <div className="flex-1 w-full">
            <div className="font-semibold text-sm text-[var(--fg-primary)]">{item.label}</div>
            <p className="text-[11px] text-[var(--fg-muted)]">{item.desc}</p>
          </div>
          {activeProvider === item.id && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[var(--brand-500)] flex items-center justify-center"
            >
              <CheckCircle2 size={12} className="text-[var(--fg-primary)]" />
            </motion.div>
          )}
        </motion.button>
      ))}
    </motion.div>
  );
}
