# Rajjo — Local-First Autonomous AI Desktop Agent (Professional Edition)

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![Backend](https://img.shields.io/badge/backend-FastAPI%20%2B%20LangGraph-brightgreen)
![Frontend](https://img.shields.io/badge/frontend-React%2018%20%2B%20Vite%20%2B%20Tailwind-61dafb)
![Desktop](https://img.shields.io/badge/desktop-Electron%2030-47848F)
![License](https://img.shields.io/badge/license-MIT-green)
![CI](https://img.shields.io/badge/CI-passing-brightgreen)

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

## 🚀 Getting Started (From Fresh Clone)

If you just cloned this repository and are wondering how to get everything up and running, follow these simple steps.

### 1. Prerequisites

Make sure you have the following installed on your machine:
- **Node.js**: `v18+` (Recommended: `v20+` or `v22+`) — check with `node -v` and `npm -v`
- **Python**: `3.10+` (Recommended: `3.10` to `3.14`) — check with `python --version` (or `python3 --version`)
- **Git**: check with `git --version`

---

### 2. Setup & Installation

You have two choices: **One-Command Automated Setup (Recommended)** or **Manual Step-by-Step**.

#### Option A: One-Command Automated Setup (Recommended)

Run the automated setup script from the root project folder:

```bash
# 1. Clone repository
git clone https://github.com/your-username/Rajjo.git
cd Rajjo

# 2. Run automated setup
npm run setup
```

> **What `npm run setup` does automatically for you:**
> 1. Copies `.env.example` to `.env` if `.env` does not exist.
> 2. Installs root dependencies (`concurrently`, `electron`, `wait-on`, etc.).
> 3. Installs React/Vite dependencies inside `frontend/`.
> 4. Creates a dedicated Python virtual environment in `backend/venv`.
> 5. Installs all required Python packages (FastAPI, LangGraph, llama-cpp-python, ChromaDB, etc.) directly into `backend/venv`.

---

#### Option B: Manual Step-by-Step Setup

If you prefer doing each step manually:

##### Step 1: Install Root & Frontend Dependencies
```bash
# Install root tools (Electron, concurrently, wait-on)
npm install

# Install React frontend packages
cd frontend
npm install
cd ..
```

##### Step 2: Create Python Virtual Environment & Install Backend Packages
**On Windows (PowerShell / Command Prompt):**
```powershell
# Create venv inside backend/
cd backend
python -m venv venv

# Upgrade pip and install all required libraries
.\venv\Scripts\python.exe -m pip install --upgrade pip
.\venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..
```

**On Linux / macOS:**
```bash
# Create venv inside backend/
cd backend
python3 -m venv venv

# Upgrade pip and install all required libraries
./venv/bin/python -m pip install --upgrade pip
./venv/bin/python -m pip install -r requirements.txt
cd ..
```

##### Step 3: Configure Environment Variables
```bash
cp .env.example .env
```
*(Optional: Open `.env` to add API keys such as `OPENAI_API_KEY`, `GROQ_API_KEY`, or local Ollama configurations).*

---

### 3. Launch Application with `npm run dev`

To start the complete application at once, run:

```bash
npm run dev
```

#### What `npm run dev` does:
`npm run dev` uses `concurrently` and `wait-on` to orchestrate all services together:
1. **Spawns Python Backend**: Runs the FastAPI server on `http://127.0.0.1:8000`.
2. **Spawns Frontend Server**: Starts the Vite React development server on `http://localhost:5173`.
3. **Waits for Health Checks**: Monitors both `http://127.0.0.1:8000/health` and `http://localhost:5173`.
4. **Launches Electron Shell**: Opens the desktop app as soon as both backend and frontend are ready.
5. **Unified Process Lifecycle**: Pressing `Ctrl + C` or closing the Electron window automatically terminates all 3 background services cleanly.

---

### 4. Running Services Individually (Optional / Debugging)

If you ever need to debug a single component independently:

```bash
# Start only the FastAPI backend server (port 8000)
npm run backend:dev

# Start only the Vite React development server (port 5173)
npm run frontend:dev

# Start only the Electron shell (requires backend & frontend to already be running)
npm run electron:dev
```

---

### 5. Troubleshooting Common Issues

- **`ModuleNotFoundError: No module named 'fastapi'`**:
  - **Reason**: The Python virtual environment in `backend/venv` is missing dependencies or packages were installed to global Python instead of the virtualenv.
  - **Fix**: Run `npm run setup` or execute `.\backend\venv\Scripts\python.exe -m pip install -r backend\requirements.txt` from the project root.

- **`ERR_CONNECTION_REFUSED on http://localhost:5173`**:
  - **Reason**: Electron was launched on its own (`npx electron .`) while the frontend Vite server was not running.
  - **Fix**: Always use `npm run dev` to launch backend, frontend, and Electron simultaneously.

- **PowerShell Execution Policy Error (`cannot be loaded because running scripts is disabled`)**:
  - **Fix**: Run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in your PowerShell window before activating the venv.

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

## 📦 Production Packaging & Standalone Desktop Installer

Rajjo is packaged as a **zero-dependency, single-file Windows installer** (`Rajjo-Setup-2.0.0.exe`). End-users do not need to install Git, Python, Node.js, npm, or configure virtual environments.

### 🌟 End-User Experience
1. Download `Rajjo-Setup-2.0.0.exe`.
2. Run the NSIS setup wizard (installs to `%LOCALAPPDATA%\Programs\Rajjo` with Desktop & Start Menu shortcuts).
3. Launch **Rajjo** from the Start Menu or Desktop.
4. Electron automatically launches the bundled, self-contained AI backend binary (`rajjo_backend.exe`), dynamically allocates a free port (probing 8000–8050), verifies the `/health` endpoint, and connects the user interface.
5. Closing Rajjo automatically terminates the backend process tree via synchronous process management, guaranteeing zero orphaned processes.

### 📁 Production Runtime Layout (`%APPDATA%\Rajjo`)
All mutable application state, databases, logs, and user files are isolated to `%APPDATA%\Rajjo`:
- `workspace/`: Default workspace for autonomous file and coding tasks.
- `rajjo.db`: SQLite database for episodic task memory and chat sessions.
- `vectorstore/`: Semantic vector store for long-term knowledge and learned facts.
- `logs/`: Production logs (`rajjo_backend.log`, `rajjo_electron.log`).
- `config.json` & OS Keyring: Encrypted credentials and application settings.

### 🛠️ Developer Build Instructions

#### Complete Installer Build (All-In-One)
```bash
npm run dist
```
This single command:
1. Compiles the React + Vite frontend into optimized static production chunks (`npm run build:frontend`).
2. Packages the Python FastAPI + LangGraph backend into a standalone native binary (`rajjo_backend.exe`) using PyInstaller (`npm run build:backend`).
3. Uses `electron-builder` to bundle the Electron shell, frontend assets, and backend executable into an NSIS Windows installer: `dist/Rajjo-Setup-2.0.0.exe` (~183 MB).

#### Individual Component Builds
```bash
# Build React frontend only:
npm run build:frontend

# Build standalone Python backend binary only:
npm run build:backend

# Test the packaged app without creating an installer:
npx electron-builder --dir
```

---

## 🛡️ Security Architecture & Threat Model

Rajjo treats agent safety and security as primary architectural requirements rather than afterthoughts. Because local desktop agents execute system actions and manage sensitive credentials, Rajjo implements multi-layer defense-in-depth:

### 1. OS Keyring & Credential Lifecycle
- **Zero Plaintext Storage**: API keys and secrets are stored in the operating system's secure credential vault (Windows Credential Manager, macOS Keychain, Linux Secret Service / Keyutils) via the Python `keyring` library.
- **Automated Migration & Secure Erasure**: On startup, Rajjo automatically detects any legacy plaintext `secrets.json`, migrates credentials into OS Keyring, overwrites the file on disk, and unlinks it.
- **Frontend Masking**: All secrets queried by the UI are masked (`••••••••`), and raw keys are never returned in state payloads or logs.

### 2. DNS-Rebinding & Localhost Attack Defense
- **Session Bearer Authentication**: Every FastAPI endpoint requires an authorization Bearer token initialized in an isolated per-session file with restricted filesystem permissions (`0o600`).
- **Timing-Safe Comparison**: Authentications use constant-time `hmac.compare_digest` to prevent side-channel timing attacks and eliminate drive-by browser scripts or DNS-rebinding attacks targeting `127.0.0.1:8000`.

### 3. Electron Boundary Isolation
- Electron renderer processes are strictly isolated from Node.js internals:
  - `nodeIntegration: false`
  - `contextIsolation: true`
  - `sandbox: true`
- All renderer-to-main communication occurs through explicit, validated IPC channels defined in `electron/preload.js`.

### 4. Jailed Filesystem Boundary
- All filesystem operations are strictly resolved through `safe_resolve_path()`.
- Uses `Path.resolve()` and `Path.is_relative_to(workspace_root)` to prevent path traversal attempts (`../../`), symlink redirection, and access outside the chosen workspace.
- Enforces an immutable blocklist barring access to sensitive files and directories: `.env`, `.git`, `.ssh`, `.aws`, `.gnupg`, `.session_token`, and system root directories (`/etc`, `C:\Windows`).

### 5. Subprocess Environment Sanitization
- Child processes spawned by the shell execution tool run in a sanitized environment.
- Any environment variable matching known keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `AWS_*`, `GITHUB_TOKEN`, `RAJJO_*`) is scrubbed prior to command invocation to prevent exfiltration through shell commands or accidental environment printing.

### 6. Shell Heuristic Filters & Sandbox Roadmap
- **Defense-in-Depth Heuristics**: `analyze_command_risk()` intercepts and blocks high-risk command patterns:
  - Bulk recursive deletions targeting system root or parent paths (`rm -rf /`, `rmdir /s /q C:\`, `Remove-Item -Recurse`)
  - Disk and partition tampering (`format`, `diskpart`, `mkfs`, `dd`)
  - Remote code downloads piped into interpreters (`curl ... | bash`, `iwr ... | iex`)
  - Inline interpreter destructive scripts (`python -c "import shutil; shutil.rmtree(...)"`, `node -e`)
  - Multi-stage download and immediate execution chains
  - Fork bombs, reverse shells, and privilege escalation (`sudo`, `runas`)
- **Known Limitations & Sandbox Roadmap**: As with any regex-based heuristic filter, blocklists cannot guarantee complete isolation against all novel code execution vectors. In high-security production deployments with fully unconstrained autonomous agents, Rajjo's roadmap includes containerized execution sandboxes (Docker / gVisor lightweight microVMs).

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