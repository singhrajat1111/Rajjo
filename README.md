# Rajjo — Local-First Autonomous AI Desktop Agent

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![Backend](https://img.shields.io/badge/backend-FastAPI%20%2B%20LangGraph-brightgreen)
![Frontend](https://img.shields.io/badge/frontend-React%2018%20%2B%20Vite-61dafb)
![Desktop](https://img.shields.io/badge/desktop-Electron%2030-47848F)
![License](https://img.shields.io/badge/license-MIT-green)
![CI](https://img.shields.io/badge/CI-passing-brightgreen)

**Rajjo** is an open-source, local-first autonomous AI desktop agent designed to plan and execute multi-step tasks directly on your computer with strict security boundaries, human-in-the-loop approval gating, and token-by-token streaming. Built with Electron, React, FastAPI, and LangGraph, Rajjo safely executes shell and filesystem operations, automates web browsing, remembers context across sessions, and operates with local LLMs (Ollama, cached GGUF) or cloud APIs.

---

## 🏗️ Architecture

```text
                         ┌─────────────────────────┐
                         │      RAJJO DESKTOP      │
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
                         │     PYTHON BACKEND      │
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
        Cloud    Ollama   GGUF  FS  Shell Browser  SQLite Threads
       (OpenAI/ (Local   (Local      & CDP Web     Episodic Tasks
        Groq/   Models/  In-Process   Automation   Semantic ChromaDB
      Anthropic/ Catalog) Engine &                 (Deduplicated &
       Gemini/            JSON Fallback)            Approval Gated)
      OpenRouter)
```

---

## ⚡ Verified Capabilities & Architecture

- **Autonomous Multi-Step Execution**: LangGraph agent workflow with explicit planning node (`plan_node`), dynamic memory retrieval, structured tool execution, and reflection.
- **Human-in-the-Loop Approval Gating**: High-risk shell commands (e.g. `rm -rf`, `find -delete`, `Remove-Item`, `shutdown`, `git push --force`), bulk deletions, and credential access automatically trigger an interactive approval gate requiring explicit user confirmation before execution.
- **Strict Workspace Jail**: By default, the agent runs exclusively within an isolated workspace directory (`%APPDATA%/Rajjo/workspace`), completely preventing accidental or autonomous modification of the application source code. The workspace location is fully configurable in Settings.
- **Process Tree Management & Subprocess Abortion**: Abort requests cleanly terminate the entire subprocess tree (`taskkill /F /T` on Windows, process group kill on POSIX), preventing orphaned shell or python processes.
- **Real-Time Token & Event Streaming**: Server-Sent Events (`astream_events` v2) deliver token-by-token live typing animation along with immediate `tool_start` and `tool_end` lifecycle events.
- **Persistent Conversation Threads**: SQLite-backed conversation store (`rajjo.db`) supporting multi-turn threads, conversation history recall, and automatic session resumption.
- **Optimized Local GGUF Engine**:
  - In-process `Llama` engine cached across planner steps (zero RAM re-allocation per iteration).
  - Pure binary header validation inspecting the 4-byte `GGUF` magic without loading gigabytes of weights into memory.
  - Dual tool-calling: native function calling for compatible GGUF chat templates, with structured JSON prompt fallback for models without function calling support.
- **Local-First Semantic Memory**:
  - Deterministic, offline local embeddings (`DeterministicLocalEmbedder`) without unsolicited remote model downloads.
  - Jaccard similarity deduplication to prevent redundant memory accumulation.
  - Approval gating: extracted lessons are vetted before inclusion into the agent's system prompt.
  - Reflector bug fixes: preserves lessons containing words like "nullable" (replacing substring checks with exact regex), filters prompt injection patterns, and discards empty fallbacks.
- **Browser Automation (Playwright & CDP)**:
  - Automated Playwright Chromium installation during setup.
  - Connects to native Google Chrome or Microsoft Edge instances over Chrome DevTools Protocol (`CDP` on `localhost:9222`).
  - Full automation suite: `open_browser_url`, `browser_navigate`, `browser_screenshot`, `browser_click`, `browser_type`, and `browser_scroll` with URL-safe query encoding.
- **Universal Model Router**:
  - Dynamic model discovery fetching current models directly from provider endpoints (OpenAI, Anthropic via `langchain-anthropic`, Groq, Google Gemini, OpenRouter).
  - Curated, structured Ollama catalog served locally without scraping HTML pages or causing browser CORS blocks.
- **MCP Client Framework**: Real stdio JSON-RPC MCP client manager (`mcp_manager.py`) able to connect to standard MCP servers (`filesystem`, `fetch`, `sqlite`, `postgres`, `git`) and dynamically register tools into the agent registry.

---

## 📂 Repository Structure

```text
Rajjo/
├── backend/                  # FastAPI & Python backend
│   ├── memory/               # Episodic SQLite & Semantic vector memory
│   │   ├── episodic.py       # Task history CRUD & search
│   │   ├── semantic.py       # Deduplicated ChromaDB vector store
│   │   ├── threads.py        # SQLite multi-turn conversation persistence
│   │   └── reflector.py      # Automated reflection service & injection filter
│   ├── security/             # Security boundaries and lifecycle
│   │   ├── approval.py       # Human-in-the-Loop approval manager
│   │   └── process_manager.py# Process tree tracking and synchronous kills
│   ├── tools/                # Structured tool implementations
│   │   ├── fs_tools.py       # Workspace-jailed filesystem operations
│   │   ├── shell_tools.py    # Shell runner with approval gating
│   │   ├── web_search.py     # DuckDuckGo live search with URL encoding
│   │   ├── browser_tools.py  # Playwright & CDP browser automation
│   │   ├── mcp_manager.py    # Real stdio MCP client manager
│   │   └── registry.py       # Extensible tool registry & toggles
│   ├── config.py             # Centralized paths, proxy sync, and settings
│   ├── graph.py              # LangGraph autonomous agent workflow
│   ├── main.py               # FastAPI application & SSE event endpoints
│   ├── model_router.py       # Multi-provider model router & cached GGUF
│   ├── requirements.txt      # Pinned Python dependencies
│   ├── rajjo_backend.spec    # PyInstaller packaging specification
│   └── run.py                # Standalone backend server entry point
├── frontend/                 # React UI
│   ├── src/
│   │   ├── components/       # UI components (ChatArea, SettingsPanel, etc.)
│   │   ├── store/
│   │   │   └── useStore.js   # Centralized Zustand client store
│   │   ├── App.jsx           # Main application shell & tab routing
│   │   └── index.css         # Global styles & design system
│   └── package.json          # Frontend dependencies
├── tests/                    # Verification & Benchmarks
│   ├── test_core.py          # 18-point core integration test suite
│   └── eval_20_tasks.py      # 20-task comprehensive evaluation benchmark
├── scripts/                  # Development, setup, and build scripts
│   ├── setup.js              # Automated installer & Playwright browser setup
│   ├── backend_dev.js        # Python backend runner
│   └── build_backend.js      # PyInstaller backend packaging script
├── package.json              # Root npm scripts and Electron configuration
└── README.md                 # Project documentation
```

---

## 🚀 Getting Started

### 1. Prerequisites

- **Node.js**: `v18+` (Recommended: `v20+` or `v22+`)
- **Python**: `3.10+` (Recommended: `3.10` to `3.12`)
- **Git**

---

### 2. Automated Setup

Run the automated setup script from the root project folder:

```bash
# 1. Clone repository
git clone https://github.com/your-username/Rajjo.git
cd Rajjo

# 2. Run automated setup (installs npm dependencies, python venv, and Playwright Chromium)
npm run setup
```

The setup script automatically:
1. Copies `.env.example` to `.env` if not present.
2. Installs root dependencies.
3. Installs frontend dependencies in `frontend/`.
4. Creates a Python virtual environment in `backend/venv` with all pinned dependencies.
5. Runs `playwright install chromium` to ensure browser tools are immediately ready.

---

### 3. Launching Application

Start all services (FastAPI backend, Vite frontend, and Electron shell) with a single command:

```bash
npm run dev
```

You can also run services independently for debugging:

```bash
# Backend only (http://127.0.0.1:8000)
npm run backend:dev

# Frontend only (http://localhost:5173)
npm run frontend:dev

# Electron shell only
npm run electron:dev
```

---

## 🧪 Testing & Evaluation

### Core Test Suite
Run the 18-point core verification suite testing configuration, filesystem jail, shell approval gating, GGUF binary validation, GGUF caching, browser URL encoding, reflector regexes, memory deduplication, SQLite threads, dynamic model discovery, and process management:

```bash
.\backend\venv\Scripts\python.exe tests/test_core.py
```

### 20-Task Evaluation Benchmark
Run the comprehensive 20-task evaluation benchmark:

```bash
.\backend\venv\Scripts\python.exe tests/eval_20_tasks.py
```

Benchmark task categories:
1. Safe workspace file creation
2. Directory listing & structure inspection
3. Safe shell command execution
4. Blocklist enforcement (system root, parent directory traversal)
5. Approval gating interception on destructive commands
6. Process tree termination on task cancellation
7. In-process GGUF engine caching
8. Dual GGUF tool-calling with JSON structured fallback
9. Zero-RAM GGUF header validation
10. Native browser URL-encoding
11. Reflector preservation of words containing "nullable"
12. Prompt injection scrubbing in reflector
13. Deterministic local embedder consistency
14. Vector memory deduplication
15. Semantic memory approval gating
16. SQLite multi-turn thread creation & message recall
17. Dynamic model router provider discovery
18. MCP client tool registration
19. Proxy setting environment propagation
20. Configurable workspace directory validation

---

## ⚙️ Configuration & Environment Variables

All settings can be configured via environment variables in `.env` or interactively through the **Settings** panel in the user interface:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `RAJJO_WORKSPACE_DIR` | Directory where the agent reads/writes files | `%APPDATA%/Rajjo/workspace` |
| `RAJJO_DATA_DIR` | Directory for databases, vector store, and configs | `%APPDATA%/Rajjo` (or `~/.rajjo`) |
| `RAJJO_DEFAULT_PROVIDER` | Default LLM provider (`universal`, `openai`, `groq`, `anthropic`, `gemini`, `openrouter`, `ollama`, `gguf`) | `universal` |
| `RAJJO_DEFAULT_MODEL` | Default model identifier | `deepseek-chat` |
| `RAJJO_MAX_ITERATIONS` | Maximum planner execution steps before termination | `10` |
| `RAJJO_SHELL_TIMEOUT` | Maximum execution timeout (in seconds) for shell commands | `30` |
| `RAJJO_GGUF_MODEL_PATH` | File path to local GGUF model file | `""` |
| `HTTP_PROXY` / `HTTPS_PROXY` | HTTP/HTTPS proxy URL | `""` |
| `NO_PROXY` | Comma-separated hosts exempt from proxy | `localhost,127.0.0.1,.local` |

---

## 🛡️ Security Architecture

1. **Jailed Filesystem Boundary**: All file operations resolve strictly inside the configured workspace (`DATA_DIR/workspace` by default), preventing source code overwrites or parent directory traversal.
2. **Human-in-the-Loop Approval Interceptor**: Destructive commands (`rm -rf`, `find -delete`, `Remove-Item`, `shutdown`, `git push --force`) are intercepted and suspended until explicitly approved via the UI.
3. **Synchronous Process Tree Termination**: When a task is aborted, Rajjo invokes synchronous tree termination (`taskkill /F /T` on Windows, process group kill on POSIX) to kill all child processes.
4. **OS Keyring Integration**: API credentials are saved in the operating system's native secure credential manager (Windows Credential Manager, macOS Keychain, Linux Secret Service).
5. **Session Bearer Authentication**: FastAPI endpoints require a cryptographically secure per-session token verified using constant-time `hmac.compare_digest`.

---

## 📦 Production Packaging

To build the standalone installer:

```bash
# 1. Compile frontend assets
npm run build:frontend

# 2. Package backend binary with PyInstaller (collecting chromadb, onnxruntime, llama_cpp, playwright, keyring)
npm run build:backend

# 3. Package Electron desktop installer
npm run dist
```

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.