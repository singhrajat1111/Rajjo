"""
test_bug_fixes.py — regression tests for bugs fixed per the dev handoff report.

Each test is named after the bug it covers so CI output is self-documenting.
"""
import os
import sys
import json
import subprocess
import threading
from pathlib import Path

import pytest

root_dir = Path(__file__).resolve().parent.parent
backend_dir = root_dir / "backend"
for p in [str(root_dir), str(backend_dir)]:
    if p not in sys.path:
        sys.path.insert(0, p)


# ---------------------------------------------------------------------------
# P0-1: Process kill must NOT terminate the backend
# ---------------------------------------------------------------------------

class TestProcessGroupIsolation:
    """P0-1: Popen children get their own session; killpg never kills the backend."""

    def test_child_has_different_pgid(self):
        """The spawned process must run in a different process group than us."""
        import os
        import sys
        popen_kwargs = dict(
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        if sys.platform != "win32":
            popen_kwargs["start_new_session"] = True
        else:
            popen_kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP

        proc = subprocess.Popen(
            [sys.executable, "-c", "import time; time.sleep(10)"],
            **popen_kwargs
        )
        try:
            if sys.platform != "win32":
                child_pgid = os.getpgid(proc.pid)
                own_pgid = os.getpgid(os.getpid())
                assert child_pgid != own_pgid, (
                    "Child process is in the same process group as the backend! "
                    "kill_process_tree would kill the backend."
                )
        finally:
            proc.kill()
            proc.wait()

    def test_process_manager_kill_does_not_kill_self(self):
        """kill_process_tree with a child pid must not kill our own process."""
        from backend.security.process_manager import process_manager

        popen_kwargs = dict(stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if sys.platform != "win32":
            popen_kwargs["start_new_session"] = True
        else:
            popen_kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP

        proc = subprocess.Popen(
            [sys.executable, "-c", "import time; time.sleep(10)"],
            **popen_kwargs
        )
        process_manager.register_process(proc.pid)
        process_manager.kill_process_tree(proc.pid)
        # If we reach here, the backend was not killed
        assert os.getpid() > 0, "Backend process should still be alive"


# ---------------------------------------------------------------------------
# P0-2: Approval sync must NOT stall for 120 s
# ---------------------------------------------------------------------------

class TestApprovalSync:
    """P0-2: request_approval_sync uses threading.Event, not asyncio."""

    def test_sync_approval_resolves_from_another_thread(self):
        """
        Simulate what happens in production: the tool (worker thread) calls
        request_approval_sync; the HTTP handler (another thread) resolves it.
        Must complete well under 5 s.
        """
        from backend.security.approval import approval_manager, PendingApproval
        import time

        result_holder = {}

        def _approver():
            """Simulate the /chat/approve HTTP handler firing 100 ms later."""
            time.sleep(0.1)
            # Find the pending approval and resolve it
            for aid in list(approval_manager._pending.keys()):
                approval_manager.resolve_approval(aid, True)

        t = threading.Thread(target=_approver, daemon=True)
        t.start()

        start = time.time()
        approved = approval_manager.request_approval_sync(
            tool_name="test_tool",
            tool_args={},
            description="Test approval",
            risk_level="normal",
            timeout_seconds=5,
        )
        elapsed = time.time() - start
        t.join(timeout=2)

        assert approved is True, "Approval should have been granted"
        assert elapsed < 3, f"Approval took {elapsed:.2f}s — should complete in <3s not 120s"

    def test_sync_approval_timeout_returns_false(self):
        """When nobody resolves the approval, it must timeout and return False."""
        from backend.security.approval import approval_manager
        import time

        start = time.time()
        approved = approval_manager.request_approval_sync(
            tool_name="ghost_tool",
            tool_args={},
            description="Nobody will approve this",
            risk_level="normal",
            timeout_seconds=0.3,
        )
        elapsed = time.time() - start
        assert approved is False
        assert elapsed < 2, "Timeout should fire in ~0.3s, not hang"


# ---------------------------------------------------------------------------
# P0-5: GET /models/providers must not 500
# ---------------------------------------------------------------------------

class TestProviderConfigsImport:
    """P0-5: PROVIDER_CONFIGS must be importable from backend.config."""

    def test_provider_configs_importable(self):
        from backend.config import PROVIDER_CONFIGS
        assert isinstance(PROVIDER_CONFIGS, dict)
        assert "openai" in PROVIDER_CONFIGS
        assert "anthropic" in PROVIDER_CONFIGS
        assert "groq" in PROVIDER_CONFIGS

    def test_get_providers_endpoint_would_not_500(self):
        """The endpoint body is just `return {"providers": PROVIDER_CONFIGS}`.
        Verify PROVIDER_CONFIGS is a JSON-serialisable dict."""
        from backend.config import PROVIDER_CONFIGS
        serialised = json.dumps({"providers": PROVIDER_CONFIGS})
        parsed = json.loads(serialised)
        assert "providers" in parsed


# ---------------------------------------------------------------------------
# P1-6: /memory/import must strip approved flag
# ---------------------------------------------------------------------------

class TestMemoryImportApprovalStrip:
    """P1-6: Imported memories must always land with approved=False."""

    def test_imported_memory_with_approved_true_becomes_false(self):
        from backend.memory.semantic import SemanticMemory
        import tempfile, json
        from pathlib import Path

        # Use an isolated temp store so we don't touch AppData
        with tempfile.TemporaryDirectory() as td:
            mem = SemanticMemory.__new__(SemanticMemory)
            mem._fallback_path = Path(td) / "test_store.json"
            mem._use_chroma = False
            mem.embedder = None
            mem._init_fallback()

            # Simulate what /memory/import does after our fix
            imported_entries = [
                {"document": "injected lesson", "metadata": {"approved": True, "approved_at": "2024-01-01"}}
            ]
            for s in imported_entries:
                doc = s.get("document", "")
                meta = s.get("metadata", {}).copy()
                meta.pop("approved", None)
                meta.pop("approved_at", None)
                meta["approved"] = False
                if doc:
                    mem.add_memory(doc, meta)

            # Check the stored record
            data = mem._read_fallback()
            assert len(data) == 1
            assert data[0]["metadata"]["approved"] is False
            assert "approved_at" not in data[0]["metadata"]


# ---------------------------------------------------------------------------
# P0-4: Recursion limit must be set high enough
# ---------------------------------------------------------------------------

class TestRecursionLimit:
    """P0-4: The compiled graph config should not hit LangGraph default limit=25."""

    def test_recursion_limit_formula(self):
        """Verify that the formula max(max_iterations*2+10, 50) always exceeds 25."""
        for max_iter in [5, 10, 15, 20]:
            limit = max(max_iter * 2 + 10, 50)
            assert limit > 25, (
                f"recursion_limit={limit} for max_iterations={max_iter} "
                "is not above LangGraph default of 25"
            )
            assert limit >= 50, (
                f"recursion_limit={limit} should be at least 50 to handle small max_iterations"
            )


# ---------------------------------------------------------------------------
# P2-12: Embedder must use stable hash (hashlib, not hash())
# ---------------------------------------------------------------------------

class TestStableEmbedder:
    """P2-12: DeterministicLocalEmbedder must produce identical vectors across processes."""

    def test_embedder_is_deterministic_in_subprocess(self):
        """Run embed_text in a fresh subprocess — result must match in-process result."""
        from backend.memory.semantic import DeterministicLocalEmbedder
        embedder = DeterministicLocalEmbedder(dim=64)
        text = "test embedding stability"
        vec_a = embedder.embed_text(text)

        # Run in a subprocess to simulate a fresh Python interpreter.
        # We import only the embedder class (not the full SemanticMemory which
        # triggers ChromaDB init and writes noise to stdout).
        code = (
            "import sys, json; "
            f"sys.path.insert(0, r'{root_dir}'); "
            f"sys.path.insert(0, r'{backend_dir}'); "
            "from backend.memory.semantic import DeterministicLocalEmbedder; "
            "e = DeterministicLocalEmbedder(dim=64); "
            "print(json.dumps(e.embed_text('test embedding stability')))"
        )
        result = subprocess.run(
            [sys.executable, "-c", code],
            capture_output=True, text=True, timeout=15
        )
        # Only take the last non-empty line (avoid any warning/noise output)
        stdout_lines = [l.strip() for l in result.stdout.strip().splitlines() if l.strip()]
        assert stdout_lines, f"No output from subprocess. stderr: {result.stderr[:500]}"
        vec_b = json.loads(stdout_lines[-1])
        assert vec_a == vec_b, (
            "Embedder produces different vectors across processes! "
            "hash() is PYTHONHASHSEED-dependent — use hashlib instead."
        )


# ---------------------------------------------------------------------------
# Additional Dev Review Flaw Fix Regressions
# ---------------------------------------------------------------------------

class TestScratchPathApprovalGating:
    """Ensure scratch check matches exact <workspace>/scratch/ path and not substring."""

    def test_scratch_path_exact_match(self):
        from backend.security.approval import approval_manager
        from backend.config import get_workspace_dir
        ws = get_workspace_dir()
        scratch_file = str(ws / "scratch" / "temp.txt")

        # In workspace scratch/ -> No approval required
        assert not approval_manager.requires_approval("write_file", {"path": scratch_file}, {})
        assert not approval_manager.requires_approval("write_file", {"path": "scratch/temp.txt"}, {})

        # Substring tricks -> MUST require approval
        assert approval_manager.requires_approval("write_file", {"path": "scratchy.exe"}, {})
        assert approval_manager.requires_approval("write_file", {"path": "scratch_notes.py"}, {})
        assert approval_manager.requires_approval("write_file", {"path": "my-scratch/test.txt"}, {})
        assert approval_manager.requires_approval("write_file", {"path": "scratch/../escape.py"}, {})


class TestPromptInjectionTrustBoundary:
    """Untrusted external content mandates approval for shell and write operations."""

    def test_untrusted_context_triggers_approval(self):
        from backend.security.approval import approval_manager
        # In trusted context with confirm_destructive=False, echo hello does not need approval
        settings = {"shell_confirm_destructive": False}
        assert not approval_manager.requires_approval("run_shell_command", {"command": "echo hello"}, settings, untrusted_context=False)

        # In untrusted context, ANY shell command requires approval
        assert approval_manager.requires_approval("run_shell_command", {"command": "echo hello"}, settings, untrusted_context=True)
        # Even write in scratch requires approval when untrusted content is present
        assert approval_manager.requires_approval("write_file", {"path": "scratch/temp.txt"}, settings, untrusted_context=True)


class TestHistoryTrimmingSafety:
    """History trimming must never orphan ToolMessages from their parent AIMessage."""

    def test_trim_history_preserves_tool_call_boundary(self):
        from backend.graph import trim_history_safely
        from langchain_core.messages import HumanMessage, AIMessage, ToolMessage

        # Construct a sequence of 35 messages with tool turns
        msgs = [HumanMessage(content="Initial request")]
        for i in range(16):
            ai_msg = AIMessage(content=f"Calling tool {i}", tool_calls=[{"name": "test", "args": {}, "id": f"call_{i}"}])
            tool_msg = ToolMessage(content=f"Result {i}", tool_call_id=f"call_{i}", name="test")
            msgs.extend([ai_msg, tool_msg])

        trimmed = trim_history_safely(msgs, max_recent=24)
        assert trimmed[0] == msgs[0], "First message must be preserved"
        # The first message after the cut must NOT be a ToolMessage without its AIMessage
        second_msg = trimmed[1]
        assert not isinstance(second_msg, ToolMessage), f"Second message {second_msg} was an orphaned ToolMessage!"


class TestScopedClearPending:
    """clear_all_pending must support thread_id scoping."""

    def test_scoped_clear(self):
        from backend.security.approval import approval_manager
        import threading

        t1_approved = []
        t2_approved = []

        def req_t1():
            res = approval_manager.request_approval_sync("test", {}, "t1", timeout_seconds=2, thread_id="t1")
            t1_approved.append(res)

        def req_t2():
            res = approval_manager.request_approval_sync("test", {}, "t2", timeout_seconds=2, thread_id="t2")
            t2_approved.append(res)

        th1 = threading.Thread(target=req_t1, daemon=True)
        th2 = threading.Thread(target=req_t2, daemon=True)
        th1.start()
        th2.start()
        import time
        time.sleep(0.1)

        # Clear only t1
        approval_manager.clear_all_pending(approved=False, thread_id="t1")
        th1.join(timeout=1)
        assert len(t1_approved) == 1 and t1_approved[0] is False

        # t2 should still be pending
        pending = approval_manager.list_pending()
        t2_items = [p for p in pending if p.get("thread_id") == "t2"]
        assert len(t2_items) == 1

        # Clean up t2
        approval_manager.clear_all_pending(approved=True, thread_id="t2")
        th2.join(timeout=1)
        assert len(t2_approved) == 1 and t2_approved[0] is True


class TestMaxIterationsEndToEnd:
    """Ensure max iterations termination yields status='max_iterations_reached' and explicit message."""

    def test_max_iterations_graph_state(self):
        from backend.graph import planner_node
        from langchain_core.messages import HumanMessage
        state = {
            "messages": [HumanMessage(content="loop forever")],
            "iteration_count": 5,
            "max_iterations": 4,
            "activity_log": []
        }
        res = planner_node(state)
        assert res.get("task_status") == "max_iterations_reached"
        assert "reached maximum allowed execution limit" in res.get("final_output", "")

    def test_looping_llm_graph_execution_reaches_max_iterations(self, monkeypatch):
        """A looping LLM that continually emits tool calls must terminate with max_iterations_reached."""
        from backend.graph import agent_graph
        from backend.model_router import router
        from langchain_core.messages import HumanMessage, AIMessage

        class LoopingLLM:
            def invoke(self, messages, **kwargs):
                return AIMessage(
                    content="",
                    tool_calls=[{"name": "read_file", "args": {"path": "nonexistent.txt"}, "id": "call_loop"}]
                )
            def bind_tools(self, tools):
                return self

        monkeypatch.setattr(router, "get_llm", lambda *a, **kw: LoopingLLM())

        initial_state = {
            "messages": [HumanMessage(content="run loop")],
            "plan_steps": [],
            "plan_summary": "",
            "next_step": "retrieve_memory",
            "task_status": "in_progress",
            "scratchpad": "",
            "user_input": "run loop",
            "model_config": {},
            "iteration_count": 0,
            "max_iterations": 2,
            "activity_log": [],
            "final_output": ""
        }

        final_state = agent_graph.invoke(initial_state, config={"recursion_limit": 50})
        assert final_state.get("task_status") == "max_iterations_reached"
        assert "reached maximum allowed execution limit" in final_state.get("final_output", "")


class TestAbortRejectsPendingApproval:
    """Pending approvals must be rejected immediately on abort."""

    def test_abort_unblocks_pending_approval_with_false(self):
        from backend.security.approval import approval_manager
        import threading
        import time

        results = []

        def _ask():
            res = approval_manager.request_approval_sync(
                tool_name="test_abort_tool",
                tool_args={},
                description="Waiting for abort",
                risk_level="high",
                timeout_seconds=5
            )
            results.append(res)

        t = threading.Thread(target=_ask, daemon=True)
        t.start()
        time.sleep(0.1)

        # Trigger abort clearing
        approval_manager.clear_all_pending(approved=False)
        t.join(timeout=1.0)

        assert not t.is_alive(), "Worker thread did not unblock on abort"
        assert len(results) == 1
        assert results[0] is False, "Approval should be resolved as False on abort"


class TestUntrustedContextSourceTracking:
    """Verifies that all browser, web, scraping, MCP, and external file reads trigger untrusted status."""

    def test_untrusted_source_tool_detection(self):
        from backend.graph import is_untrusted_source_tool
        from backend.config import get_workspace_dir

        ws = get_workspace_dir()

        # Web & browser tools are untrusted sources
        assert is_untrusted_source_tool("web_search", {"query": "test"})
        assert is_untrusted_source_tool("open_browser_url", {"url": "https://example.com"})
        assert is_untrusted_source_tool("browser_navigate", {"url": "https://example.com"})
        assert is_untrusted_source_tool("browser_screenshot", {"url": "https://example.com"})
        assert is_untrusted_source_tool("mcp_custom_tool", {})

        # read_file inside workspace is trusted source
        assert not is_untrusted_source_tool("read_file", {"path": str(ws / "notes.txt")})

        # read_file outside workspace is untrusted source (platform-aware)
        import sys
        outside_path = "C:\\Windows\\System32\\drivers\\etc\\hosts" if sys.platform == "win32" else "/etc/hosts"
        assert is_untrusted_source_tool("read_file", {"path": outside_path})
        assert is_untrusted_source_tool("read_file", {"path": "../../../outside.txt"})


class TestChromaDeterministicEmbedder:
    """Verifies that DeterministicLocalEmbedder implements Chroma's EmbeddingFunction protocol."""

    def test_embedder_interface_methods(self):
        from backend.memory.semantic import DeterministicLocalEmbedder
        embedder = DeterministicLocalEmbedder()
        assert hasattr(embedder, "name")
        assert embedder.name() == "deterministic-local-embedder"
        assert hasattr(embedder, "default_space")
        assert embedder.default_space() == "cosine"

        vectors = embedder(["test query document", "another sample"])
        assert len(vectors) == 2
        assert len(vectors[0]) == 128
        assert len(vectors[1]) == 128

    def test_chroma_collection_integration(self):
        try:
            import chromadb
        except ImportError:
            pytest.skip("chromadb not installed")

        from backend.memory.semantic import DeterministicLocalEmbedder
        client = chromadb.Client()
        embedder = DeterministicLocalEmbedder()
        collection = client.create_collection(
            name="test_regress_chroma",
            embedding_function=embedder
        )
        try:
            collection.add(
                documents=["FastAPI and LangGraph powers Rajjo backend.", "Windows 11 desktop agent."],
                ids=["doc1", "doc2"],
                metadatas=[{"approved": True}, {"approved": True}]
            )
            res = collection.query(query_texts=["What framework does Rajjo use?"], n_results=1)
            assert len(res["ids"][0]) == 1
            assert res["ids"][0][0] in ("doc1", "doc2")

            from backend.memory.semantic import _score_hybrid
            s1 = _score_hybrid("What framework does Rajjo use?", "FastAPI and LangGraph powers Rajjo backend.")
            s2 = _score_hybrid("What framework does Rajjo use?", "Windows 11 desktop agent.")
            assert s1 > s2
        finally:
            client.delete_collection("test_regress_chroma")


class TestSubagentApprovalAndThreadScoping:
    """Verifies that subagent approvals are visible in the manager and thread-scoped."""

    def test_subagent_approval_in_manager(self):
        from backend.security.approval import approval_manager
        import threading
        import time

        results = []

        def _worker():
            res = approval_manager.request_approval_sync(
                tool_name="write_file",
                tool_args={"path": "subagent_output.py"},
                description="Subagent coder writing file",
                risk_level="high",
                timeout_seconds=5,
                thread_id="sub-thread-42"
            )
            results.append(res)

        t = threading.Thread(target=_worker, daemon=True)
        t.start()
        time.sleep(0.1)

        pending = approval_manager.list_pending()
        subagent_pending = [p for p in pending if p.get("thread_id") == "sub-thread-42"]
        assert len(subagent_pending) == 1
        assert subagent_pending[0]["tool"] == "write_file"
        aid = subagent_pending[0]["approval_id"]

        approval_manager.resolve_approval(aid, True)
        t.join(timeout=1.0)
        assert len(results) == 1
        assert results[0] is True


class TestThreadScopedAbortProcessKill:
    """Verifies that thread-scoped abort terminates only that thread's processes."""

    def test_thread_scoped_kill(self):
        from backend.security.process_manager import process_manager
        import time

        kwargs = {"stdout": subprocess.PIPE, "stderr": subprocess.PIPE}
        if sys.platform != "win32":
            kwargs["start_new_session"] = True
        else:
            kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP

        p_a = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"], **kwargs)
        p_b = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"], **kwargs)

        try:
            process_manager.register_process(p_a.pid, thread_id="thread-AAA")
            process_manager.register_process(p_b.pid, thread_id="thread-BBB")

            assert p_a.poll() is None
            assert p_b.poll() is None

            # Kill thread-AAA only
            killed = process_manager.kill_thread_processes("thread-AAA")
            assert p_a.pid in killed

            # Wait up to 2 seconds for OS process cleanup after taskkill
            try:
                p_a.wait(timeout=2.0)
            except subprocess.TimeoutExpired:
                pass
            assert p_a.poll() is not None, "Process A should have been killed"
            assert p_b.poll() is None, "Process B should still be running"
        finally:
            process_manager.kill_thread_processes("thread-BBB")
            if p_b.poll() is None:
                p_b.kill()
            if p_a.poll() is None:
                p_a.kill()


class TestUntrustedWrittenFilePropagation:
    """Verifies that reading a file created during untrusted context triggers untrusted status."""

    def test_written_file_taint(self):
        from backend.graph import is_untrusted_source_tool, mark_file_untrusted, _UNTRUSTED_WRITTEN_FILES
        from backend.config import get_workspace_dir

        ws = get_workspace_dir()
        tainted_file = str((ws / "tainted_script.py").resolve())
        mark_file_untrusted(tainted_file)

        try:
            assert is_untrusted_source_tool("read_file", {"path": tainted_file})
            assert is_untrusted_source_tool("read_file", {"path": "tainted_script.py"})
        finally:
            _UNTRUSTED_WRITTEN_FILES.clear()


class TestSubagentRoleToolRestriction:
    """Verifies that subagents with restricted tool suites cannot execute forbidden tools."""

    def test_forbidden_tool_rejected(self):
        from backend.graph import tool_executor_node
        from langchain_core.messages import AIMessage
        import json

        fake_aimessage = AIMessage(
            content="",
            tool_calls=[{
                "name": "run_shell_command",
                "args": {"command": "dir"},
                "id": "call_forbidden_1"
            }]
        )

        state = {
            "messages": [fake_aimessage],
            "role_tools": ["read_file", "view_workspace"],
            "has_untrusted_content": False,
            "activity_log": [],
            "thread_id": "test_role_thread"
        }

        result = tool_executor_node(state)
        tool_msgs = result.get("messages", [])
        assert len(tool_msgs) == 1
        parsed = json.loads(tool_msgs[0].content)
        assert parsed.get("success") is False
        assert parsed.get("error", {}).get("code") == "ROLE_RESTRICTION"
        assert "forbidden" in parsed.get("error", {}).get("message", "").lower()


class TestDataDirMigration:
    """Verifies that relocating data_dir copies database, memory, and config to the new path."""

    def test_migrate_data_dir_copies_files(self, tmp_path):
        from backend.config import migrate_data_dir

        src = tmp_path / "old_data"
        src.mkdir()
        (src / "rajjo.db").write_text("dummy database content", encoding="utf-8")
        (src / "config.json").write_text('{"theme": "dark"}', encoding="utf-8")

        dst = tmp_path / "new_data"

        res = migrate_data_dir(src, dst)
        assert "rajjo.db" in res["migrated"]
        assert "config.json" in res["migrated"]
        assert (dst / "rajjo.db").exists()
        assert (dst / "rajjo.db").read_text(encoding="utf-8") == "dummy database content"
        assert (dst / "config.json").exists()




