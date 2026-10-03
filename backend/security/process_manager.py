import os
import sys
import subprocess
import signal
from typing import Dict, Optional, Set

class ProcessManager:
    """
    Tracks and terminates external processes.
    Guarantees clean process tree termination (killing child processes) upon abort.
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
                # Send SIGKILL to the entire process group
                pgid = os.getpgid(pid)
                os.killpg(pgid, signal.SIGKILL)
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
