import json
import time
from typing import Annotated, TypedDict, List, Dict, Any, Optional
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
except ImportError:
    from model_router import router
    from config import load_settings
    from tools.registry import registry
    from memory.episodic import episodic
    from memory.semantic import semantic
    from memory.reflector import reflector_service

# 1. State Definition
class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], add_messages]
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

# 2. Nodes Implementation

def retrieve_memory_node(state: AgentState) -> Dict[str, Any]:
    """Retrieve relevant past memories and episodic experience."""
    user_input = state.get("user_input", "")
    activity = list(state.get("activity_log", []))
    activity.append({"type": "status", "message": "Searching relevant memory and past context..."})

    # Search semantic memory
    memories = semantic.query_memory(user_input, n_results=3)
    memory_context = ""
    if memories:
        memory_context = "\n".join([f"- {m}" for m in memories])

    return {
        "scratchpad": memory_context,
        "activity_log": activity,
        "iteration_count": state.get("iteration_count", 0)
    }

def planner_node(state: AgentState) -> Dict[str, Any]:
    """Decide next action, bind tools, and form plan summary."""
    iteration = state.get("iteration_count", 0) + 1
    max_iter = state.get("max_iterations", 10)
    activity = list(state.get("activity_log", []))

    if iteration > max_iter:
        activity.append({"type": "status", "message": "Reached maximum iteration limit. Finalizing response."})
        return {
            "messages": [AIMessage(content="I have reached the maximum allowed execution steps for this task. Here is the current progress and outcome.")],
            "next_step": "reflect",
            "task_status": "max_iterations_reached",
            "iteration_count": iteration,
            "activity_log": activity
        }

    activity.append({"type": "status", "message": "Analyzing task and planning next step..."})

    # Get active tools
    active_tools = registry.get_active_tools()
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

    # Construct System Prompt with Memory Context & Capabilities
    memory_text = state.get("scratchpad", "")
    memory_instruction = f"\n\n[Relevant Past Experience & Memory]:\n{memory_text}" if memory_text else ""

    system_prompt = (
        "You are RAJJO, a local-first autonomous AI desktop agent built to assist users with file operations, "
        "shell commands, live web search, browser automation, and deep research & documentation.\n"
        "Instructions:\n"
        "1. Plan carefully. If a task requires multiple steps, execute the appropriate tool sequentially.\n"
        "2. VISIBLE WINDOW FEATURE: If the user asks to 'show a visible window', 'open a visible window', 'browse visibly', "
        "or watch what you are typing or searching on screen, ALWAYS use the 'open_visible_browser' tool or 'browser_navigate(visible=True)'. "
        "This launches a real on-screen desktop browser window where the user can see typing and navigation in real time.\n"
        "3. CAPTCHA & BOT BARRIER AWARENESS: If a web page or search tool notes a CAPTCHA, Cloudflare challenge, or verification screen, "
        "do NOT abort or revert. Automatically pivot to alternative web sources, alternative search keywords, or use 'open_visible_browser' "
        "where the user can visibly resolve it.\n"
        "4. FORMATTING: Format your final response with rich, clean Markdown. Use clear headings (##, ###), bullet points, bold keywords, "
        "formatted markdown tables (| Col 1 | Col 2 |), and code blocks (```language ... ```) where appropriate.\n"
        "5. If a tool reports an error, analyze the structured error and retry with corrected parameters or an alternate strategy.\n"
        "6. When you have completed all actions, provide a comprehensive, beautifully structured final response.\n"
        f"{memory_instruction}"
    )

    full_messages = [SystemMessage(content=system_prompt)] + list(state["messages"])

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

    for tool_call in getattr(last_message, "tool_calls", []):
        tool_name = tool_call["name"]
        tool_args = tool_call.get("args", {})
        tool_id = tool_call.get("id", f"call_{int(time.time()*1000)}")

        # Human readable activity status
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
            activity_desc = f"Launching visible window for: {tool_args.get('url', '')} (Query: {tool_args.get('search_query', 'N/A')})"
        elif tool_name in ("browser_navigate", "open_browser_url"):
            activity_desc = f"Navigating to: {tool_args.get('url', '')}"
        elif tool_name == "browser_screenshot":
            activity_desc = f"Capturing screenshot of: {tool_args.get('url', '')}"

        activity.append({"type": "tool_start", "tool": tool_name, "message": activity_desc, "args": tool_args})

        target_tool = registry.get_tool(tool_name)
        if target_tool and registry.is_enabled(tool_name):
            try:
                res = target_tool.invoke(tool_args)
                tool_result_str = str(res)
                # Parse success status if structured JSON
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
                    "message": f"Completed '{tool_name}'" if is_success else f"Tool '{tool_name}' reported notice/error"
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
                    "data": None,
                    "error": {"code": "TOOL_EXCEPTION", "message": str(e)}
                })
                activity.append({"type": "tool_end", "tool": tool_name, "success": False, "message": f"Error executing {tool_name}: {str(e)}"})
                tool_outputs.append(ToolMessage(
                    content=err_payload,
                    tool_call_id=tool_id,
                    name=tool_name
                ))
        else:
            disabled_msg = json.dumps({
                "success": False,
                "tool": tool_name,
                "data": None,
                "error": {"code": "TOOL_DISABLED_OR_NOT_FOUND", "message": f"Tool '{tool_name}' is not found or currently disabled."}
            })
            activity.append({"type": "tool_end", "tool": tool_name, "success": False, "message": f"Tool '{tool_name}' is disabled or not found."})
            tool_outputs.append(ToolMessage(
                content=disabled_msg,
                tool_call_id=tool_id,
                name=tool_name
            ))

    return {
        "messages": tool_outputs,
        "next_step": "planner",
        "activity_log": activity
    }

def reflection_node(state: AgentState) -> Dict[str, Any]:
    """Reflect on task and extract reusable learning for semantic memory."""
    user_input = state.get("user_input", "")
    history = state.get("messages", [])
    model_cfg = state.get("model_config", {})
    activity = list(state.get("activity_log", []))

    activity.append({"type": "status", "message": "Reflecting on task outcome..."})

    lesson = None
    try:
        lesson = reflector_service.reflect(user_input, history, model_cfg)
        if lesson:
            activity.append({"type": "reflection", "message": f"Insight stored: {lesson}"})
    except Exception:
        pass

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

    # 1. Save semantic memory if lesson was learned
    if lesson:
        try:
            semantic.add_memory(lesson, metadata={"source": "task_reflection", "user_input": user_input[:100]})
        except Exception:
            pass

    # 2. Save episodic memory record
    try:
        serializable_history = []
        for m in history:
            role = getattr(m, "type", "message")
            content = getattr(m, "content", "")
            tool_calls = getattr(m, "tool_calls", None)
            serializable_history.append({
                "role": role,
                "content": content,
                "tool_calls": tool_calls
            })

        episodic.save_task(
            user_input=user_input,
            plan="Autonomous execution",
            history=serializable_history,
            outcome="Task completed successfully" if status == "completed" else f"Status: {status}",
            status=status
        )
    except Exception as e:
        print(f"[MemoryWriter] Error saving episodic task: {e}")

    activity.append({"type": "status", "message": "Task complete."})
    return {
        "task_status": status,
        "activity_log": activity
    }

# 3. Build Graph
workflow = StateGraph(AgentState)

workflow.add_node("retrieve_memory", retrieve_memory_node)
workflow.add_node("planner", planner_node)
workflow.add_node("tool_executor", tool_executor_node)
workflow.add_node("reflector", reflection_node)
workflow.add_node("memory_writer", memory_writer_node)

workflow.set_entry_point("retrieve_memory")
workflow.add_edge("retrieve_memory", "planner")

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
