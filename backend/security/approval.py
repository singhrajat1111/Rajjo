import asyncio
import threading
import uuid
import re
from pathlib import Path
from typing import Dict, Any, Optional, Callable, Set
from dataclasses import dataclass, field

@dataclass
class PendingApproval:
    approval_id: str
    tool_name: str
    tool_args: Dict[str, Any]
    description: str
    risk_level: str
    thread_id: Optional[str] = None
    # asyncio.Event for async callers, threading.Event for sync/worker-thread callers
    async_event: asyncio.Event = field(default_factory=asyncio.Event)
    sync_event: threading.Event = field(default_factory=threading.Event)
    approved: Optional[bool] = None

class ApprovalManager:
    """
    Coordinates human-in-the-loop approval gating for sensitive or destructive actions:
    - Destructive shell commands (rm, del, kill, shutdown, git push --force, format, etc.)
    - Any shell command when 'shell_confirm_destructive' setting is enabled
    - Any shell, write, or external dispatch action once untrusted context is present
    - File writes/overwrites outside workspace scratch/ directory
    - File deletions
    - Network dispatches / sends
    """

    def __init__(self):
        self._pending: Dict[str, PendingApproval] = {}
        self._callbacks: Set[Callable[[Dict[str, Any]], None]] = set()

    def add_event_callback(self, cb: Callable[[Dict[str, Any]], None]):
        self._callbacks.add(cb)

    def remove_event_callback(self, cb: Callable[[Dict[str, Any]], None]):
        self._callbacks.discard(cb)

    def set_event_callback(self, cb: Callable[[Dict[str, Any]], None]):
        # Backward compatibility
        self._callbacks.clear()
        self._callbacks.add(cb)

    def is_destructive_shell_command(self, command: str) -> bool:
        cmd = command.strip().lower()
        patterns = [
            r"\b(rm|rmdir|del|remove-item)\b",
            r"\b(delete|unlink|erase)\b",
            r"\b(format|diskpart|fdisk|mkfs)\b",
            r"\b(shutdown|reboot|poweroff|init\s+0)\b",
            r"\bgit\s+push\s+.*(--force|-f)\b",
            r"\bgit\s+reset\s+--hard\b",
            r"\bfind\s+.*-delete\b",
            r"\bkill\b|\btaskkill\b",
            r">.*(/etc/|c:\\windows|\.ssh|secrets\.json)",
            r"curl.*\|\s*(bash|sh|powershell|cmd)",
            r":\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;",
        ]
        return any(re.search(pat, cmd, re.IGNORECASE) for pat in patterns)

    def requires_approval(
        self,
        tool_name: str,
        tool_args: Dict[str, Any],
        settings: Dict[str, Any],
        untrusted_context: bool = False
    ) -> bool:
        # Prompt-injection trust boundary:
        # If untrusted external content (web page, MCP output, browser DOM) is in context,
        # require approval for all shell execution, filesystem mutations, and external network sends.
        if untrusted_context:
            if (
                tool_name in ("run_shell_command", "write_file", "copy_file", "delete_file", "remove_directory")
                or tool_name.startswith("mcp_")
                or "send" in tool_name
                or "dispatch" in tool_name
            ):
                return True

        confirm_destructive = settings.get("shell_confirm_destructive", True)

        if tool_name == "run_shell_command":
            cmd = tool_args.get("command", "")
            if confirm_destructive:
                return True
            if self.is_destructive_shell_command(cmd):
                return True

        # File deletion is always gated
        if tool_name in ("delete_file", "remove_directory"):
            return True

        # Gate all write operations outside workspace/scratch/
        if tool_name in ("write_file", "copy_file"):
            target_str = str(tool_args.get("path") or tool_args.get("destination", "")).strip()
            if not target_str:
                return True
            try:
                try:
                    from backend.config import get_workspace_dir
                except ImportError:
                    from config import get_workspace_dir
                ws = get_workspace_dir().resolve()
                scratch_dir = (ws / "scratch").resolve()
                target_path = Path(target_str)
                resolved_target = target_path.resolve() if target_path.is_absolute() else (ws / target_path).resolve()
                try:
                    resolved_target.relative_to(scratch_dir)
                    is_scratch = True
                except ValueError:
                    is_scratch = False
            except Exception:
                is_scratch = False

            if not is_scratch:
                return True

        # MCP tools and any external network dispatch tools are gated
        if tool_name.startswith("mcp_") or "send" in tool_name or "dispatch" in tool_name:
            return True

        return False

    async def request_approval(
        self,
        tool_name: str,
        tool_args: Dict[str, Any],
        description: str,
        risk_level: str = "high",
        timeout_seconds: float = 120.0,
        thread_id: Optional[str] = None
    ) -> bool:
        approval_id = str(uuid.uuid4())
        item = PendingApproval(
            approval_id=approval_id,
            tool_name=tool_name,
            tool_args=tool_args,
            description=description,
            risk_level=risk_level,
            thread_id=thread_id
        )
        self._pending[approval_id] = item

        payload = {
            "type": "approval_required",
            "approval_id": approval_id,
            "tool": tool_name,
            "args": tool_args,
            "description": description,
            "risk_level": risk_level,
            "thread_id": thread_id
        }

        for cb in list(self._callbacks):
            try:
                res = cb(payload)
                if asyncio.iscoroutine(res):
                    await res
            except Exception as e:
                print(f"[ApprovalManager] Callback error: {e}")

        try:
            await asyncio.wait_for(item.async_event.wait(), timeout=timeout_seconds)
            return bool(item.approved)
        except asyncio.TimeoutError:
            print(f"[ApprovalManager] Approval {approval_id} timed out.")
            return False
        finally:
            self._pending.pop(approval_id, None)

    def request_approval_sync(
        self,
        tool_name: str,
        tool_args: Dict[str, Any],
        description: str,
        risk_level: str = "high",
        timeout_seconds: float = 120.0,
        thread_id: Optional[str] = None
    ) -> bool:
        """
        Thread-safe, blocking approval request for use from worker threads
        (e.g. LangGraph tool executors running via run_in_executor).
        """
        approval_id = str(uuid.uuid4())
        item = PendingApproval(
            approval_id=approval_id,
            tool_name=tool_name,
            tool_args=tool_args,
            description=description,
            risk_level=risk_level,
            thread_id=thread_id
        )
        self._pending[approval_id] = item

        payload = {
            "type": "approval_required",
            "approval_id": approval_id,
            "tool": tool_name,
            "args": tool_args,
            "description": description,
            "risk_level": risk_level,
            "thread_id": thread_id
        }

        for cb in list(self._callbacks):
            try:
                cb(payload)
            except Exception as e:
                print(f"[ApprovalManager] Callback error (sync): {e}")

        signalled = item.sync_event.wait(timeout=timeout_seconds)
        self._pending.pop(approval_id, None)
        if not signalled:
            print(f"[ApprovalManager] Approval {approval_id} timed out (sync).")
            return False
        return bool(item.approved)

    def resolve_approval(self, approval_id: str, approved: bool) -> bool:
        if approval_id in self._pending:
            item = self._pending[approval_id]
            item.approved = approved
            # Wake up both async and sync waiters
            if hasattr(item, "sync_event") and item.sync_event:
                item.sync_event.set()
            if hasattr(item, "event") and item.event:
                item.event.set()
            try:
                loop = asyncio.get_running_loop()
                if loop and loop.is_running() and hasattr(item, "async_event"):
                    loop.call_soon_threadsafe(item.async_event.set)
            except RuntimeError:
                if hasattr(item, "async_event") and item.async_event:
                    item.async_event.set()
            return True
        return False

    def clear_all_pending(self, approved: bool = False, thread_id: Optional[str] = None):
        """Rejects and clears pending approvals. If thread_id is specified, only that thread's approvals are cleared."""
        if thread_id is not None:
            pending_ids = [aid for aid, item in self._pending.items() if getattr(item, "thread_id", None) == thread_id]
        else:
            pending_ids = list(self._pending.keys())
        for aid in pending_ids:
            self.resolve_approval(aid, approved)
            self._pending.pop(aid, None)

    def list_pending(self) -> list:
        return [
            {
                "approval_id": k,
                "tool": v.tool_name,
                "args": v.tool_args,
                "description": v.description,
                "risk_level": v.risk_level,
                "thread_id": v.thread_id
            }
            for k, v in self._pending.items()
        ]

approval_manager = ApprovalManager()
