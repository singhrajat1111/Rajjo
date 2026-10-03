import os
import sys
from pathlib import Path

# Ensure backend and root directory are in sys.path
backend_dir = Path(__file__).resolve().parent
root_dir = backend_dir.parent
for p in [str(backend_dir), str(root_dir)]:
    if p not in sys.path:
        sys.path.insert(0, p)

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import json
import asyncio
import hmac
from datetime import datetime

from backend.config import (
    DATA_DIR, load_settings, save_settings,
    get_secret, save_secret, get_masked_secrets_summary, get_provider_config, get_all_providers,
    get_or_create_session_token, get_workspace_dir, apply_proxy_settings
)
from backend.model_router import router, ModelRouter
from backend.tools.registry import registry
from backend.tools.mcp_manager import mcp_manager
from backend.memory.episodic import episodic
from backend.memory.semantic import semantic
from backend.memory.reflector import reflector_service
from backend.memory.threads import thread_store
from backend.security.approval import approval_manager
from backend.security.process_manager import process_manager
from backend.graph import agent_graph
from langchain_core.messages import HumanMessage, AIMessage

app = FastAPI(title="Rajjo Backend", version="2.0.0")

# Restrict CORS to trusted local origins
ALLOWED_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "null",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_CORS_ORIGINS,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def on_startup():
    apply_proxy_settings()
    # Initialize configured MCP servers in background
    try:
        mcp_manager.initialize_configured_servers()
    except Exception as e:
        print(f"[Rajjo Startup] MCP init notice: {e}")

# Authentication Middleware
@app.middleware("http")
async def authenticate_request(request: Request, call_next):
    if request.method == "OPTIONS" or request.url.path in ("/health", "/health/"):
        return await call_next(request)

    expected_token = get_or_create_session_token()
    auth_header = request.headers.get("Authorization", "")
    token = ""
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    elif "X-Rajjo-Token" in request.headers:
        token = request.headers.get("X-Rajjo-Token", "").strip()

    if not token or not hmac.compare_digest(token, expected_token):
        return JSONResponse(
            status_code=401,
            content={"detail": "Unauthorized: Invalid or missing Rajjo API token."}
        )

    return await call_next(request)

# Global cancellation token and active tasks
_abort_requested = False
_active_chat_tasks: Dict[str, asyncio.Task] = {}

# ----------------- Request Models -----------------

class ChatRequest(BaseModel):
    message: str
    history: List[Dict[str, Any]] = []
    thread_id: Optional[str] = None
    model_override: Optional[Dict[str, Any]] = None

class ApprovalResolutionRequest(BaseModel):
    approval_id: str
    approved: bool

class ThreadCreateRequest(BaseModel):
    title: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class ThreadTitleUpdateRequest(BaseModel):
    title: str

class ModelSelectRequest(BaseModel):
    provider: str
    model_id: Optional[str] = None
    custom_base_url: Optional[str] = None
    ollama_base_url: Optional[str] = None
    gguf_model_path: Optional[str] = None
    api_key: Optional[str] = None

class ToolToggleRequest(BaseModel):
    name: str
    enabled: bool

class MemorySearchRequest(BaseModel):
    query: str
    limit: int = 5

class SettingsUpdateRequest(BaseModel):
    active_provider: Optional[str] = None
    active_model_id: Optional[str] = None
    custom_base_url: Optional[str] = None
    ollama_base_url: Optional[str] = None
    gguf_model_path: Optional[str] = None
    workspace_dir: Optional[str] = None
    data_dir: Optional[str] = None
    shell_timeout: Optional[int] = None
    shell_confirm_destructive: Optional[bool] = None
    auto_save_conversations: Optional[bool] = None
    theme: Optional[str] = None
    http_proxy: Optional[str] = None
    https_proxy: Optional[str] = None
    no_proxy: Optional[str] = None
    openai_api_key: Optional[str] = None
    groq_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    custom_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None
    openrouter_api_key: Optional[str] = None

class MCPServerRequest(BaseModel):
    name: str
    command: str
    args: List[str] = []
    env: Dict[str, str] = {}
    enabled: bool = True

class AgentSpawnRequest(BaseModel):
    role: str
    task: str
    background: bool = True
    delegation: bool = False

# Tracked multi-agent instances
_SPAWNED_AGENTS: Dict[str, Dict[str, Any]] = {}

# ----------------- Health Endpoint -----------------

@app.api_route("/health", methods=["GET", "HEAD"])
async def health():
    settings = load_settings()
    episodic_tasks = len(episodic.get_recent_tasks(limit=1))
    return {
        "status": "ok",
        "backendOnline": True,
        "agent": "Rajjo",
        "version": "2.0.0",
        "active_provider": settings.get("active_provider", "universal"),
        "active_model_id": settings.get("active_model_id", "deepseek-chat"),
        "data_dir": str(DATA_DIR),
        "workspace_dir": str(get_workspace_dir()),
        "tools_active": len(registry.get_active_tools()),
        "has_memory": episodic_tasks > 0,
        "threads_count": len(thread_store.list_threads(limit=100))
    }

# ----------------- Approval & Abort Endpoints -----------------

@app.get("/chat/approvals")
async def list_approvals():
    return {"pending": approval_manager.list_pending()}

@app.post("/chat/approve")
async def resolve_approval(req: ApprovalResolutionRequest):
    ok = approval_manager.resolve_approval(req.approval_id, req.approved)
    return {"success": ok, "approval_id": req.approval_id, "approved": req.approved}

@app.post("/chat/abort")
async def abort_chat():
    global _abort_requested
    _abort_requested = True
    # Kill all running child process trees (e.g. bash, powershell, python, curl)
    process_manager.kill_all()
    # Cancel any active running chat coroutines
    for task_id, t in list(_active_chat_tasks.items()):
        if not t.done():
            t.cancel()
    _active_chat_tasks.clear()
    return {"success": True, "status": "aborted", "processes_killed": True}

# ----------------- Chat SSE Stream Endpoint -----------------

async def agent_event_stream(request: ChatRequest):
    global _abort_requested
    _abort_requested = False

    settings = load_settings()
    model_cfg = ModelRouter.get_effective_config(request.model_override)

    # Reconstruct or load thread
    thread_id = request.thread_id or thread_store.create_thread(title=request.message[:40])

    messages = []
    for msg in request.history:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role in ("agent", "assistant"):
            messages.append(AIMessage(content=content))

    messages.append(HumanMessage(content=request.message))

    initial_state = {
        "messages": messages,
        "plan_steps": [],
        "plan_summary": "",
        "next_step": "retrieve_memory",
        "task_status": "in_progress",
        "scratchpad": "",
        "user_input": request.message,
        "model_config": model_cfg,
        "iteration_count": 0,
        "max_iterations": settings.get("max_iterations", 10),
        "activity_log": [],
        "final_output": ""
    }

    event_queue: asyncio.Queue = asyncio.Queue()

    # Wire approval callback into SSE event queue
    def push_approval_event(ev: Dict[str, Any]):
        event_queue.put_nowait(ev)

    approval_manager.set_event_callback(push_approval_event)

    yield f"data: {json.dumps({'type': 'status', 'message': 'Rajjo agent initialized...', 'thread_id': thread_id})}\n\n"
    await asyncio.sleep(0.01)

    collected_content = ""
    activities_recorded = []

    try:
        # Use real astream_events for token streaming and instant tool events
        async for event in agent_graph.astream_events(initial_state, version="v2"):
            if _abort_requested:
                yield f"data: {json.dumps({'type': 'status', 'message': 'Task aborted by user.'})}\n\n"
                yield f"data: {json.dumps({'type': 'final', 'role': 'agent', 'content': '⏹️ *Task execution was stopped by user request.*'})}\n\n"
                yield f"data: {json.dumps({'type': 'done', 'status': 'aborted'})}\n\n"
                return

            # Drain any pending approval events
            while not event_queue.empty():
                appr_ev = event_queue.get_nowait()
                yield f"data: {json.dumps(appr_ev)}\n\n"

            ev_type = event.get("event")
            data = event.get("data", {})

            # 1. Real-time Token Streaming from LLM
            if ev_type == "on_chat_model_stream":
                chunk = data.get("chunk")
                if chunk and hasattr(chunk, "content") and chunk.content:
                    text_chunk = str(chunk.content)
                    collected_content += text_chunk
                    yield f"data: {json.dumps({'type': 'token', 'content': text_chunk})}\n\n"

            # 2. Instant Tool Start (arrives immediately when tool starts)
            elif ev_type == "on_tool_start":
                tool_name = event.get("name", "tool")
                tool_input = data.get("input", {})
                act = {
                    "type": "tool_start",
                    "tool": tool_name,
                    "args": tool_input,
                    "message": f"Running tool '{tool_name}'..."
                }
                activities_recorded.append(act)
                yield f"data: {json.dumps(act)}\n\n"

            # 3. Tool End
            elif ev_type == "on_tool_end":
                tool_name = event.get("name", "tool")
                tool_out = data.get("output", "")
                is_success = True
                try:
                    if isinstance(tool_out, str) and tool_out.strip().startswith("{"):
                        parsed = json.loads(tool_out)
                        is_success = parsed.get("success", True)
                except Exception:
                    pass
                act = {
                    "type": "tool_end",
                    "tool": tool_name,
                    "success": is_success,
                    "message": f"Completed '{tool_name}'" if is_success else f"Notice in '{tool_name}'"
                }
                activities_recorded.append(act)
                yield f"data: {json.dumps(act)}\n\n"

            # 4. Plan Node or Chain Events
            elif ev_type == "on_chain_end" and event.get("name") == "plan":
                output = data.get("output", {})
                steps = output.get("plan_steps", [])
                if steps:
                    act = {"type": "plan", "steps": steps, "message": "Task plan formulated."}
                    activities_recorded.append(act)
                    yield f"data: {json.dumps(act)}\n\n"

            elif ev_type == "on_chain_end" and event.get("name") == "reflector":
                output = data.get("output", {})
                lesson = output.get("scratchpad")
                if lesson:
                    act = {"type": "reflection", "message": f"Learned: {lesson}"}
                    activities_recorded.append(act)
                    yield f"data: {json.dumps(act)}\n\n"

            await asyncio.sleep(0.005)

        # Fallback for final content if not captured via chunks
        final_msg = collected_content.strip() or "Task completed."
        yield f"data: {json.dumps({'type': 'final', 'role': 'agent', 'content': final_msg, 'thread_id': thread_id})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'status': 'completed'})}\n\n"

        # Persist conversation to thread store if auto_save is enabled
        if settings.get("auto_save_conversations", True):
            try:
                thread_store.add_message(thread_id, "user", request.message)
                thread_store.add_message(thread_id, "agent", final_msg, activities_recorded)
            except Exception as e:
                print(f"[Main] Error auto-saving thread: {e}")

    except Exception as e:
        error_msg = f"Agent runtime error: {str(e)}"
        yield f"data: {json.dumps({'type': 'error', 'message': error_msg})}\n\n"
        yield f"data: {json.dumps({'type': 'final', 'role': 'agent', 'content': f'An error occurred: {str(e)}'})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'status': 'error'})}\n\n"

@app.post("/chat")
async def chat(request: ChatRequest):
    return StreamingResponse(
        agent_event_stream(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

# ----------------- Thread Persistence Endpoints -----------------

@app.get("/threads")
async def list_threads():
    return {"threads": thread_store.list_threads(limit=100)}

@app.post("/threads")
async def create_thread(req: ThreadCreateRequest):
    tid = thread_store.create_thread(title=req.title, metadata=req.metadata)
    return {"success": True, "thread_id": tid}

@app.get("/threads/{thread_id}/messages")
async def get_thread_messages(thread_id: str):
    msgs = thread_store.get_messages(thread_id)
    return {"messages": msgs, "count": len(msgs)}

@app.delete("/threads/{thread_id}")
async def delete_thread(thread_id: str):
    ok = thread_store.delete_thread(thread_id)
    return {"success": ok}

@app.post("/threads/{thread_id}/title")
async def update_thread_title(thread_id: str, req: ThreadTitleUpdateRequest):
    ok = thread_store.update_thread_title(thread_id, req.title)
    return {"success": ok}

# ----------------- Model Management Endpoints -----------------

@app.get("/models")
async def get_models():
    settings = load_settings()
    active_prov = settings.get("active_provider", "universal")
    ollama_running, ollama_models, ollama_msg = ModelRouter.detect_ollama(settings.get("ollama_base_url", "http://localhost:11434"))
    secrets_summary = get_masked_secrets_summary()
    providers = get_all_providers()

    # Dynamic models for active provider
    dynamic_models = ModelRouter.fetch_dynamic_provider_models(active_prov)

    return {
        "active_provider": active_prov,
        "active_model_id": settings.get("active_model_id", "deepseek-chat"),
        "custom_base_url": settings.get("custom_base_url", ""),
        "ollama_base_url": settings.get("ollama_base_url", "http://localhost:11434"),
        "models": dynamic_models,
        "ollama": {
            "running": ollama_running,
            "models": ollama_models,
            "message": ollama_msg,
            "base_url": settings.get("ollama_base_url", "http://localhost:11434")
        },
        "gguf": {
            "model_path": settings.get("gguf_model_path", ""),
            "info": ModelRouter.validate_gguf(settings.get("gguf_model_path", "")) if settings.get("gguf_model_path") else None
        },
        "credentials": secrets_summary,
        "providers": providers
    }

@app.post("/models/select")
async def select_model(req: ModelSelectRequest):
    updates = {"active_provider": req.provider}
    model_id = req.model_id
    if not model_id:
        if req.provider == "ollama":
            settings = load_settings()
            _, installed, _ = ModelRouter.detect_ollama(settings.get("ollama_base_url", "http://localhost:11434"))
            model_id = installed[0] if installed else "llama3.2"
        elif req.provider == "groq":
            model_id = "llama-3.3-70b-versatile"
        elif req.provider == "openai":
            model_id = "gpt-4o"
        elif req.provider == "anthropic":
            model_id = "claude-3-7-sonnet"
        elif req.provider == "gemini":
            model_id = "gemini-2.0-flash"
        elif req.provider == "openrouter":
            model_id = "anthropic/claude-3.7-sonnet"
        else:
            model_id = "deepseek-chat"

    if model_id: updates["active_model_id"] = model_id
    if req.custom_base_url is not None: updates["custom_base_url"] = req.custom_base_url
    if req.ollama_base_url is not None: updates["ollama_base_url"] = req.ollama_base_url
    if req.gguf_model_path is not None: updates["gguf_model_path"] = req.gguf_model_path

    if req.api_key:
        if req.provider == "openai": save_secret("OPENAI_API_KEY", req.api_key)
        elif req.provider == "groq": save_secret("GROQ_API_KEY", req.api_key)
        elif req.provider == "anthropic": save_secret("ANTHROPIC_API_KEY", req.api_key)
        elif req.provider == "gemini": save_secret("GEMINI_API_KEY", req.api_key)
        elif req.provider == "openrouter": save_secret("OPENROUTER_API_KEY", req.api_key)
        else: save_secret("CUSTOM_API_KEY", req.api_key)

    saved = save_settings(updates)
    return {"success": True, "settings": saved}

@app.post("/models/test")
async def test_model(req: Dict[str, Any]):
    success, msg = ModelRouter.test_connection(req)
    return {"success": success, "message": msg}

@app.get("/models/ollama")
async def get_ollama_status():
    settings = load_settings()
    running, models, msg = ModelRouter.detect_ollama(settings.get("ollama_base_url", "http://localhost:11434"))
    return {"running": running, "models": models, "message": msg}

@app.post("/models/validate-gguf")
async def validate_gguf_endpoint(req: Dict[str, str]):
    path_str = req.get("path", "")
    info = ModelRouter.validate_gguf(path_str)
    return info

@app.get("/models/ollama/cloud")
async def get_ollama_cloud_models():
    success, models, msg = ModelRouter.fetch_ollama_cloud_models()
    return {"success": success, "models": models, "message": msg}

@app.get("/models/providers")
async def get_providers():
    return {"providers": PROVIDER_CONFIGS}

# ----------------- Tool Management Endpoints -----------------

@app.get("/tools")
async def list_tools():
    return {"tools": registry.list_tools_metadata()}

@app.post("/tools/toggle")
async def toggle_tool(req: ToolToggleRequest):
    ok = registry.set_enabled(req.name, req.enabled)
    if not ok:
        raise HTTPException(status_code=404, detail="Tool not found")
    return {"success": True, "name": req.name, "enabled": req.enabled}

# ----------------- Memory Endpoints -----------------

@app.get("/memory/episodic")
async def get_episodic_memory(limit: int = 20):
    tasks = episodic.get_recent_tasks(limit=limit)
    return {"tasks": tasks, "count": len(tasks)}

@app.delete("/memory/episodic")
async def clear_episodic_memory():
    episodic.clear_all()
    return {"success": True, "message": "Episodic memory cleared."}

@app.get("/memory/semantic")
async def get_semantic_memory():
    memories = semantic.get_all_memories()
    return {"memories": memories, "count": len(memories)}

@app.post("/memory/semantic/{mem_id}/approve")
async def approve_semantic_memory(mem_id: str):
    ok = semantic.approve_memory(mem_id)
    return {"success": ok, "id": mem_id, "approved": True}

@app.delete("/memory/semantic/{mem_id}")
async def delete_single_semantic_memory(mem_id: str):
    ok = semantic.delete_memory(mem_id)
    return {"success": ok, "id": mem_id}

@app.post("/memory/semantic/search")
async def search_semantic_memory(req: MemorySearchRequest):
    results = semantic.query_memory(req.query, n_results=req.limit, only_approved=False)
    return {"results": results, "count": len(results)}

@app.delete("/memory/semantic")
async def clear_semantic_memory():
    semantic.clear_all()
    return {"success": True, "message": "Semantic memory cleared."}

@app.post("/memory/export")
async def export_memory():
    return {
        "episodic": episodic.export_data(),
        "semantic": semantic.get_all_memories()
    }

@app.post("/memory/import")
async def import_memory(data: Dict[str, Any]):
    e_count = 0
    s_count = 0
    if "episodic" in data:
        e_count = episodic.import_data(data["episodic"])
    if "semantic" in data:
        for s in data["semantic"]:
            doc = s.get("document", "")
            meta = s.get("metadata", {})
            if doc:
                semantic.add_memory(doc, meta)
                s_count += 1
    return {"success": True, "imported_episodic": e_count, "imported_semantic": s_count}

# ----------------- Settings Endpoints -----------------

@app.get("/settings")
async def get_settings_endpoint():
    settings = load_settings()
    masked_secrets = get_masked_secrets_summary()
    return {
        "settings": settings,
        "credentials": masked_secrets,
        "resolved_workspace": str(get_workspace_dir())
    }

@app.post("/settings")
async def update_settings_endpoint(req: SettingsUpdateRequest):
    updates = {}
    if req.active_provider is not None: updates["active_provider"] = req.active_provider
    if req.active_model_id is not None: updates["active_model_id"] = req.active_model_id
    if req.custom_base_url is not None: updates["custom_base_url"] = req.custom_base_url
    if req.ollama_base_url is not None: updates["ollama_base_url"] = req.ollama_base_url
    if req.gguf_model_path is not None: updates["gguf_model_path"] = req.gguf_model_path
    if req.workspace_dir is not None:
        p = Path(req.workspace_dir).resolve()
        p.mkdir(parents=True, exist_ok=True)
        updates["workspace_dir"] = str(p)
    if req.data_dir is not None: updates["data_dir"] = req.data_dir
    if req.shell_timeout is not None: updates["shell_timeout"] = req.shell_timeout
    if req.shell_confirm_destructive is not None: updates["shell_confirm_destructive"] = req.shell_confirm_destructive
    if req.auto_save_conversations is not None: updates["auto_save_conversations"] = req.auto_save_conversations
    if req.theme is not None: updates["theme"] = req.theme
    if req.http_proxy is not None: updates["http_proxy"] = req.http_proxy
    if req.https_proxy is not None: updates["https_proxy"] = req.https_proxy
    if req.no_proxy is not None: updates["no_proxy"] = req.no_proxy

    if req.openai_api_key: save_secret("OPENAI_API_KEY", req.openai_api_key)
    if req.groq_api_key: save_secret("GROQ_API_KEY", req.groq_api_key)
    if req.anthropic_api_key: save_secret("ANTHROPIC_API_KEY", req.anthropic_api_key)
    if req.custom_api_key: save_secret("CUSTOM_API_KEY", req.custom_api_key)
    if req.gemini_api_key: save_secret("GEMINI_API_KEY", req.gemini_api_key)
    if req.openrouter_api_key: save_secret("OPENROUTER_API_KEY", req.openrouter_api_key)

    saved = save_settings(updates)
    apply_proxy_settings(saved)

    return {
        "success": True,
        "settings": saved,
        "credentials": get_masked_secrets_summary(),
        "resolved_workspace": str(get_workspace_dir())
    }

# ----------------- MCP Server Endpoints -----------------

@app.get("/mcp/servers")
async def list_mcp_servers():
    return {"servers": mcp_manager.get_servers()}

@app.post("/mcp/servers")
async def add_mcp_server(req: MCPServerRequest):
    saved_cfg = mcp_manager.add_server(req.dict())
    return {"success": True, "server": saved_cfg}

@app.delete("/mcp/servers/{name}")
async def remove_mcp_server(name: str):
    mcp_manager.remove_server(name)
    return {"success": True, "message": f"MCP server '{name}' removed"}

@app.post("/mcp/servers/{name}/enable")
async def enable_mcp_server(name: str):
    mcp_manager.toggle_server(name, True)
    return {"success": True, "name": name, "enabled": True}

@app.post("/mcp/servers/{name}/disable")
async def disable_mcp_server(name: str):
    mcp_manager.toggle_server(name, False)
    return {"success": True, "name": name, "enabled": False}

# ----------------- Agent Multi-Agent Endpoints -----------------

@app.get("/agents")
async def list_agents():
    return {"agents": list(_SPAWNED_AGENTS.values())}

@app.post("/agents/spawn")
async def spawn_agent(req: AgentSpawnRequest):
    agent_id = f"agent-{os.urandom(4).hex()}"
    thread_id = thread_store.create_thread(title=f"Agent [{req.role}]: {req.task[:30]}")
    info = {
        "id": agent_id,
        "role": req.role,
        "task": req.task,
        "status": "running",
        "thread_id": thread_id,
        "created_at": datetime.now().isoformat()
    }
    _SPAWNED_AGENTS[agent_id] = info
    return {"success": True, "agent_id": agent_id, "role": req.role, "task": req.task, "status": "running", "thread_id": thread_id}

@app.post("/agents/{agent_id}/stop")
async def stop_agent(agent_id: str):
    if agent_id in _SPAWNED_AGENTS:
        _SPAWNED_AGENTS[agent_id]["status"] = "stopped"
        return {"success": True, "message": f"Agent {agent_id} stopped"}
    return {"success": False, "message": f"Agent {agent_id} not found"}

@app.post("/agents/{agent_id}/steer")
async def steer_agent(agent_id: str, req: Dict[str, str]):
    if agent_id in _SPAWNED_AGENTS:
        msg = req.get("message", "")
        _SPAWNED_AGENTS[agent_id]["last_steer"] = msg
        return {"success": True, "message": f"Steering message applied to {agent_id}"}
    return {"success": False, "message": f"Agent {agent_id} not found"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)