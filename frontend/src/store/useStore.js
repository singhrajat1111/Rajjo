import { create } from 'zustand';

let currentApiBase = 'http://127.0.0.1:8000';
export const API_BASE = 'http://127.0.0.1:8000';
let cachedApiToken = null;

export async function getApiBase() {
  if (window.electronAPI && typeof window.electronAPI.getApiBase === 'function') {
    try {
      const base = await window.electronAPI.getApiBase();
      if (base) {
        currentApiBase = base;
        return base;
      }
    } catch (e) {
      console.error('Error fetching api base from electron:', e);
    }
  }
  return currentApiBase;
}

export function setApiBase(base) {
  if (base) currentApiBase = base;
}

export function getCachedApiBase() {
  return currentApiBase;
}

export async function getApiToken() {
  if (cachedApiToken) return cachedApiToken;
  try {
    if (window.electronAPI && typeof window.electronAPI.getApiToken === 'function') {
      const token = await window.electronAPI.getApiToken();
      if (token) {
        cachedApiToken = token;
        return token;
      }
    }
  } catch (e) {
    console.error('Error fetching api token from electron:', e);
  }
  cachedApiToken = localStorage.getItem('rajjo_api_token') || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_RAJJO_API_TOKEN) || '';
  return cachedApiToken;
}

export function setApiToken(token) {
  cachedApiToken = token;
  if (token) {
    localStorage.setItem('rajjo_api_token', token);
  } else {
    localStorage.removeItem('rajjo_api_token');
  }
}

export async function authFetch(url, options = {}) {
  const token = await getApiToken();
  const base = await getApiBase();
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-Rajjo-Token', token);
  }

  let finalUrl = url;
  if (url.startsWith('/')) {
    finalUrl = `${base}${url}`;
  } else if (url.startsWith('http://127.0.0.1:8000') || url.startsWith('http://localhost:8000')) {
    finalUrl = url.replace(/^http:\/\/(127\.0\.0\.1|localhost):8000/, base);
  }

  return fetch(finalUrl, { ...options, headers });
}

export const useStore = create((set, get) => ({
  // Navigation
  activeTab: 'chat', // 'chat' | 'models' | 'tools' | 'memory' | 'mcp' | 'agents' | 'settings'
  setActiveTab: (tab) => set({ activeTab: tab }),

  // UI State
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  
  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  
  theme: 'dark', // 'dark' | 'light' | 'system'
  setTheme: (theme) => set({ theme }),

  // Backend Status
  backendOnline: false,
  healthData: null,
  checkHealth: async () => {
    try {
      const res = await authFetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        set({ backendOnline: true, healthData: { ...data, backendOnline: true } });
        return true;
      }
    } catch {
      set((state) => ({
        backendOnline: false,
        healthData: state.healthData ? { ...state.healthData, backendOnline: false } : { backendOnline: false }
      }));
    }
    return false;
  },

  // Chat State
  messages: [],
  input: '',
  isProcessing: false,
  activeActivities: [],
  setInput: (input) => set({ input }),
  setProcessing: (isProcessing) => set({ isProcessing }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  clearMessages: () => set({ messages: [] }),
  setActivities: (activities) => set({ activeActivities: activities }),
  appendActivity: (act) => set((state) => ({ activeActivities: [...state.activeActivities, act] })),

  // Models State
  modelsData: {
    active_provider: 'universal',
    active_model_id: 'deepseek-chat',
    custom_base_url: '',
    ollama_base_url: 'http://localhost:11434',
    ollama: { running: false, models: [] },
    gguf: { model_path: '', info: null },
    credentials: {}
  },
  isLoadingModels: false,
  fetchModels: async () => {
    set({ isLoadingModels: true });
    try {
      const res = await authFetch(`${API_BASE}/models`);
      if (res.ok) {
        const data = await res.json();
        set({ modelsData: data });
      }
    } catch (e) {
      console.error('Error fetching models:', e);
    } finally {
      set({ isLoadingModels: false });
    }
  },
  selectModel: async (payload) => {
    try {
      const res = await authFetch(`${API_BASE}/models/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        await get().fetchModels();
        await get().checkHealth();
        return true;
      }
    } catch (e) {
      console.error('Error selecting model:', e);
    }
    return false;
  },
  testModelConnection: async (payload) => {
    try {
      const res = await authFetch(`${API_BASE}/models/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch (e) {
      return { success: false, message: e.message };
    }
  },
  detectOllama: async (baseUrl = 'http://localhost:11434') => {
    try {
      const res = await authFetch(`${API_BASE}/models/ollama?base_url=${encodeURIComponent(baseUrl)}`);
      if (res.ok) {
        const data = await res.json();
        set((state) => ({
          modelsData: {
            ...state.modelsData,
            ollama: {
              ...state.modelsData.ollama,
              running: data.running,
              models: data.models
            }
          }
        }));
        return data;
      }
    } catch (e) {
      console.error('Error detecting Ollama:', e);
    }
    return { running: false, models: [] };
  },
  validateGGUFPath: async (path) => {
    try {
      const res = await authFetch(`${API_BASE}/models/validate-gguf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      return await res.json();
    } catch (e) {
      return { valid: false, error: e.message };
    }
  },
  setOllamaBaseUrl: async (url) => {
    set((state) => ({
      modelsData: {
        ...state.modelsData,
        ollama_base_url: url
      }
    }));
  },

  // Tools State
  toolsList: [],
  isLoadingTools: false,
  fetchTools: async () => {
    set({ isLoadingTools: true });
    try {
      const res = await authFetch(`${API_BASE}/tools`);
      if (res.ok) {
        const data = await res.json();
        set({ toolsList: data.tools || [] });
      }
    } catch (e) {
      console.error('Error fetching tools:', e);
    } finally {
      set({ isLoadingTools: false });
    }
  },
  toggleTool: async (name, enabled) => {
    try {
      const res = await authFetch(`${API_BASE}/tools/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, enabled })
      });
      if (res.ok) {
        set((state) => ({
          toolsList: state.toolsList.map((t) => (t.name === name ? { ...t, enabled } : t))
        }));
      }
    } catch (e) {
      console.error('Error toggling tool:', e);
    }
  },
  addCustomTool: async (tool) => {
    console.log('Add custom tool:', tool);
  },
  removeCustomTool: async (name) => {
    console.log('Remove custom tool:', name);
  },

  // MCP State
  mcpServers: [],
  isLoadingMCP: false,
  fetchMCPServers: async () => {
    set({ isLoadingMCP: true });
    try {
      const res = await authFetch(`${API_BASE}/mcp/servers`);
      if (res.ok) {
        const data = await res.json();
        set({ mcpServers: data.servers || [] });
      }
    } catch (e) {
      console.error('Error fetching MCP servers:', e);
    } finally {
      set({ isLoadingMCP: false });
    }
  },
  toggleMCPServer: async (name, enabled) => {
    try {
      const res = await authFetch(`${API_BASE}/mcp/servers/${name}/${enabled ? 'enable' : 'disable'}`, {
        method: 'POST'
      });
      if (res.ok) {
        set((state) => ({
          mcpServers: state.mcpServers.map((s) => (s.name === name ? { ...s, status: enabled ? 'connected' : 'disconnected' } : s))
        }));
      }
    } catch (e) {
      console.error('Error toggling MCP server:', e);
    }
  },
  addMCPServer: async (server) => {
    try {
      const res = await authFetch(`${API_BASE}/mcp/servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(server)
      });
      if (res.ok) {
        await get().fetchMCPServers();
        return true;
      }
    } catch (e) {
      console.error('Error adding MCP server:', e);
    }
    return false;
  },
  removeMCPServer: async (name) => {
    try {
      const res = await authFetch(`${API_BASE}/mcp/servers/${name}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        set((state) => ({
          mcpServers: state.mcpServers.filter((s) => s.name !== name)
        }));
        return true;
      }
    } catch (e) {
      console.error('Error removing MCP server:', e);
    }
    return false;
  },

  // Memory State
  episodicTasks: [],
  semanticMemories: [],
  isLoadingMemory: false,
  fetchMemory: async () => {
    set({ isLoadingMemory: true });
    try {
      const [epRes, semRes] = await Promise.all([
        authFetch(`${API_BASE}/memory/episodic`),
        authFetch(`${API_BASE}/memory/semantic`)
      ]);
      if (epRes.ok && semRes.ok) {
        const epData = await epRes.json();
        const semData = await semRes.json();
        set({
          episodicTasks: epData.tasks || [],
          semanticMemories: semData.memories || []
        });
      }
    } catch (e) {
      console.error('Error fetching memory:', e);
    } finally {
      set({ isLoadingMemory: false });
    }
  },
  clearEpisodicMemory: async () => {
    try {
      await authFetch(`${API_BASE}/memory/episodic`, { method: 'DELETE' });
      set({ episodicTasks: [] });
    } catch (e) {
      console.error(e);
    }
  },
  clearSemanticMemory: async () => {
    try {
      await authFetch(`${API_BASE}/memory/semantic`, { method: 'DELETE' });
      set({ semanticMemories: [] });
    } catch (e) {
      console.error(e);
    }
  },
  exportMemory: async () => {
    try {
      const res = await authFetch(`${API_BASE}/memory/export`, { method: 'POST' });
      return await res.json();
    } catch (e) {
      console.error(e);
      return null;
    }
  },
  importMemory: async (data) => {
    try {
      const res = await authFetch(`${API_BASE}/memory/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      await get().fetchMemory();
      return result;
    } catch (e) {
      console.error(e);
      return { success: false };
    }
  },
  searchSemanticMemory: async (query, limit = 5) => {
    try {
      const res = await authFetch(`${API_BASE}/memory/semantic/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit })
      });
      return await res.json();
    } catch (e) {
      console.error(e);
      return { results: [] };
    }
  },

  // Settings State
  settingsData: {
    settings: {},
    credentials: {},
    storage: {}
  },
  fetchSettings: async () => {
    try {
      const res = await authFetch(`${API_BASE}/settings`);
      if (res.ok) {
        const data = await res.json();
        set({ settingsData: data });
        if (data.settings?.theme) {
          set({ theme: data.settings.theme });
        }
      }
    } catch (e) {
      console.error('Error fetching settings:', e);
    }
  },
  updateSettings: async (updates) => {
    try {
      const res = await authFetch(`${API_BASE}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        const data = await res.json();
        set({ settingsData: data });
        await get().checkHealth();
        return true;
      }
    } catch (e) {
      console.error('Error updating settings:', e);
    }
    return false;
  },

  // Agent State
  agents: [],
  isLoadingAgents: false,
  fetchAgents: async () => {
    set({ isLoadingAgents: true });
    try {
      const res = await authFetch(`${API_BASE}/agents`);
      if (res.ok) {
        const data = await res.json();
        set({ agents: data.agents || [] });
      }
    } catch (e) {
      console.error('Error fetching agents:', e);
    } finally {
      set({ isLoadingAgents: false });
    }
  },
  spawnAgent: async (config) => {
    try {
      const res = await authFetch(`${API_BASE}/agents/spawn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (res.ok) {
        await get().fetchAgents();
        return await res.json();
      }
    } catch (e) {
      console.error('Error spawning agent:', e);
    }
    return null;
  },
  stopAgent: async (id) => {
    try {
      const res = await authFetch(`${API_BASE}/agents/${id}/stop`, {
        method: 'POST'
      });
      if (res.ok) {
        await get().fetchAgents();
        return true;
      }
    } catch (e) {
      console.error('Error stopping agent:', e);
    }
    return false;
  },
  steerAgent: async (id, message) => {
    try {
      const res = await authFetch(`${API_BASE}/agents/${id}/steer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      return res.ok;
    } catch (e) {
      console.error('Error steering agent:', e);
    }
    return false;
  },
}));