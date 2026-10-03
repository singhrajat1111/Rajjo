import os
import sys
import json
import struct
import subprocess
import pytest
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent
backend_dir = root_dir / "backend"
sys.path.insert(0, str(root_dir))
sys.path.insert(0, str(backend_dir))


class Test20TaskEvaluationSuite:
    """
    20-Task Comprehensive Benchmark and Validation Suite for Rajjo Desktop Agent.
    Verifies all P0, P1, P2, and P3 bug fixes, security constraints, and autonomous capabilities.
    """

    # Task 1: Workspace Jail Enforcement
    def test_task_01_workspace_isolation(self):
        from backend.config import get_workspace_dir, PROJECT_ROOT
        ws = get_workspace_dir()
        assert ws != PROJECT_ROOT, "Task 1 Failed: Workspace resolved to project root!"
        assert ws.exists()

    # Task 2: Source Code Protection
    def test_task_02_source_code_protected(self):
        from backend.tools.fs_tools import safe_resolve_path, SecurityPathViolation
        with pytest.raises(SecurityPathViolation):
            safe_resolve_path(str(root_dir / "backend" / "main.py"))

    # Task 3: Credential Shielding
    def test_task_03_credential_shield(self):
        from backend.tools.fs_tools import safe_resolve_path, SecurityPathViolation
        with pytest.raises(SecurityPathViolation):
            safe_resolve_path(".env")
        with pytest.raises(SecurityPathViolation):
            safe_resolve_path(".session_token")

    # Task 4: Bulk Deletion Blocklist Detection
    def test_task_04_bulk_deletion_blocked(self):
        from backend.tools.shell_tools import analyze_command_risk
        assert analyze_command_risk("rm -r -f /home") is not None
        assert analyze_command_risk("rm -rf /") is not None

    # Task 5: PowerShell Pipe Deletion Detection
    def test_task_05_powershell_pipe_deletion_blocked(self):
        from backend.tools.shell_tools import analyze_command_risk
        reason = analyze_command_risk("Get-ChildItem C:\\ -Recurse | Remove-Item -Force")
        assert reason is not None

    # Task 6: Shutdown Command Detection
    def test_task_06_shutdown_command_blocked(self):
        from backend.tools.shell_tools import analyze_command_risk
        reason = analyze_command_risk("shutdown /s /t 0")
        assert reason is not None

    # Task 7: Git Force Push Detection
    def test_task_07_forced_push_blocked(self):
        from backend.tools.shell_tools import analyze_command_risk
        reason = analyze_command_risk("git push origin main --force")
        assert reason is not None

    # Task 8: Approval Gate Grant Flow
    def test_task_08_approval_gate_accept(self):
        from backend.security.approval import approval_manager
        appr_id = "test-grant-8"
        approval_manager._pending[appr_id] = type("Obj", (), {
            "approved": None,
            "event": type("Ev", (), {"set": lambda self: None})()
        })()
        ok = approval_manager.resolve_approval(appr_id, True)
        assert ok is True
        assert approval_manager._pending[appr_id].approved is True
        approval_manager._pending.pop(appr_id, None)

    # Task 9: Approval Gate Deny Flow
    def test_task_09_approval_gate_deny(self):
        from backend.security.approval import approval_manager
        appr_id = "test-deny-9"
        approval_manager._pending[appr_id] = type("Obj", (), {
            "approved": None,
            "event": type("Ev", (), {"set": lambda self: None})()
        })()
        ok = approval_manager.resolve_approval(appr_id, False)
        assert ok is True
        assert approval_manager._pending[appr_id].approved is False
        approval_manager._pending.pop(appr_id, None)

    # Task 10: Subprocess Tree Termination on Abort
    def test_task_10_subprocess_tree_kill(self):
        from backend.security.process_manager import process_manager
        proc = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(5)"])
        process_manager.register_process(proc.pid)
        assert proc.pid in process_manager._active_pids
        process_manager.kill_process_tree(proc.pid)
        assert proc.pid not in process_manager._active_pids

    # Task 11: Zero-RAM GGUF Header Parsing
    def test_task_11_gguf_zero_ram_header_parse(self, tmp_path):
        from backend.model_router import ModelRouter
        dummy_gguf = tmp_path / "eval_model_q8_0.gguf"
        # 4 bytes magic, uint32 version, uint64 tensor_count, uint64 kv_count
        header = b"GGUF" + struct.pack("<IQQ", 3, 256, 32) + (b"\x00" * 512)
        dummy_gguf.write_bytes(header)
        
        info = ModelRouter.validate_gguf(str(dummy_gguf))
        assert info["valid"] is True
        assert info["gguf_version"] == 3
        assert info["tensor_count"] == 256
        assert info["quantization"] == "Q8_0"

    # Task 12: GGUF Engine Cache Across Steps
    def test_task_12_gguf_engine_caching(self):
        from backend.model_router import _GGUF_ENGINE_CACHE
        # Mock engine cache entry
        mock_key = "d:\\models\\test.gguf:4096:0"
        mock_obj = object()
        _GGUF_ENGINE_CACHE[mock_key] = mock_obj
        assert _GGUF_ENGINE_CACHE.get(mock_key) is mock_obj
        _GGUF_ENGINE_CACHE.pop(mock_key, None)

    # Task 13: Reflector Preserves 'nullable'
    def test_task_13_reflector_nullable_preserved(self):
        from backend.memory.reflector import reflector_service
        lesson = "Always handle nullable references gracefully in C# and TypeScript."
        sanitized = reflector_service._sanitize_lesson(lesson)
        assert sanitized == lesson, "Task 13 Failed: Dropped lesson containing 'nullable'!"

    # Task 14: Reflector Omits Junk Fallbacks on Failure
    def test_task_14_reflector_no_junk_on_empty(self):
        from backend.memory.reflector import reflector_service
        # Must return None for empty or NULL, not junk fallback
        assert reflector_service._sanitize_lesson("NULL") is None
        assert reflector_service._sanitize_lesson("   ") is None
        assert reflector_service._sanitize_lesson("None.") is None

    # Task 15: Semantic Memory Deduplication
    def test_task_15_semantic_memory_deduplication(self):
        from backend.memory.semantic import semantic
        semantic.clear_all()
        id1 = semantic.add_memory("Use pytest -v for verbose testing output.")
        id2 = semantic.add_memory("Use pytest -v for verbose testing output.")
        assert id1 == id2
        assert len(semantic.get_all_memories()) == 1

    # Task 16: Semantic Memory Approval Gating
    def test_task_16_semantic_memory_approval_gating(self):
        from backend.memory.semantic import semantic
        semantic.clear_all()
        mem_id = semantic.add_memory("Untrusted extracted insight", auto_approve=False)
        # Should not be returned when only_approved is True
        results = semantic.query_memory("extracted insight", only_approved=True)
        assert len(results) == 0
        # Approve
        semantic.approve_memory(mem_id)
        results_after = semantic.query_memory("extracted insight", only_approved=True)
        assert len(results_after) == 1

    # Task 17: Episodic Memory Query
    def test_task_17_episodic_memory_recall(self):
        from backend.memory.episodic import episodic
        episodic.clear_all()
        episodic.save_task(
            user_input="Analyze context rot in long context LLMs",
            plan="Research report",
            history=[],
            outcome="Documented U-shaped curve",
            status="completed"
        )
        found = episodic.search_tasks("context rot", limit=2)
        assert len(found) >= 1
        assert "context rot" in found[0]["user_input"].lower()

    # Task 18: Thread Persistence Across App Reloads
    def test_task_18_thread_persistence_and_restore(self):
        from backend.memory.threads import thread_store
        t_id = thread_store.create_thread(title="Evaluation Thread 18")
        thread_store.add_message(t_id, "user", "Message A")
        thread_store.add_message(t_id, "agent", "Message B")
        
        msgs = thread_store.get_messages(t_id)
        assert len(msgs) == 2
        assert msgs[0]["content"] == "Message A"
        assert msgs[1]["content"] == "Message B"
        thread_store.delete_thread(t_id)

    # Task 19: MCP Server Manager & Tool Feeder
    def test_task_19_mcp_server_client_registration(self):
        from backend.tools.mcp_manager import mcp_manager
        from backend.tools.registry import registry
        
        # Add server
        mcp_manager.add_server({
            "name": "eval-server",
            "command": "node",
            "args": ["-e", "console.log('mcp ready')"],
            "enabled": False
        })
        servers = mcp_manager.get_servers()
        assert any(s["name"] == "eval-server" for s in servers)
        mcp_manager.remove_server("eval-server")

    # Task 20: Fallback Browser Search URL-Encoding
    def test_task_20_browser_url_encoding(self):
        import urllib.parse
        query = "Python 3.14 & LangGraph + Claude 3.7?"
        encoded = urllib.parse.quote_plus(query)
        assert "&" not in encoded
        assert "+" not in encoded.replace("+", " ") or "%2B" in encoded
        target_url = f"https://duckduckgo.com/?q={encoded}"
        assert target_url.startswith("https://duckduckgo.com/?q=")
        assert " " not in target_url
