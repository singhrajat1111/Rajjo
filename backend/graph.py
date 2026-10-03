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
class AgentState(TypedDict):
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

def plan_node(state: AgentState) -> Dict[str, Any]:
    """
    Explicit Plan Node: creates an initial breakdown of steps for the requested task.
    """
    user_input = state.get("user_input", "")
    activity = list(state.get("activity_log", []))

    # Form structured initial plan steps
    steps = [
        {"id": 1, "description": "Understand requirements & assess required tools", "status": "completed"},
        {"id": 2, "description": "Execute necessary file, shell, or web actions", "status": "in_progress"},
        {"id": 3, "description": "Synthesize verified findings and deliver final answer", "status": "pending"}
    ]

    activity.append({
        "type": "plan",
        "steps": steps,
        "message": "Structured execution plan created."
    })

    return {
        "plan_steps": steps,
        "activity_log": activity
    }

def planner_node(state: AgentState) -> Dict[str, Any]:
    """Decide next action, bind tools, and generate response or tool calls."""
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
    memory_instruction = f"\n\n{memory_text}" if memory_text else ""

    system_prompt = (
        "You are RAJJO, a local-first autonomous AI desktop agent built to assist users with file operations, "
        "shell commands, live web search, browser automation, and deep research & documentation.\n"
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

        target_tool = registry.get_tool(tool_name)
        if target_tool and registry.is_enabled(tool_name):
            try:
                res = target_tool.invoke(tool_args)
                tool_result_str = str(res)
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
        "activity_log": activity
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

    # 1. Save semantic memory if genuine lesson was learned (defaults to approved=False for approval gating)
    if lesson:
        try:
            semantic.add_memory(
                lesson,
                metadata={"source": "task_reflection", "user_input": user_input[:100], "approved": False},
                auto_approve=False
            )
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
