import asyncio
import threading
import uuid
import re
from typing import Dict, Any, Optional, Callable
from dataclasses import dataclass, field

@dataclass
class PendingApproval:
    approval_id: str
    tool_name: str
    tool_args: Dict[str, Any]
    description: str
    risk_level: str
    # asyncio.Event for async callers, threading.Event for sync/worker-thread callers
    async_event: asyncio.Event = field(default_factory=asyncio.Event)
    sync_event: threading.Event = field(default_factory=threading.Event)
    approved: Optional[bool] = None

class ApprovalManager:
    """
    Coordinates human-in-the-loop approval gating for sensitive or destructive actions:
    - Destructive shell commands (rm, del, kill, shutdown, git push --force, format, etc.)
    - Any shell command when 'shell_confirm_destructive' setting is enabled
    - File writes/overwrites outside temporary/scratch workspace paths
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

    def requires_approval(self, tool_name: str, tool_args: Dict[str, Any], settings: Dict[str, Any]) -> bool:
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

        # Gate all write operations by default (except explicit scratch directory if designated)
        if tool_name in ("write_file", "copy_file"):
            path = str(tool_args.get("path") or tool_args.get("destination", "")).lower()
            # Scratch paths can optionally be bypassed, but outside scratch/ requires approval
            if "scratch" not in path:
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
        timeout_seconds: float = 120.0
    ) -> bool:
        approval_id = str(uuid.uuid4())
        item = PendingApproval(
            approval_id=approval_id,
            tool_name=tool_name,
            tool_args=tool_args,
            description=description,
            risk_level=risk_level
        )
        self._pending[approval_id] = item

        payload = {
            "type": "approval_required",
            "approval_id": approval_id,
            "tool": tool_name,
            "args": tool_args,
            "description": description,
            "risk_level": risk_level
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
    ) -> bool:
        """
        Thread-safe, blocking approval request for use from worker threads
        (e.g. LangGraph tool executors running via run_in_executor).

        Uses threading.Event so it never touches an asyncio event loop from
        the wrong thread, which is what caused the original 120-second stall.
        The SSE event-callback is called synchronously (put_nowait is thread-safe).
        """
        approval_id = str(uuid.uuid4())
        item = PendingApproval(
            approval_id=approval_id,
            tool_name=tool_name,
            tool_args=tool_args,
            description=description,
            risk_level=risk_level,
        )
        self._pending[approval_id] = item

        payload = {
            "type": "approval_required",
            "approval_id": approval_id,
            "tool": tool_name,
            "args": tool_args,
            "description": description,
            "risk_level": risk_level,
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

    def clear_all_pending(self, approved: bool = False):
        """Rejects and clears all pending approvals immediately (used on abort/disconnect)."""
        pending_ids = list(self._pending.keys())
        for aid in pending_ids:
            self.resolve_approval(aid, approved)
        self._pending.clear()

    def list_pending(self) -> list:
        return [
            {
                "approval_id": k,
                "tool": v.tool_name,
                "args": v.tool_args,
                "description": v.description,
                "risk_level": v.risk_level
            }
            for k, v in self._pending.items()
        ]

approval_manager = ApprovalManager()
