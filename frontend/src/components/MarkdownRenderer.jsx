import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, Terminal, ExternalLink } from 'lucide-react';

const CodeBlock = ({ inline, className, children, ...props }) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const codeContent = String(children).replace(/\n$/, '');

  const handleCopy = () => {
    navigator.clipboard.writeText(codeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (inline) {
    return (
      <code className="px-1.5 py-0.5 mx-0.5 rounded-md bg-blue-950/40 text-blue-300 border border-blue-800/40 font-mono text-[11px]" {...props}>
        {children}
      </code>
    );
  }

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-gray-800 bg-[#0c0d14] shadow-md group">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#12131c] border-b border-gray-800 text-[11px] select-none">
        <div className="flex items-center gap-2 text-gray-400 font-mono font-medium">
          <Terminal size={12} className="text-blue-400" />
          <span className="uppercase text-[10px] tracking-wider text-gray-300 font-semibold">
            {language || 'code'}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors text-[10px]"
          title="Copy code to clipboard"
        >
          {copied ? (
            <>
              <Check size={12} className="text-emerald-400" />
              <span className="text-emerald-400 font-medium">Copied!</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Body */}
      <pre className="p-3.5 overflow-x-auto text-[11.5px] font-mono leading-relaxed text-gray-200 custom-scrollbar">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
};

export default function MarkdownRenderer({ content, className = '' }) {
  if (!content) return null;

  // Clean common LaTeX arrow and symbol artifacts from local models
  const cleanedContent = content
    .replace(/\\\$/g, '$')
    .replace(/\$\\rightarrow\$/g, ' → ')
    .replace(/\\rightarrow/g, ' → ')
    .replace(/\$\\leftarrow\$/g, ' ← ')
    .replace(/\\leftarrow/g, ' ← ')
    .replace(/\$\\Rightarrow\$/g, ' ⇒ ')
    .replace(/\$\\Leftarrow\$/g, ' ⇐ ');

  return (
    <div className={`prose prose-invert max-w-none text-xs leading-relaxed ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: CodeBlock,
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-xl border border-gray-800 bg-gray-950/60 shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-gray-900/90 border-b border-gray-800 text-gray-200 font-semibold">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-gray-800/60 text-gray-300">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-gray-900/40 transition-colors">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-3.5 py-2 text-gray-200 font-semibold text-[11px] uppercase tracking-wider">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3.5 py-2 text-gray-300 text-xs">
              {children}
            </td>
          ),
          h1: ({ children }) => (
            <h1 className="text-base font-bold text-gray-100 mt-4 mb-2 pb-1 border-b border-gray-800 flex items-center gap-2">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm font-bold text-blue-400 mt-3.5 mb-1.5 flex items-center gap-2">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs font-bold text-gray-200 mt-3 mb-1">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-xs font-semibold text-gray-300 mt-2 mb-1">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="my-1.5 text-gray-300 leading-relaxed">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="my-2 ml-4 list-disc space-y-1 text-gray-300 marker:text-blue-500">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 ml-4 list-decimal space-y-1 text-gray-300 marker:text-blue-500">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-gray-300 leading-relaxed">
              {children}
            </li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2.5 pl-3 border-l-2 border-blue-500/60 bg-blue-950/20 py-1 pr-2 rounded-r-lg text-gray-300 italic text-[11.5px]">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline underline-offset-2 inline-flex items-center gap-0.5"
            >
              <span>{children}</span>
              <ExternalLink size={10} className="ml-0.5 opacity-70" />
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-gray-100">
              {children}
            </strong>
          ),
          hr: () => <hr className="my-3 border-gray-800" />
        }}
      >
        {cleanedContent}
      </ReactMarkdown>
    </div>
  );
}
