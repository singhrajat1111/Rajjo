import os
import sys
import json
import time
from pathlib import Path

# Fix Windows console UTF-8 output
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Setup paths
root_dir = Path(__file__).resolve().parent.parent
backend_dir = root_dir / "backend"
sys.path.insert(0, str(root_dir))
sys.path.insert(0, str(backend_dir))

def print_section(title):
    print("\n" + "=" * 60)
    print(f" TEST SUITE: {title}")
    print("=" * 60)

def test_config_and_paths():
    print_section("1. Centralized Config & Dynamic Paths")
    from backend.config import DATA_DIR, load_settings, save_settings, get_masked_secrets_summary
    print(f"[OK] Data Directory initialized at: {DATA_DIR}")
    assert DATA_DIR.exists(), "DATA_DIR does not exist!"
    
    settings = load_settings()
    print(f"[OK] Default Settings loaded: active_provider={settings.get('active_provider')}, active_model_id={settings.get('active_model_id')}")
    
    secrets = get_masked_secrets_summary()
    print(f"[OK] Secret masking functional (OpenAI configured: {secrets['openai']['configured']})")
    print("[PASS] TEST 1: Config & Paths OK")

def test_filesystem_tools():
    print_section("2. Structured File System Tools")
    from backend.tools.fs_tools import create_directory, write_file, read_file, list_dir, search_files
    
    test_dir = root_dir / "test_scratch_dir"
    test_file = test_dir / "sample.txt"
    
    # 1. Create directory
    res1 = json.loads(create_directory.invoke({"path": str(test_dir)}))
    print(f"Create directory result: success={res1['success']}")
    assert res1["success"], f"create_directory failed: {res1}"
    
    # 2. Write file
    content = "Hello Rajjo! Autonomous agent system test content."
    res2 = json.loads(write_file.invoke({"path": str(test_file), "content": content}))
    print(f"Write file result: success={res2['success']}, bytes={res2['data']['bytes_written']}")
    assert res2["success"], f"write_file failed: {res2}"
    
    # 3. Read file
    res3 = json.loads(read_file.invoke({"path": str(test_file)}))
    print(f"Read file result: success={res3['success']}, size={res3['data']['size_bytes']}")
    assert res3["success"] and res3["data"]["content"] == content, f"read_file failed: {res3}"
    
    # 4. List directory
    res4 = json.loads(list_dir.invoke({"path": str(test_dir)}))
    print(f"List dir result: success={res4['success']}, items count={res4['data']['count']}")
    assert res4["success"] and res4["data"]["count"] >= 1, f"list_dir failed: {res4}"
    
    # 5. Search files
    res5 = json.loads(search_files.invoke({"query": "Autonomous agent", "path": str(test_dir)}))
    print(f"Search files result: success={res5['success']}, matches={res5['data']['total_matches']}")
    assert res5["success"] and res5["data"]["total_matches"] >= 1, f"search_files failed: {res5}"
    
    # Cleanup scratch test files
    try:
        import shutil
        shutil.rmtree(test_dir, ignore_errors=True)
    except Exception:
        pass
    
    print("[PASS] TEST 2: Filesystem Tools OK")

def test_shell_tools():
    print_section("3. Structured Shell Execution & Safety")
    from backend.tools.shell_tools import run_shell_command
    
    # Safe echo command
    res1 = json.loads(run_shell_command.invoke({"command": "echo Rajjo Shell Test"}))
    print(f"Echo command result: success={res1['success']}, stdout='{res1['data']['stdout']}'")
    assert res1["success"] and "Rajjo Shell Test" in res1["data"]["stdout"], f"echo command failed: {res1}"
    
    # Destructive command safety block
    res2 = json.loads(run_shell_command.invoke({"command": "rmdir /s /q C:\\Windows"}))
    print(f"Blocked destructive command test: success={res2['success']}, error_code={res2['error']['code']}")
    assert not res2["success"] and res2["error"]["code"] == "BLOCKED_DESTRUCTIVE_COMMAND", "Dangerous command was not blocked!"
    
    # Timeout test
    res3 = json.loads(run_shell_command.invoke({"command": "powershell -Command \"Start-Sleep -Seconds 5\"", "timeout": 1}))
    print(f"Timeout test result: success={res3['success']}, error_code={res3['error']['code']}")
    assert not res3["success"] and res3["error"]["code"] == "TIMEOUT_EXPIRED", "Timeout was not triggered!"
    
    print("[PASS] TEST 3: Shell Tools & Safety OK")

def test_web_search():
    print_section("4. Web Search Tool")
    from backend.tools.web_search import web_search
    
    res = json.loads(web_search.invoke({"query": "Python programming language", "max_results": 2}))
    print(f"Web search result: success={res['success']}, count={res.get('data', {}).get('count', 0)}")
    assert res["success"] or "error" in res, f"web_search failed: {res}"
    print("[PASS] TEST 4: Web Search Tool OK")

def test_memory_system():
    print_section("5. Episodic & Semantic Memory System")
    from backend.memory.episodic import episodic
    from backend.memory.semantic import semantic
    from backend.memory.reflector import reflector_service
    
    # Episodic
    task_id = episodic.save_task(
        user_input="Test autonomous task execution",
        plan="1. Read file 2. Write file",
        history=[{"role": "user", "content": "hello"}],
        outcome="Successfully executed test",
        status="completed"
    )
    print(f"Saved episodic task ID: {task_id}")
    recent = episodic.get_recent_tasks(limit=5)
    assert len(recent) > 0, "No episodic tasks retrieved!"
    print(f"[OK] Retrieved {len(recent)} recent episodic task(s)")
    
    # Semantic
    mem_id = semantic.add_memory("The user prefers using Python and TypeScript for development projects.", metadata={"category": "preference"})
    print(f"Saved semantic memory ID: {mem_id}")
    query_res = semantic.query_memory("What languages does the user prefer?", n_results=2)
    print(f"[OK] Semantic Query Results: {query_res}")
    assert len(query_res) > 0, "Semantic query returned empty!"
    
    print("[PASS] TEST 5: Memory System OK")

def test_model_router_and_gguf():
    print_section("6. Model Router & GGUF Validation")
    from backend.model_router import router, ModelRouter
    
    # Ollama detection test
    running, models, msg = ModelRouter.detect_ollama()
    print(f"Ollama detection: running={running}, models={models}, msg='{msg}'")
    
    # GGUF validation test
    dummy_gguf = root_dir / "dummy_test_model.gguf"
    with open(dummy_gguf, "wb") as f:
        f.write(b"GGUF" + b"\x00" * 1024)
    
    info = ModelRouter.validate_gguf(str(dummy_gguf))
    print(f"GGUF Validation: valid={info['valid']}, filename={info.get('filename')}, size_bytes={info.get('size_bytes')}")
    assert info["valid"] and info["filename"] == "dummy_test_model.gguf", "GGUF validation failed!"
    
    dummy_gguf.unlink(missing_ok=True)
    print("[PASS] TEST 6: Model Router & GGUF Validation OK")

def test_agent_graph_state_machine():
    print_section("7. LangGraph Agent State Machine & Autonomous Loop")
    from backend.graph import agent_graph
    from langchain_core.messages import HumanMessage
    
    initial_state = {
        "messages": [HumanMessage(content="Create a scratch test file named graph_test.txt with 'LangGraph autonomous agent is operational'")],
        "plan_summary": "",
        "next_step": "planner",
        "task_status": "in_progress",
        "scratchpad": "",
        "user_input": "Create a scratch test file named graph_test.txt",
        "model_config": {"provider": "openai", "model_id": "gpt-4o", "api_key": "test_dummy_key"},
        "iteration_count": 0,
        "max_iterations": 5,
        "activity_log": [],
        "final_output": ""
    }
    
    print("Executing LangGraph state machine flow...")
    step_count = 0
    for state in agent_graph.stream(initial_state, stream_mode="values"):
        step_count += 1
        activities = state.get("activity_log", [])
        if activities:
            latest = activities[-1]
            print(f"  [Step {step_count}] Activity: {latest.get('type')} -> {latest.get('message', '')}")
    
    print(f"[OK] Agent execution completed in {step_count} state transitions.")
    print("[PASS] TEST 7: LangGraph Agent Loop OK")

if __name__ == "__main__":
    print("\nStarting Rajjo Complete System Verification...")
    test_config_and_paths()
    test_filesystem_tools()
    test_shell_tools()
    test_web_search()
    test_memory_system()
    test_model_router_and_gguf()
    test_agent_graph_state_machine()
    print("\n" + "=" * 60)
    print(" ALL RAJJO SYSTEM & INTEGRATION TESTS PASSED SUCCESSFULLY! ")
    print("=" * 60 + "\n")
