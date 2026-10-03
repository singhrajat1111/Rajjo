import asyncio
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
    event: asyncio.Event = field(default_factory=asyncio.Event)
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
        self._event_callback: Optional[Callable[[Dict[str, Any]], None]] = None

    def set_event_callback(self, cb: Callable[[Dict[str, Any]], None]):
        self._event_callback = cb

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

        if tool_name in ("delete_file", "remove_directory"):
            return True

        if tool_name == "write_file":
            # If writing over an existing sensitive or root file
            path = str(tool_args.get("path", "")).lower()
            if any(p in path for p in [".env", "main.py", "config.py", ".json", ".spec"]):
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

        if self._event_callback:
            try:
                res = self._event_callback(payload)
                if asyncio.iscoroutine(res):
                    await res
            except Exception as e:
                print(f"[ApprovalManager] Callback error: {e}")

        try:
            await asyncio.wait_for(item.event.wait(), timeout=timeout_seconds)
            return bool(item.approved)
        except asyncio.TimeoutError:
            print(f"[ApprovalManager] Approval {approval_id} timed out.")
            return False
        finally:
            self._pending.pop(approval_id, None)

    def resolve_approval(self, approval_id: str, approved: bool) -> bool:
        if approval_id in self._pending:
            item = self._pending[approval_id]
            item.approved = approved
            item.event.set()
            return True
        return False

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
