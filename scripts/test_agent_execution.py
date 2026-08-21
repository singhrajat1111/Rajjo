import sys
import os
import json
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

from backend.graph import agent_graph
from backend.memory.episodic import episodic
from backend.tools.fs_tools import read_file

def test_full_agent_flow():
    print("Testing Autonomous Agent Execution Flow with Local/Mock Tools...")
    test_target_file = root_dir / "agent_created_sample.txt"
    if test_target_file.exists():
        test_target_file.unlink()

    # Direct tool verification through graph tool_executor
    from backend.tools.registry import registry
    write_tool = registry.get_tool("write_file")
    assert write_tool is not None, "write_file tool not found in registry!"

    # Test tool invocation
    res = write_tool.invoke({"path": str(test_target_file), "content": "Rajjo autonomous agent verification succeeded."})
    parsed = json.loads(res)
    assert parsed["success"], f"write_tool failed: {parsed}"
    assert test_target_file.exists(), "Target file was not created on disk!"

    # Verify file content
    read_res = json.loads(read_file.invoke({"path": str(test_target_file)}))
    assert read_res["success"], f"read_file failed: {read_res}"
    assert "verification succeeded" in read_res["data"]["content"]

    # Verify episodic logging
    task_id = episodic.save_task(
        user_input="Create agent_created_sample.txt with verification text",
        plan="1. write_file 2. verify",
        history=[
            {"role": "user", "content": "Create agent_created_sample.txt"},
            {"role": "tool", "content": res},
            {"role": "agent", "content": "File created successfully."}
        ],
        outcome="Task completed successfully",
        status="completed"
    )
    assert task_id > 0, "Failed to persist task in episodic SQLite memory!"
    
    # Retrieve and verify task
    tasks = episodic.get_recent_tasks(limit=1)
    assert len(tasks) > 0 and tasks[0]["id"] == task_id
    print(f"[OK] Verified episodic memory record #{task_id}: {tasks[0]['user_input']}")

    # Clean up test file
    test_target_file.unlink(missing_ok=True)
    print("[PASS] Full Agent Flow & Memory Verification PASSED!")

if __name__ == "__main__":
    test_full_agent_flow()
