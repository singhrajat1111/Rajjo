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

from backend.config import (
    DATA_DIR, load_settings, save_settings,
    get_secret, save_secret, get_masked_secrets_summary, get_provider_config, get_all_providers
)
from backend.model_router import router, ModelRouter
from backend.tools.registry import registry
from backend.memory.episodic import episodic
from backend.memory.semantic import semantic
from backend.memory.reflector import reflector_service
from backend.graph import agent_graph
from langchain_core.messages import HumanMessage, AIMessage

app = FastAPI(title="Rajjo Backend", version="2.0.0")

# Enable CORS for Vite and Electron
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global cancellation token
_abort_flag = False

# ----------------- Request Models -----------------

class ChatRequest(BaseModel):
    message: str
    history: List[Dict[str, Any]] = []
    model_override: Optional[Dict[str, Any]] = None

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
    shell_timeout: Optional[int] = None
    shell_confirm_destructive: Optional[bool] = None
    theme: Optional[str] = None
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

class AgentSpawnRequest(BaseModel):
    role: str
    task: str
    background: bool = True
    delegation: bool = False

# ----------------- Health Endpoint -----------------

@app.api_route("/health", methods=["GET", "HEAD"])
async def health():
    settings = load_settings()
    episodic_tasks = len(episodic.get_recent_tasks(limit=1))
    return {
        "status": "ok",
        "agent": "Rajjo",
        "version": "2.0.0",
        "active_provider": settings.get("active_provider", "universal"),
        "active_model_id": settings.get("active_model_id", "deepseek-chat"),
        "data_dir": str(DATA_DIR),
        "tools_active": len(registry.get_active_tools()),
        "has_memory": episodic_tasks > 0
    }

# ----------------- Chat SSE Stream Endpoint & Abort -----------------

@app.post("/chat/abort")
async def abort_chat():
    global _abort_flag
    _abort_flag = True
    return {"success": True, "status": "aborted"}

async def agent_event_stream(request: ChatRequest):
    """
    Executes LangGraph agent state machine and streams safe high-level activity events
    (status, plan_summary, tool_start, tool_end, reflection, final response, done).
    Supports instant task abortion.
    """
    global _abort_flag
    _abort_flag = False

    settings = load_settings()
    model_cfg = ModelRouter.get_effective_config(request.model_override)

    # Reconstruct conversation history
    messages = []
    for msg in request.history:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "agent" or role == "assistant":
            messages.append(AIMessage(content=content))

    messages.append(HumanMessage(content=request.message))

    initial_state = {
        "messages": messages,
        "plan_summary": "",
        "next_step": "planner",
        "task_status": "in_progress",
        "scratchpad": "",
        "user_input": request.message,
        "model_config": model_cfg,
        "iteration_count": 0,
        "max_iterations": settings.get("max_iterations", 10),
        "activity_log": [],
        "final_output": ""
    }

    yield f"data: {json.dumps({'type': 'status', 'message': 'Rajjo agent initialized...'})}\n\n"
    await asyncio.sleep(0.01)

    last_emitted_idx = 0
    final_content = ""

    try:
        async for event in agent_graph.astream(initial_state, stream_mode="values"):
            if _abort_flag:
                yield f"data: {json.dumps({'type': 'status', 'message': 'Task aborted by user.'})}\n\n"
                yield f"data: {json.dumps({'type': 'final', 'role': 'agent', 'content': '⏹️ *Task execution was stopped by user request.*'})}\n\n"
                yield f"data: {json.dumps({'type': 'done', 'status': 'aborted'})}\n\n"
                return

            # Emit new activity events safely
            activities = event.get("activity_log", [])
            while last_emitted_idx < len(activities):
                act = activities[last_emitted_idx]
                last_emitted_idx += 1
                yield f"data: {json.dumps(act)}\n\n"
                await asyncio.sleep(0.01)

            # Check if there is an AI response in messages
            if event.get("messages"):
                last_msg = event["messages"][-1]
                if isinstance(last_msg, AIMessage) and not getattr(last_msg, "tool_calls", None):
                    final_content = last_msg.content

            await asyncio.sleep(0.01)

        # Emit the final response message
        if not final_content and initial_state.get("final_output"):
            final_content = initial_state["final_output"]

        yield f"data: {json.dumps({'type': 'final', 'role': 'agent', 'content': final_content or 'Task finished.'})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'status': 'completed'})}\n\n"

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

# ----------------- Model Management Endpoints -----------------

@app.get("/models")
async def get_models():
    settings = load_settings()
    ollama_running, ollama_models, ollama_msg = ModelRouter.detect_ollama(settings.get("ollama_base_url", "http://localhost:11434"))
    secrets_summary = get_masked_secrets_summary()
    providers = get_all_providers()

    return {
        "active_provider": settings.get("active_provider", "universal"),
        "active_model_id": settings.get("active_model_id", "deepseek-chat"),
        "custom_base_url": settings.get("custom_base_url", ""),
        "ollama_base_url": settings.get("ollama_base_url", "http://localhost:11434"),
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
            model_id = "claude-3-5-sonnet-20241022"
        elif req.provider == "gemini":
            model_id = "gemini-1.5-pro"
        elif req.provider == "openrouter":
            model_id = "anthropic/claude-3.5-sonnet"
        elif req.provider in ("custom", "universal", "deepseek", "together", "mistral", "xai"):
            model_id = "deepseek-chat"

    if model_id:
        updates["active_model_id"] = model_id
    if req.custom_base_url is not None:
        updates["custom_base_url"] = req.custom_base_url
    if req.ollama_base_url is not None:
        updates["ollama_base_url"] = req.ollama_base_url
    if req.gguf_model_path is not None:
        updates["gguf_model_path"] = req.gguf_model_path
    if req.api_key:
        if req.provider == "openai":
            save_secret("OPENAI_API_KEY", req.api_key)
        elif req.provider == "groq":
            save_secret("GROQ_API_KEY", req.api_key)
        elif req.provider == "anthropic":
            save_secret("ANTHROPIC_API_KEY", req.api_key)
        elif req.provider == "gemini":
            save_secret("GEMINI_API_KEY", req.api_key)
        elif req.provider == "openrouter":
            save_secret("OPENROUTER_API_KEY", req.api_key)
        elif req.provider in ("custom", "universal", "deepseek", "together", "mistral", "xai"):
            save_secret("CUSTOM_API_KEY", req.api_key)

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
    """Fetch models from Ollama Cloud Library"""
    success, models, msg = ModelRouter.fetch_ollama_cloud_models()
    return {"success": success, "models": models, "message": msg}

@app.get("/models/providers")
async def get_providers():
    """Get list of all supported providers with their configurations"""
    from backend.config import PROVIDER_CONFIGS
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

@app.post("/memory/semantic/search")
async def search_semantic_memory(req: MemorySearchRequest):
    results = semantic.query_memory(req.query, n_results=req.limit)
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
        "credentials": masked_secrets
    }

@app.post("/settings")
async def update_settings_endpoint(req: SettingsUpdateRequest):
    updates = {}
    if req.active_provider is not None: updates["active_provider"] = req.active_provider
    if req.active_model_id is not None: updates["active_model_id"] = req.active_model_id
    if req.custom_base_url is not None: updates["custom_base_url"] = req.custom_base_url
    if req.ollama_base_url is not None: updates["ollama_base_url"] = req.ollama_base_url
    if req.gguf_model_path is not None: updates["gguf_model_path"] = req.gguf_model_path
    if req.shell_timeout is not None: updates["shell_timeout"] = req.shell_timeout
    if req.shell_confirm_destructive is not None: updates["shell_confirm_destructive"] = req.shell_confirm_destructive
    if req.theme is not None: updates["theme"] = req.theme

    # Securely store keys without returning raw values
    if req.openai_api_key: save_secret("OPENAI_API_KEY", req.openai_api_key)
    if req.groq_api_key: save_secret("GROQ_API_KEY", req.groq_api_key)
    if req.anthropic_api_key: save_secret("ANTHROPIC_API_KEY", req.anthropic_api_key)
    if req.custom_api_key: save_secret("CUSTOM_API_KEY", req.custom_api_key)
    if req.gemini_api_key: save_secret("GEMINI_API_KEY", req.gemini_api_key)
    if req.openrouter_api_key: save_secret("OPENROUTER_API_KEY", req.openrouter_api_key)

    saved = save_settings(updates)
    return {
        "success": True,
        "settings": saved,
        "credentials": get_masked_secrets_summary()
    }

# ----------------- MCP Server Endpoints -----------------

@app.get("/mcp/servers")
async def list_mcp_servers():
    # For now, return empty list - will be implemented with MCP client
    return {"servers": []}

@app.post("/mcp/servers")
async def add_mcp_server(req: MCPServerRequest):
    # Store MCP server config
    settings = load_settings()
    mcp_servers = settings.get("mcp_servers", [])
    
    # Check if server with this name exists
    existing_idx = next((i for i, s in enumerate(mcp_servers) if s["name"] == req.name), None)
    server_config = {
        "name": req.name,
        "command": req.command,
        "args": req.args,
        "env": req.env,
        "enabled": True
    }
    
    if existing_idx is not None:
        mcp_servers[existing_idx] = server_config
    else:
        mcp_servers.append(server_config)
    
    save_settings({"mcp_servers": mcp_servers})
    return {"success": True, "server": server_config}

@app.delete("/mcp/servers/{name}")
async def remove_mcp_server(name: str):
    settings = load_settings()
    mcp_servers = settings.get("mcp_servers", [])
    mcp_servers = [s for s in mcp_servers if s["name"] != name]
    save_settings({"mcp_servers": mcp_servers})
    return {"success": True, "message": f"MCP server {name} removed"}

@app.post("/mcp/servers/{name}/enable")
async def enable_mcp_server(name: str):
    settings = load_settings()
    mcp_servers = settings.get("mcp_servers", [])
    for s in mcp_servers:
        if s["name"] == name:
            s["enabled"] = True
            break
    save_settings({"mcp_servers": mcp_servers})
    return {"success": True, "name": name, "enabled": True}

@app.post("/mcp/servers/{name}/disable")
async def disable_mcp_server(name: str):
    settings = load_settings()
    mcp_servers = settings.get("mcp_servers", [])
    for s in mcp_servers:
        if s["name"] == name:
            s["enabled"] = False
            break
    save_settings({"mcp_servers": mcp_servers})
    return {"success": True, "name": name, "enabled": False}

# ----------------- Agent Endpoints -----------------

@app.get("/agents")
async def list_agents():
    # For now, return empty - will integrate with agent spawning system
    return {"agents": []}

@app.post("/agents/spawn")
async def spawn_agent(req: AgentSpawnRequest):
    # Spawn a new agent process
    # This would integrate with the delegate_task system or tmux
    return {
        "success": True,
        "agent_id": f"agent-{os.urandom(4).hex()}",
        "role": req.role,
        "task": req.task,
        "status": "spawned"
    }

@app.post("/agents/{agent_id}/stop")
async def stop_agent(agent_id: str):
    return {"success": True, "message": f"Agent {agent_id} stopped"}

@app.post("/agents/{agent_id}/steer")
async def steer_agent(agent_id: str, req: Dict[str, str]):
    return {"success": True, "message": f"Steering message sent to {agent_id}"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)