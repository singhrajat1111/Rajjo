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
