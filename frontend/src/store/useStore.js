import { create } from 'zustand';

const API_BASE = 'http://127.0.0.1:8000';

export const useStore = create((set, get) => ({
  // Navigation
  activeTab: 'chat', // 'chat' | 'models' | 'tools' | 'memory' | 'settings'
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Backend Status
  backendOnline: false,
  healthData: null,
  checkHealth: async () => {
    try {
      const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        set({ backendOnline: true, healthData: data });
        return true;
      }
    } catch {
      set({ backendOnline: false });
    }
    return false;
  },

  // Chat State
  messages: [],
  input: '',
  isProcessing: false,
  activeActivities: [], // current streaming status/tool badges
  setInput: (input) => set({ input }),
  setProcessing: (isProcessing) => set({ isProcessing }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  clearMessages: () => set({ messages: [] }),
  setActivities: (activities) => set({ activeActivities: activities }),
  appendActivity: (act) => set((state) => ({ activeActivities: [...state.activeActivities, act] })),

  // Models State
  modelsData: {
    active_provider: 'openai',
    active_model_id: 'gpt-4o',
    custom_base_url: '',
    ollama: { running: false, models: [] },
    gguf: { model_path: '', info: null },
    credentials: {}
  },
  isLoadingModels: false,
  fetchModels: async () => {
    set({ isLoadingModels: true });
    try {
      const res = await fetch(`${API_BASE}/models`);
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
      const res = await fetch(`${API_BASE}/models/select`, {
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
      const res = await fetch(`${API_BASE}/models/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch (e) {
      return { success: false, message: e.message };
    }
  },
  detectOllama: async () => {
    try {
      const res = await fetch(`${API_BASE}/models/ollama`);
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
      const res = await fetch(`${API_BASE}/models/validate-gguf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      return await res.json();
    } catch (e) {
      return { valid: false, error: e.message };
    }
  },

  // Tools State
  toolsList: [],
  isLoadingTools: false,
  fetchTools: async () => {
    set({ isLoadingTools: true });
    try {
      const res = await fetch(`${API_BASE}/tools`);
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
      const res = await fetch(`${API_BASE}/tools/toggle`, {
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

  // Memory State
  episodicTasks: [],
  semanticMemories: [],
  isLoadingMemory: false,
  fetchMemory: async () => {
    set({ isLoadingMemory: true });
    try {
      const [epRes, semRes] = await Promise.all([
        fetch(`${API_BASE}/memory/episodic`),
        fetch(`${API_BASE}/memory/semantic`)
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
      await fetch(`${API_BASE}/memory/episodic`, { method: 'DELETE' });
      set({ episodicTasks: [] });
    } catch (e) {
      console.error(e);
    }
  },
  clearSemanticMemory: async () => {
    try {
      await fetch(`${API_BASE}/memory/semantic`, { method: 'DELETE' });
      set({ semanticMemories: [] });
    } catch (e) {
      console.error(e);
    }
  },
  exportMemory: async () => {
    try {
      const res = await fetch(`${API_BASE}/memory/export`, { method: 'POST' });
      return await res.json();
    } catch (e) {
      console.error(e);
      return null;
    }
  },
  importMemory: async (data) => {
    try {
      const res = await fetch(`${API_BASE}/memory/import`, {
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

  // Settings State
  settingsData: {
    settings: {},
    credentials: {}
  },
  fetchSettings: async () => {
    try {
      const res = await fetch(`${API_BASE}/settings`);
      if (res.ok) {
        const data = await res.json();
        set({ settingsData: data });
      }
    } catch (e) {
      console.error('Error fetching settings:', e);
    }
  },
  updateSettings: async (updates) => {
    try {
      const res = await fetch(`${API_BASE}/settings`, {
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
  }
}));
