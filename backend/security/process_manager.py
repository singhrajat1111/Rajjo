import os
import sys
import subprocess
import signal
from typing import Dict, Optional, Set

# Our own process group ID — we must never send SIGKILL to this group,
# or we'll terminate the backend process itself.
_OWN_PGID: Optional[int] = None
try:
    _OWN_PGID = os.getpgid(os.getpid())
except Exception:
    pass


class ProcessManager:
    """
    Tracks and terminates external processes spawned by the agent.

    Key guarantee on POSIX: child processes are started in their OWN session
    (start_new_session=True in Popen), so killpg never targets the backend's
    own process group. On Windows, CREATE_NEW_PROCESS_GROUP achieves the same.
    """
    def __init__(self):
        self._active_pids: Set[int] = set()
        self._abort_requested: bool = False

    def register_process(self, pid: int):
        self._active_pids.add(pid)

    def unregister_process(self, pid: int):
        self._active_pids.discard(pid)

    def kill_process_tree(self, pid: int):
        if not pid:
            return
        print(f"[ProcessManager] Killing process tree for PID: {pid}")
        if sys.platform == "win32":
            try:
                # /F = Forcefully terminate, /T = Terminate tree (all children)
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(pid)],
                    capture_output=True,
                    timeout=5
                )
            except Exception as e:
                print(f"[ProcessManager] Error running taskkill on {pid}: {e}")
        else:
            try:
                pgid = os.getpgid(pid)
                # SAFETY GUARD: never kill our own process group
                if _OWN_PGID is not None and pgid == _OWN_PGID:
                    print(f"[ProcessManager] SAFETY: refusing to kill own pgid={pgid}; falling back to direct kill.")
                    os.kill(pid, signal.SIGKILL)
                else:
                    os.killpg(pgid, signal.SIGKILL)
            except ProcessLookupError:
                pass  # process already gone
            except Exception:
                try:
                    os.kill(pid, signal.SIGKILL)
                except Exception as e:
                    print(f"[ProcessManager] Error killing POSIX process {pid}: {e}")
        self.unregister_process(pid)

    def kill_all(self):
        """Kill all registered active process trees."""
        pids = list(self._active_pids)
        for pid in pids:
            self.kill_process_tree(pid)
        self._active_pids.clear()

process_manager = ProcessManager()
