import subprocess
import time
import json
import re
from typing import Optional, List
from langchain_core.tools import tool
try:
    from backend.config import load_settings
except ImportError:
    from config import load_settings

DANGEROUS_PATTERNS = [
    r"\brmdir\s+/[sS]\s+/[qQ]\s+[cC]:\\",
    r"\brm\s+-rf\s+/\s*$",
    r"\bdel\s+/[fF]\s+/[sS]\s+/[qQ]\s+[cC]:\\",
    r"\bformat\s+[a-zA-Z]:",
    r"\bdiskpart\b",
    r":\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:", # forkbomb
]

def is_dangerous_command(cmd: str) -> bool:
    for pattern in DANGEROUS_PATTERNS:
        if re.search(pattern, cmd, re.IGNORECASE):
            return True
    return False

@tool
def run_shell_command(command: str, timeout: Optional[int] = None) -> str:
    """
    Executes a shell command on the local system and returns stdout, stderr, exit code, and execution time.
    Args:
        command: The shell command line to run.
        timeout: Execution timeout in seconds (optional, defaults to configured setting).
    """
    settings = load_settings()
    configured_timeout = timeout or settings.get("shell_timeout", 30)

    # Check for destructive commands
    if is_dangerous_command(command):
        return json.dumps({
            "success": False,
            "tool": "run_shell_command",
            "data": None,
            "error": {
                "code": "BLOCKED_DESTRUCTIVE_COMMAND",
                "message": "Command was blocked by safety policy because it appears destructive to system root or disk partitions."
            },
            "metadata": {"command": command}
        }, indent=2)

    start_time = time.time()
    try:
        process = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=configured_timeout
        )
        duration = round(time.time() - start_time, 3)
        stdout = process.stdout.strip()
        stderr = process.stderr.strip()
        success = (process.returncode == 0)

        return json.dumps({
            "success": success,
            "tool": "run_shell_command",
            "data": {
                "stdout": stdout,
                "stderr": stderr,
                "exit_code": process.returncode,
                "duration_seconds": duration
            },
            "error": {
                "code": f"EXIT_{process.returncode}",
                "message": stderr or f"Process exited with non-zero code {process.returncode}"
            } if not success else None,
            "metadata": {"command": command}
        }, indent=2)

    except subprocess.TimeoutExpired:
        duration = round(time.time() - start_time, 3)
        return json.dumps({
            "success": False,
            "tool": "run_shell_command",
            "data": None,
            "error": {
                "code": "TIMEOUT_EXPIRED",
                "message": f"Command timed out after {configured_timeout} seconds."
            },
            "metadata": {"command": command, "duration_seconds": duration}
        }, indent=2)

    except Exception as e:
        return json.dumps({
            "success": False,
            "tool": "run_shell_command",
            "data": None,
            "error": {
                "code": "EXECUTION_FAILED",
                "message": str(e)
            },
            "metadata": {"command": command}
        }, indent=2)
