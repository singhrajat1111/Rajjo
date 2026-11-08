import json
import time
import re
from typing import Annotated, TypedDict, List, Dict, Any, Optional, Set
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, ToolMessage, SystemMessage

try:
    from backend.model_router import router
    from backend.config import load_settings
    from backend.tools.registry import registry
    from backend.memory.episodic import episodic
    from backend.memory.semantic import semantic
    from backend.memory.reflector import reflector_service
    from backend.security.approval import approval_manager
except ImportError:
    from model_router import router
    from config import load_settings
    from tools.registry import registry
    from memory.episodic import episodic
    from memory.semantic import semantic
    from memory.reflector import reflector_service
    from security.approval import approval_manager

# 1. State Definition
class AgentState(TypedDict, total=False):
    messages: Annotated[List[BaseMessage], add_messages]
    plan_steps: List[Dict[str, Any]]
    plan_summary: str
    next_step: str
    task_status: str
    scratchpad: str
    user_input: str
    model_config: Dict[str, Any]
    iteration_count: int
    max_iterations: int
    activity_log: List[Dict[str, Any]]
    final_output: str
    thread_id: Optional[str]
    has_untrusted_content: Optional[bool]
    role_prompt: Optional[str]
    role_tools: Optional[List[str]]

# Track files written from web/MCP/untrusted content so reading them propagates taint
import os
from pathlib import Path

def _normalize_path(p_str: str) -> str:
    try:
        from backend.config import get_workspace_dir
        ws = get_workspace_dir().resolve()
    except Exception:
        ws = Path.cwd().resolve()
    p = Path(p_str)
    resolved = p.resolve() if p.is_absolute() else (ws / p).resolve()
    return os.path.normcase(str(resolved))

def _get_tainted_files_store() -> Path:
    try:
        from backend.config import DATA_DIR
        return DATA_DIR / ".untrusted_files.json"
    except Exception:
        return Path(".untrusted_files.json")

def _load_untrusted_files() -> Set[str]:
    store = _get_tainted_files_store()
    if store.exists():
        try:
            with open(store, "r", encoding="utf-8") as f:
                data = json.load(f)
                return set(data) if isinstance(data, list) else set()
        except Exception:
            pass
    return set()

def _save_untrusted_files(files: Set[str]):
    store = _get_tainted_files_store()
    try:
        with open(store, "w", encoding="utf-8") as f:
            json.dump(list(files), f)
    except Exception:
        pass

_UNTRUSTED_WRITTEN_FILES: Set[str] = _load_untrusted_files()

def mark_file_untrusted(path_str: str):
    norm = _normalize_path(path_str)
    _UNTRUSTED_WRITTEN_FILES.add(norm)
    _save_untrusted_files(_UNTRUSTED_WRITTEN_FILES)

# 2. Nodes Implementation

def retrieve_memory_node(state: AgentState) -> Dict[str, Any]:
    """
    Retrieves both semantic memories (approved only) AND past episodic task history.
    Solves the flaw where the agent never read episodic memory.
    """
    user_input = state.get("user_input", "")
    activity = list(state.get("activity_log", []))
    activity.append({"type": "status", "message": "Querying approved memory and past episodic experiences..."})

    # 1. Search approved semantic memory
    memories = semantic.query_memory(user_input, n_results=3, only_approved=True)
    memory_bullets = [f"- {m}" for m in memories]

    # 2. Search episodic task memory (past executions & outcomes)
    past_tasks = episodic.search_tasks(user_input, limit=2)
    episodic_bullets = []
    for t in past_tasks:
        desc = t.get("user_input", "")[:80]
        outcome = t.get("outcome", "")[:100]
        episodic_bullets.append(f"- Past Task '{desc}': Outcome -> {outcome}")

    context_parts = []
    if memory_bullets:
        context_parts.append("[Approved Learned Guidelines & Preferences]:\n" + "\n".join(memory_bullets))
    if episodic_bullets:
        context_parts.append("[Relevant Past Episodic Experience]:\n" + "\n".join(episodic_bullets))

    memory_context = "\n\n".join(context_parts)

    return {
        "scratchpad": memory_context,
        "activity_log": activity,
        "iteration_count": state.get("iteration_count", 0),
        "plan_steps": []
    }

def is_untrusted_source_tool(tool_name: str, tool_args: Dict[str, Any]) -> bool:
    """
    Identifies tools that ingest external, unverified content into the agent context:
    - Web searches and HTTP scrapers
    - Browser automation (DOM inspection, navigation, typing, clicks, screenshots)
    - All external MCP server tools (mcp_*)
    - File reads targeting paths outside the protected workspace
    - File reads targeting files previously written from untrusted/external context
    """
    name = tool_name.lower()
    if (
        name.startswith("browser_")
        or name.startswith("web_")
        or name.startswith("mcp_")
        or name.startswith("fetch_")
        or name.startswith("scrape_")
        or name.startswith("http_")
        or name in ("open_browser_url", "open_visible_browser")
    ):
        return True

    if name == "read_file":
        path_str = str(tool_args.get("path", "")).strip()
        if path_str:
            try:
                from backend.config import get_workspace_dir
                ws = get_workspace_dir().resolve()
                norm = _normalize_path(path_str)
                # 1. Tainted files: files written from web/MCP/untrusted context
                if (
                    norm in _UNTRUSTED_WRITTEN_FILES
                    or any(os.path.normcase(f) == norm for f in _UNTRUSTED_WRITTEN_FILES)
                ):
                    return True
                # 2. Designated untrusted folders inside workspace
                p = Path(norm)
                for part in p.parts:
                    if part.lower() in ("downloads", "download", "external", "inbox", "scraped"):
                        return True
                # 3. Outside workspace jail
                try:
                    p.relative_to(ws)
                except ValueError:
                    return True
            except Exception:
                return True

    return False

def plan_node(state: AgentState) -> Dict[str, Any]:
    """
    Initial Plan Node: dynamically formulates contextual execution steps based on user intent.
    """
    user_input = state.get("user_input", "").strip()
    activity = list(state.get("activity_log", []))
    lower = user_input.lower()

    if re.search(r"\b(search|find online|lookup|who is|what is|news|browse|fetch)\b", lower):
        steps = [
            {"id": 1, "description": "Formulate targeted queries and retrieve external web/knowledge sources", "status": "in_progress"},
            {"id": 2, "description": "Extract, cross-verify, and filter relevant data", "status": "pending"},
            {"id": 3, "description": "Synthesize verified findings into structured response", "status": "pending"}
        ]
    elif re.search(r"\b(file|write|create|delete|edit|code|script|read|refactor)\b", lower):
        steps = [
            {"id": 1, "description": "Inspect filesystem context and verify target paths", "status": "in_progress"},
            {"id": 2, "description": "Perform scoped file operations and code generation", "status": "pending"},
            {"id": 3, "description": "Verify file state and summarize changes", "status": "pending"}
        ]
    elif re.search(r"\b(bash|command|shell|powershell|build|npm|pip|cargo|compile)\b", lower) or re.search(r"\brun\s+(command|script|test|build|shell)\b", lower):
        steps = [
            {"id": 1, "description": "Analyze command parameters and sandbox safety boundaries", "status": "in_progress"},
            {"id": 2, "description": "Execute monitored command with process tree tracking", "status": "pending"},
            {"id": 3, "description": "Evaluate stdout/stderr exit codes and report execution outcome", "status": "pending"}
        ]
    else:
        task_preview = user_input[:50] if user_input else "user task"
        steps = [
            {"id": 1, "description": f"Analyze intent & dependencies for '{task_preview}'", "status": "in_progress"},
            {"id": 2, "description": "Execute necessary tool actions and intermediate steps", "status": "pending"},
            {"id": 3, "description": "Consolidate results and deliver comprehensive response", "status": "pending"}
        ]

    activity.append({
        "type": "plan",
        "steps": steps,
        "message": "Heuristic task execution plan formulated."
    })

    return {
        "plan_steps": steps,
        "activity_log": activity
    }

def trim_history_safely(messages: list, max_recent: int = 24) -> list:
    """
    Trim conversation history keeping the initial message and a bounded tail,
    ensuring ToolMessages are never orphaned from their parent AIMessage.
    """
    if len(messages) <= max_recent + 1:
        return list(messages)

    initial_msg = messages[0]
    start_idx = len(messages) - max_recent

    # Step backward so we don't slice in the middle of a tool call / response turn
    while start_idx > 1 and (
        isinstance(messages[start_idx], ToolMessage) or
        getattr(messages[start_idx], "type", "") == "tool"
    ):
        start_idx -= 1

    # If start_idx is still a ToolMessage (edge case where parent AIMessage was lost),
    # step forward to next non-tool message
    while start_idx < len(messages) and (
        isinstance(messages[start_idx], ToolMessage) or
        getattr(messages[start_idx], "type", "") == "tool"
    ):
        start_idx += 1

    return [initial_msg] + list(messages[start_idx:])

def planner_node(state: AgentState) -> Dict[str, Any]:
    """Decide next action, bind tools, and generate response or tool calls."""
    iteration = state.get("iteration_count", 0) + 1
    max_iter = state.get("max_iterations", 10)
    activity = list(state.get("activity_log", []))

    if iteration > max_iter:
        msg = f"Task stopped: reached maximum allowed execution limit ({max_iter} iterations)."
        activity.append({"type": "status", "message": msg})
        return {
            "messages": [AIMessage(content=msg)],
            "next_step": "reflect",
            "task_status": "max_iterations_reached",
            "final_output": msg,
            "iteration_count": iteration,
            "activity_log": activity
        }

    activity.append({"type": "status", "message": "Analyzing task and planning next step..."})

    # Get active tools (scoped by role_tools if subagent has a restricted tool suite)
    active_tools = registry.get_active_tools()
    role_tools_filter = state.get("role_tools")
    if role_tools_filter:
        active_tools = [t for t in active_tools if getattr(t, "name", "") in role_tools_filter]

    model_cfg = state.get("model_config", {})

    try:
        llm = router.get_llm(model_cfg)
        if hasattr(llm, "bind_tools") and active_tools:
            llm_bound = llm.bind_tools(active_tools)
        else:
            llm_bound = llm
    except Exception as e:
        error_msg = f"Failed to initialize model '{model_cfg.get('provider', 'default')}': {str(e)}"
        activity.append({"type": "error", "message": error_msg})
        return {
            "messages": [AIMessage(content=f"Error: {error_msg}")],
            "next_step": "reflect",
            "task_status": "model_error",
            "iteration_count": iteration,
            "activity_log": activity
        }

    # Construct System Prompt with Memory Context, Capabilities & Role Specialization
    memory_text = state.get("scratchpad", "")
    memory_instruction = f"\n\n{memory_text}" if memory_text else ""
    role_spec = state.get("role_prompt", "")
    role_prefix = f"\n[Specialized Role Directive]: {role_spec}\n" if role_spec else ""

    system_prompt = (
        "You are RAJJO, a local-first autonomous AI desktop agent built to assist users with file operations, "
        "shell commands, live web search, browser automation, and deep research & documentation.\n"
        f"{role_prefix}"
        "Guidelines:\n"
        "1. Plan carefully. If a task requires multiple steps, execute the appropriate tool sequentially.\n"
        "2. VISIBLE BROWSER: If the user asks to 'show a visible window', 'browse visibly', "
        "or watch your actions on screen, use 'open_visible_browser' or 'browser_navigate(visible=True)'. "
        "3. FORMATTING: Format your final response with clean, professional Markdown. Use clear headings, bullet points, "
        "tables, and code blocks where appropriate.\n"
        "4. If a tool reports an error, analyze the error code and retry with corrected parameters or an alternate strategy.\n"
        "5. When you have completed all actions, provide a comprehensive final response.\n"
        f"{memory_instruction}"
    )

    # Trim older history safely so ToolMessages are never orphaned from parent AIMessages
    history_messages = list(state["messages"])
    if len(history_messages) > 30:
        history_messages = trim_history_safely(history_messages, max_recent=24)

    full_messages = [SystemMessage(content=system_prompt)] + history_messages

    try:
        response = llm_bound.invoke(full_messages)
    except Exception as e:
        err = f"Model execution error: {str(e)}"
        activity.append({"type": "error", "message": err})
        return {
            "messages": [AIMessage(content=f"I encountered an error communicating with the model: {str(e)}")],
            "next_step": "reflect",
            "task_status": "model_invocation_error",
            "iteration_count": iteration,
            "activity_log": activity
        }

    # Check if tool calls were requested
    if getattr(response, "tool_calls", None) and len(response.tool_calls) > 0:
        tool_names = [tc["name"] for tc in response.tool_calls]
        activity.append({
            "type": "plan_summary",
            "message": f"Executing tool: {', '.join(tool_names)}"
        })
        return {
            "messages": [response],
            "next_step": "execute_tool",
            "task_status": "in_progress",
            "iteration_count": iteration,
            "activity_log": activity
        }

    # No tool calls: final response generated
    activity.append({"type": "status", "message": "Task response generated."})
    return {
        "messages": [response],
        "next_step": "reflect",
        "task_status": "completed",
        "final_output": response.content,
        "iteration_count": iteration,
        "activity_log": activity
    }

def tool_executor_node(state: AgentState) -> Dict[str, Any]:
    """Execute requested tools and capture structured results."""
    last_message = state["messages"][-1]
    activity = list(state.get("activity_log", []))
    tool_outputs = []
    thread_id = state.get("thread_id")

    # Prompt-injection trust boundary:
    # Check if untrusted external content (web page, MCP tool output, browser content, external file read) is in context
    has_untrusted = bool(state.get("has_untrusted_content", False))
    if not has_untrusted:
        for m in state.get("messages", []):
            if getattr(m, "type", "") == "tool":
                tname = getattr(m, "name", "")
                if is_untrusted_source_tool(tname, {}):
                    has_untrusted = True
                    break

    try:
        from backend.config import load_settings as _load_settings
    except ImportError:
        from config import load_settings as _load_settings
    settings = _load_settings()

    role_tools_filter = state.get("role_tools")

    for tool_call in getattr(last_message, "tool_calls", []):
        tool_name = tool_call["name"]
        tool_args = tool_call.get("args", {})
        tool_id = tool_call.get("id", f"call_{int(time.time()*1000)}")

        # Enforce role tool boundary
        if role_tools_filter and tool_name not in role_tools_filter:
            forbidden_msg = json.dumps({
                "success": False,
                "tool": tool_name,
                "error": {
                    "code": "ROLE_RESTRICTION",
                    "message": f"Tool '{tool_name}' is forbidden for subagent role. Permitted tools: {', '.join(role_tools_filter)}"
                }
            })
            activity.append({"type": "tool_end", "tool": tool_name, "success": False, "message": f"Tool '{tool_name}' forbidden for subagent role."})
            tool_outputs.append(ToolMessage(content=forbidden_msg, tool_call_id=tool_id, name=tool_name))
            continue

        if is_untrusted_source_tool(tool_name, tool_args):
            has_untrusted = True

        activity_desc = f"Running tool '{tool_name}'..."
        if tool_name == "read_file":
            activity_desc = f"Reading file: {tool_args.get('path', '')}"
        elif tool_name == "write_file":
            activity_desc = f"Writing file: {tool_args.get('path', '')}"
        elif tool_name == "run_shell_command":
            activity_desc = f"Running command: {tool_args.get('command', '')[:50]}"
        elif tool_name == "web_search":
            activity_desc = f"Searching web for: {tool_args.get('query', '')}"
        elif tool_name == "open_visible_browser":
            activity_desc = f"Launching visible browser for: {tool_args.get('url', '')}"

        activity.append({"type": "tool_start", "tool": tool_name, "message": activity_desc, "args": tool_args})

        # Central approval gate: check ApprovalManager.requires_approval before every tool
        needs_gate = approval_manager.requires_approval(tool_name, tool_args, settings, untrusted_context=has_untrusted)
        if needs_gate:
            desc = f"Tool '{tool_name}' requires approval before execution."
            if has_untrusted:
                desc += " (Untrusted external content is present in session context)"
            approved = approval_manager.request_approval_sync(
                tool_name=tool_name,
                tool_args=tool_args,
                description=desc,
                risk_level="high",
                timeout_seconds=120,
                thread_id=thread_id
            )
            if not approved:
                denied_msg = json.dumps({
                    "success": False,
                    "tool": tool_name,
                    "error": {"code": "USER_REJECTED", "message": f"Tool '{tool_name}' was denied by user."}
                })
                activity.append({"type": "tool_end", "tool": tool_name, "success": False, "message": f"Tool '{tool_name}' denied by user."})
                tool_outputs.append(ToolMessage(content=denied_msg, tool_call_id=tool_id, name=tool_name))
                continue

        target_tool = registry.get_tool(tool_name)
        if target_tool and registry.is_enabled(tool_name):
            try:
                if tool_name == "run_shell_command":
                    try:
                        from backend.tools.shell_tools import active_shell_thread
                        active_shell_thread.set(thread_id)
                    except Exception:
                        pass

                res = target_tool.invoke(tool_args)
                tool_result_str = str(res)

                # If write operation occurred in untrusted context, track the generated file
                if tool_name in ("write_file", "copy_file") and has_untrusted:
                    tpath = tool_args.get("path") or tool_args.get("destination", "")
                    if tpath:
                        try:
                            mark_file_untrusted(tpath)
                        except Exception:
                            pass

                # Hard limit tool outputs to prevent context window explosion (50KB cap)
                MAX_TOOL_OUTPUT = 51_200
                if len(tool_result_str) > MAX_TOOL_OUTPUT:
                    tool_result_str = tool_result_str[:MAX_TOOL_OUTPUT] + "\n...[Output truncated due to context size cap]..."
                is_success = True
                try:
                    parsed = json.loads(tool_result_str)
                    is_success = parsed.get("success", True)
                except Exception:
                    pass

                activity.append({
                    "type": "tool_end",
                    "tool": tool_name,
                    "success": is_success,
                    "message": f"Completed '{tool_name}'" if is_success else f"Tool '{tool_name}' notice/error"
                })

                tool_outputs.append(ToolMessage(
                    content=tool_result_str,
                    tool_call_id=tool_id,
                    name=tool_name
                ))
            except Exception as e:
                err_payload = json.dumps({
                    "success": False,
                    "tool": tool_name,
                    "error": {"code": "TOOL_EXCEPTION", "message": str(e)}
                })
                activity.append({"type": "tool_end", "tool": tool_name, "success": False, "message": f"Error in {tool_name}: {str(e)}"})
                tool_outputs.append(ToolMessage(
                    content=err_payload,
                    tool_call_id=tool_id,
                    name=tool_name
                ))
        else:
            disabled_msg = json.dumps({
                "success": False,
                "tool": tool_name,
                "error": {"code": "TOOL_DISABLED_OR_NOT_FOUND", "message": f"Tool '{tool_name}' not found or disabled."}
            })
            activity.append({"type": "tool_end", "tool": tool_name, "success": False, "message": f"Tool '{tool_name}' disabled or not found."})
            tool_outputs.append(ToolMessage(
                content=disabled_msg,
                tool_call_id=tool_id,
                name=tool_name
            ))

    return {
        "messages": tool_outputs,
        "next_step": "planner",
        "activity_log": activity,
        "has_untrusted_content": has_untrusted
    }

def reflection_node(state: AgentState) -> Dict[str, Any]:
    """Reflect on task and extract reusable learning."""
    user_input = state.get("user_input", "")
    history = state.get("messages", [])
    model_cfg = state.get("model_config", {})
    activity = list(state.get("activity_log", []))

    activity.append({"type": "status", "message": "Reflecting on task outcome..."})

    lesson = None
    try:
        lesson = reflector_service.reflect(user_input, history, model_cfg)
        if lesson:
            activity.append({"type": "reflection", "message": f"Insight proposed: {lesson}"})
    except Exception as exc:
        print(f"[Graph:reflection_node] Reflection error: {exc}")

    return {
        "scratchpad": lesson or "",
        "activity_log": activity
    }

def memory_writer_node(state: AgentState) -> Dict[str, Any]:
    """Persist episodic task record and semantic insights to local storage."""
    user_input = state.get("user_input", "")
    history = state.get("messages", [])
    lesson = state.get("scratchpad", "")
    status = state.get("task_status", "completed")
    activity = list(state.get("activity_log", []))

    activity.append({"type": "status", "message": "Saving task history to memory..."})

    # 1. Save semantic memory if genuine lesson was learned (defaults to approved=False for approval gating)
    if lesson:
        try:
            semantic.add_memory(
                lesson,
                metadata={"source": "task_reflection", "user_input": user_input[:100], "approved": False},
                auto_approve=False
            )
        except Exception as exc:
            print(f"[Graph:memory_writer_node] Semantic memory write error: {exc}")

    # 2. Save episodic memory record
    try:
        serializable_history = []
        executed_tools = []
        for m in history:
            role = getattr(m, "type", "message")
            content = getattr(m, "content", "")
            tool_calls = getattr(m, "tool_calls", None)
            if role == "tool":
                executed_tools.append(getattr(m, "name", "tool"))
            serializable_history.append({
                "role": role,
                "content": content,
                "tool_calls": tool_calls
            })

        plan_desc = f"Steps executed via {', '.join(executed_tools)}" if executed_tools else "Direct answer formulation"
        outcome_desc = state.get("final_output", "").strip()
        if not outcome_desc:
            outcome_desc = "Task completed successfully" if status == "completed" else f"Status: {status}"
        else:
            outcome_desc = outcome_desc[:200]

        episodic.save_task(
            user_input=user_input,
            plan=plan_desc,
            history=serializable_history,
            outcome=outcome_desc,
            status=status
        )
    except Exception as e:
        print(f"[MemoryWriter] Error saving episodic task: {e}")

    activity.append({"type": "status", "message": "Task complete."})
    return {
        "task_status": status,
        "final_output": state.get("final_output", ""),
        "activity_log": activity
    }

# 3. Build Graph
workflow = StateGraph(AgentState)

workflow.add_node("retrieve_memory", retrieve_memory_node)
workflow.add_node("plan", plan_node)
workflow.add_node("planner", planner_node)
workflow.add_node("tool_executor", tool_executor_node)
workflow.add_node("reflector", reflection_node)
workflow.add_node("memory_writer", memory_writer_node)

workflow.set_entry_point("retrieve_memory")
workflow.add_edge("retrieve_memory", "plan")
workflow.add_edge("plan", "planner")

def route_planner_decision(state: AgentState):
    return state.get("next_step", "reflect")

workflow.add_conditional_edges(
    "planner",
    route_planner_decision,
    {
        "execute_tool": "tool_executor",
        "reflect": "reflector"
    }
)

workflow.add_edge("tool_executor", "planner")
workflow.add_edge("reflector", "memory_writer")
workflow.add_edge("memory_writer", END)

agent_graph = workflow.compile()
