import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  const isDev = command === 'serve';
  // In development, allow 'unsafe-inline' so Vite's @react-refresh preamble script functions.
  // In production builds, enforce strict CSP with no 'unsafe-inline' on script-src.
  const cspMeta = isDev
    ? `<meta http-equiv="Content-Security-Policy" content="default-src 'self' http://127.0.0.1:* http://localhost:*; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: http://127.0.0.1:* http://localhost:*; connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*;" />`
    : `<meta http-equiv="Content-Security-Policy" content="default-src 'self' http://127.0.0.1:* http://localhost:*; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: http://127.0.0.1:* http://localhost:*; connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*;" />`;

  return {
    base: './',
    plugins: [
      react(),
      {
        name: 'html-csp-transform',
        transformIndexHtml(html) {
          return html.replace('<!-- CSP_META_PLACEHOLDER -->', cspMeta);
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      host: 'localhost',
      strictPort: false,
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'framer-motion', 'lucide-react'],
            store: ['zustand'],
            utils: ['clsx', 'tailwind-merge'],
          },
        },
      },
    },
  };
})