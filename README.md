# Rajjo — Local-First Autonomous AI Desktop Agent (Professional Edition)

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![Backend](https://img.shields.io/badge/backend-FastAPI%20%2B%20LangGraph-brightgreen)
![Frontend](https://img.shields.io/badge/frontend-React%2018%20%2B%20Vite%20%2B%20Tailwind-61dafb)
![Desktop](https://img.shields.io/badge/desktop-Electron%2030-47848F)
![License](https://img.shields.io/badge/license-MIT-green)

**Rajjo** is a production-grade, local-first autonomous AI desktop agent designed to execute complex, multi-step tasks directly on your computer. Built with Electron, React, FastAPI, LangGraph, dynamic Model Routing, self-learning episodic and semantic memory, and MCP (Model Context Protocol) server integration, Rajjo plans, executes system tools, learns from past experiences, and provides real-time streaming feedback without exposing raw internal chain-of-thought.

---

## 🏗️ Architecture

```text
                         ┌─────────────────────────┐
                         │     RAJJO DESKTOP       │
                         │   Electron 30+ Shell    │
                         └────────────┬────────────┘
                                      │ Preload IPC & Lifecycle
                                      ▼
                         ┌─────────────────────────┐
                         │      REACT FRONTEND     │
                         │ Vite + Tailwind + Zust. │
                         └────────────┬────────────┘
                                      │
                              HTTP / SSE Stream
                                      │
                                      ▼
                         ┌─────────────────────────┐
                         │    PYTHON BACKEND       │
                         │   FastAPI (Port 8000)   │
                         └────────────┬────────────┘
                                      │
                                      ▼
                         ┌─────────────────────────┐
                         │     LANGGRAPH AGENT     │
                         │   Autonomous Runtime    │
                         └────────────┬────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
               MODEL ROUTER         TOOLS            MEMORY
                    │                 │                 │
          ┌─────────┼───────┐   ┌────┼────┐       ┌────┼────┐
          ▼         ▼       ▼   ▼    ▼    ▼       ▼    ▼    ▼
        Cloud    Ollama   GGUF  FS  Shell Web    Episodic (SQLite)
       (OpenAI/ (Local   (Local Browser Search   Semantic (Vector)
        Groq/   Tags)    File)                  Reflective
      Anthropic/                                  MCP Servers
      Gemini/
      OpenRouter)
```

---

## ⚡ Key Capabilities

- **Autonomous Multi-Step Execution**: LangGraph state machine handles memory retrieval, planning, tool selection, structured execution, evaluation, retries, and reflection.
- **Universal Model Router**: Switch seamlessly at runtime between Cloud providers (OpenAI, Anthropic, Groq, Google Gemini, OpenRouter, DeepSeek, Together AI, Mistral, xAI, Custom endpoints), local Ollama services (with auto-detection), Ollama Cloud model library browsing, and direct local GGUF models on internal or external drives.
- **Universal API Key Accepter**: One API key field works across ALL providers - configure once, use everywhere.
- **Safe & Structured Tools**: Standardized JSON responses for all tools (`read_file`, `write_file`, `create_directory`, `list_dir`, `search_files`, `run_shell_command`, `web_search`, `open_browser_url`, `browser_navigate`, `browser_screenshot`).
- **MCP Server Integration**: Connect to WhatsApp, Telegram, Instagram, Gmail, File Systems, Databases, and 100+ MCP servers for extended automation capabilities.
- **Multi-Agent Orchestration**: Spawn, coordinate, and manage autonomous agent workflows with role-based agents (Coder, Researcher, Reviewer, Designer, Orchestrator).
- **Safety Boundaries**: Destructive command blocking, configurable execution timeouts, path safety validation, and confirmation prompts.
- **Dual Memory Layer**:
  - **Episodic Memory**: Full task histories, plans, tool logs, outcomes, and timestamps stored in local SQLite (`rajjo.db`).
  - **Semantic Memory**: Persistent vector storage (ChromaDB with JSON fallback) for learned facts, preferences, and reusable technical insights.
  - **Reflector Node**: Analyzes completed executions to extract valuable learnings automatically.
- **Real-Time Safe Streaming**: Server-Sent Events (SSE) stream high-level status updates (`status`, `plan_summary`, `tool_start`, `tool_end`, `reflection`, `final`, `done`) without exposing private model deliberations.
- **Visible Window Browser**: Launch real desktop browser windows where you can watch the agent browse, type, and interact in real-time.
- **Command Palette**: ⌘K universal command interface for instant access to all features.
- **Secure Credential Handling**: Secrets are stored in restricted local config, masked in API responses, and never logged or leaked to frontend state.
- **Professional UI/UX**: Sophisticated dark/light theme system, responsive design, smooth animations, keyboard shortcuts, and accessibility support.

---

## 📂 Repository Structure

```text
Rajjo/
├── backend/                  # FastAPI & Python backend
│   ├── memory/               # Episodic SQLite & Semantic vector memory
│   │   ├── episodic.py       # Task history CRUD & search
│   │   ├── semantic.py       # ChromaDB / fallback vector store
│   │   └── reflector.py      # Automated reflection service
│   ├── tools/                # Structured tool implementations
│   │   ├── fs_tools.py       # Filesystem operations
│   │   ├── shell_tools.py    # Shell runner with safety guards
│   │   ├── web_search.py     # DuckDuckGo live search
│   │   ├── browser_tools.py  # Playwright browser automation
│   │   └── registry.py       # Extensible tool registry & toggles
│   ├── config.py             # Centralized paths, secure settings, provider configs
│   ├── graph.py              # LangGraph autonomous agent workflow
│   ├── main.py               # FastAPI application & SSE endpoints
│   ├── model_router.py       # Multi-provider model router & GGUF
│   ├── requirements.txt      # Python dependencies
│   └── run.py                # Standalone backend server entry point
├── electron/                 # Desktop application wrapper
│   ├── main.js               # Main process, Python lifecycle, window IPC
│   └── preload.js            # Secure context isolation bridge
├── frontend/                 # React UI
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   │   ├── ChatArea.jsx      # Main chat interface
│   │   │   ├── Header.jsx        # Top bar with controls
│   │   │   ├── Sidebar.jsx       # Navigation sidebar
│   │   │   ├── ModelManager.jsx  # Model configuration
│   │   │   ├── ToolManager.jsx   # Tool ecosystem
│   │   │   ├── MemoryViewer.jsx  # Memory inspection
│   │   │   ├── SettingsPanel.jsx # Application settings
│   │   │   ├── CommandPalette.jsx # ⌘K command interface
│   │   │   ├── ToastContainer.jsx # Notifications
│   │   │   ├── LiveExecutionViewer.jsx # Visible window
│   │   │   └── MarkdownRenderer.jsx  # Rich markdown
│   │   ├── store/
│   │   │   └── useStore.js   # Centralized Zustand client store
│   │   ├── lib/
│   │   │   └── utils.js      # Utility functions
│   │   ├── design-system.css # Professional design system
│   │   ├── App.jsx           # Main app shell
│   │   ├── index.css         # Global styles
│   │   └── main.jsx          # React DOM mounting
│   ├── package.json          # Frontend dependencies
│   └── vite.config.js        # Vite build configuration
├── scripts/                  # Development, test, and build automation
│   ├── backend_dev.js        # Virtualenv python backend launcher
│   ├── build_backend.js      # PyInstaller backend packaging script
│   ├── run_test.js           # Test suite runner
│   └── test_suite.py         # Complete automated system test suite
├── assets/                   # Application branding and icons
├── package.json              # Root npm scripts and Electron configuration
└── README.md                 # Project documentation
```

---

## 🚀 Quick Start & Development

### 1. Prerequisites
- **Node.js**: `v18+` (Tested on `v24.x`)
- **Python**: `3.10+` (Tested on `3.14.x`)

### 2. Setup Dependencies

```bash
# Clone the repository
git clone https://github.com/your-username/Rajjo.git
cd Rajjo

# Install all dependencies (root, frontend, backend)
npm run install:all

# Or manually:
# Install root & frontend Node dependencies
npm install
cd frontend && npm install && cd ..

# Setup Python virtual environment
cd backend
python -m venv venv
# On Windows:
venv\Scripts\pip install -r requirements.txt
# On Linux/macOS:
source venv/bin/activate && pip install -r requirements.txt
cd ..
```

### 3. Launch Development Environment

Run the unified startup command:

```bash
npm run dev
```

This single command orchestrates:
1. Spawning the FastAPI backend on `http://127.0.0.1:8000`.
2. Awaiting the `/health` endpoint check.
3. Spawning the Vite frontend server on `http://localhost:5173`.
4. Awaiting frontend availability.
5. Launching the Electron desktop window.

### Individual Service Debugging Commands

```bash
# Run only FastAPI backend
npm run backend:dev

# Run only Vite frontend
npm run frontend:dev

# Run only Electron shell
npm run electron:dev
```

---

## 🧪 Running Automated Tests

Run the full system verification suite:

```bash
npm test
```

This tests:
- Configuration and dynamic cross-platform path resolution.
- File system tools (`read_file`, `write_file`, `create_directory`, `list_dir`, `search_files`).
- Shell execution tools with exit codes and destructive command safety filters.
- DuckDuckGo live web search.
- Episodic SQLite logging, retrieval, and search.
- Semantic vector storage, indexing, and similarity query.
- Model Router Ollama detection and GGUF path validation.
- LangGraph agent loop state transitions.
- MCP server configuration persistence.

---

## ⚙️ Configuration & Data Storage

Rajjo stores user data, SQLite databases, vector stores, and logs in a cross-platform directory:
- **Windows**: `%APPDATA%\Rajjo` (e.g. `C:\Users\<user>\AppData\Roaming\Rajjo`)
- **macOS / Linux**: `~/.rajjo`

Configurable environment variables (see `.env.example`):
```env
# Provider defaults
RAJJO_DEFAULT_PROVIDER=universal
RAJJO_DEFAULT_MODEL=deepseek-chat

# Cloud API Keys
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GROQ_API_KEY=
GEMINI_API_KEY=
OPENROUTER_API_KEY=
CUSTOM_API_KEY=

# Local Ollama & GGUF
OLLAMA_BASE_URL=http://localhost:11434
RAJJO_GGUF_MODEL_PATH=C:/Models/llama-3-8b-instruct.Q4_K_M.gguf

# Execution Limits
RAJJO_MAX_ITERATIONS=10
RAJJO_SHELL_TIMEOUT=30

# Network
HTTP_PROXY=
HTTPS_PROXY=
NO_PROXY=localhost,127.0.0.1,.local
```

---

## 📦 Production Packaging

### 1. Build Production Frontend
```bash
npm run build:frontend
```

### 2. Build Production Backend Binary
```bash
npm run build:backend
```
Uses PyInstaller to generate `backend/dist/rajjo_backend.exe`.

### 3. Build Windows Installer (NSIS)
```bash
npm run dist
```
Generates the installable package in the `dist/` directory.

---

## 🛡️ Safety & Security Guidelines

- **No Plaintext Leaks**: Secrets entered through the UI are persisted in secure local configuration, masked on all API queries, and never sent back to the browser.
- **Safety Filters**: System-wide destructive patterns (such as root deletions or disk formatting commands) are intercepted and rejected before execution.
- **Timeouts & Loop Guards**: Every shell invocation has a strict timeout (default: 30s) and LangGraph agent runs enforce a hard iteration cap (default: 10) to prevent runaway execution loops.
- **Local-First**: All data stays on your machine. No telemetry without explicit opt-in.

---

## 🗺️ Roadmap & Future Work

- [x] Phase 1 — Backend Foundation (FastAPI, LangGraph, Model Router, SSE streaming)
- [x] Phase 2 — Core Tools (Filesystem, Shell execution, Web search, Safety filters)
- [x] Phase 3 — Electron Desktop Shell & React UI (Draggable titlebar, window controls, live badges)
- [x] Phase 4 — Model Manager (Cloud, Ollama dynamic scanning, local GGUF validation & inference)
- [x] Phase 5 — Browser Automation (Playwright headless/headed navigation and screenshot capture)
- [x] Phase 6 — Self-Learning Memory System (Episodic SQLite, Semantic Chroma vector store, Reflection)
- [x] Phase 7 — Production Packaging & Build Scripts (Frontend bundle, PyInstaller backend, Electron NSIS config)
- [x] Phase 8 — Professional UI/UX Redesign (Design system, Command palette, Toast notifications, Theme system)
- [x] Phase 9 — Universal Model Router (OpenAI, Anthropic, Groq, Gemini, OpenRouter, DeepSeek, Ollama Cloud)
- [x] Phase 10 — MCP Server Integration Framework (WhatsApp, Telegram, Instagram, Gmail, Filesystem, Databases)
- [x] Phase 11 — Multi-Agent Orchestration (Spawn, coordinate, steer, background agents)
- [ ] Direct Model Context Protocol (MCP) STDIO & Remote Server Connector client.
- [ ] Automated Background Application Updates via GitHub Releases.
- [ ] Voice Input/Output Integration (STT/TTS)
- [ ] Plugin Marketplace for Community Tools

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.