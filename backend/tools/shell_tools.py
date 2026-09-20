import os
import subprocess
import time
import json
import re
from typing import Optional, List, Dict, Any
from langchain_core.tools import tool

try:
    from backend.config import load_settings, get_workspace_dir
except ImportError:
    from config import load_settings, get_workspace_dir

# Sensitive environment variables to strip from child processes
SENSITIVE_ENV_VARS = [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "GROQ_API_KEY",
    "OPENROUTER_API_KEY",
    "CUSTOM_API_KEY",
    "RAJJO_API_TOKEN",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_ACCESS_KEY_ID",
    "GITHUB_TOKEN",
    "GH_TOKEN"
]

# High-Risk / Destructive Command Patterns
HIGH_RISK_RULES = [
    # 1. System Root / Bulk Recursive Deletion
    (
        r"(^|\s|;)(rm\s+-[a-zA-Z]*r[a-zA-Z]*f?|rmdir\s+/[sS]|del\s+/[fF]\s+/[sS]|Remove-Item\s+.*-Recurse)\s+([/~]|c:\\|c:/|\$HOME|%USERPROFILE%|\.\.|\\\*|\/\*|\.\/|\.\/)",
        "Blocked bulk recursive deletion targeting system root, home directory, or parent paths."
    ),
    (
        r"\brm\s+-rf\s+(/|\*|~|/\*|~/.*|\$HOME.*|\.\.)(\s|$)",
        "Blocked recursive deletion targeting root or home filesystem."
    ),
    (
        r"\b(rmdir|del)\s+/[sS]\s+/[qQ]\s+[a-zA-Z]:\\",
        "Blocked mass recursive drive-level deletion."
    ),
    (
        r"\bRemove-Item\s+.*(-Recurse|-Force)\s+.*([a-zA-Z]:\\|\$HOME|~|/)",
        "Blocked mass recursive PowerShell deletion."
    ),
    # 2. Disk & Partition Manipulation
    (
        r"\b(format\s+[a-zA-Z]:|diskpart|fdisk|mkfs|dd\s+if=)",
        "Blocked disk formatting, partition alteration, or raw device manipulation."
    ),
    # 3. Remote Code Download and Pipe to Interpreter (Drive-by / Web RCE)
    (
        r"(curl|wget|fetch|iwr|Invoke-WebRequest)\s+.*(\|\s*(bash|sh|zsh|iex|Invoke-Expression|powershell|cmd))",
        "Blocked remote script download piped directly to command interpreter."
    ),
    # 4. Fork bombs and resource exhaustion attacks
    (
        r":\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:|%0\|%0",
        "Blocked fork-bomb resource exhaustion pattern."
    ),
    # 5. Privilege Escalation
    (
        r"\b(sudo\s+|runas\s+|Start-Process\s+.*-Verb\s+RunAs)",
        "Blocked privilege escalation attempt."
    ),
    # 6. Reverse Shells & Network Backdoors
    (
        r"(nc(\.exe)?|ncat(\.exe)?)\s+.*-e\s+|/dev/tcp/\d+|powershell.*-EncodedCommand\b",
        "Blocked reverse shell or obfuscated command execution pattern."
    ),
    # 7. Tampering with Credentials or Session Tokens
    (
        r"(\.session_token|secrets\.json|\.ssh[\\/]id_|\.aws[\\/]credentials)",
        "Blocked attempt to access or modify credential stores or session tokens via shell."
    )
]

def analyze_command_risk(command: str) -> Optional[str]:
    """
    Evaluates a command against multi-layer safety heuristics.
    Returns a violation explanation string if dangerous, or None if acceptable.
    """
    cmd_clean = command.strip()
    for pattern, reason in HIGH_RISK_RULES:
        if re.search(pattern, cmd_clean, re.IGNORECASE):
            return reason
    return None

def get_sanitized_environment() -> Dict[str, str]:
    """
    Builds a clean environment dictionary for subprocess execution,
    scrubbing any API keys, tokens, or Rajjo secrets to prevent exfiltration.
    """
    env = os.environ.copy()
    for var in SENSITIVE_ENV_VARS:
        env.pop(var, None)

    # Clean any dynamically named key/token environment variables
    for k in list(env.keys()):
        upper_k = k.upper()
        if upper_k.startswith("RAJJO_") or "API_KEY" in upper_k or ("SECRET" in upper_k and "KEY" in upper_k):
            env.pop(k, None)

    return env

@tool
def run_shell_command(command: str, timeout: Optional[int] = None) -> str:
    """
    Executes a shell command strictly inside the workspace boundary with sanitized environment.
    Args:
        command: The shell command line to run.
        timeout: Execution timeout in seconds (optional, defaults to configured setting).
    """
    settings = load_settings()
    configured_timeout = timeout or settings.get("shell_timeout", 30)
    workspace_root = get_workspace_dir().resolve()

    # Analyze safety policy
    risk_violation = analyze_command_risk(command)
    if risk_violation:
        return json.dumps({
            "success": False,
            "tool": "run_shell_command",
            "data": None,
            "error": {
                "code": "BLOCKED_DESTRUCTIVE_COMMAND",
                "message": f"Command was blocked by safety policy: {risk_violation}"
            },
            "metadata": {"command": command}
        }, indent=2)

    start_time = time.time()
    try:
        # Execute strictly in workspace_root with sanitized environment
        process = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=configured_timeout,
            cwd=str(workspace_root),
            env=get_sanitized_environment()
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
            "metadata": {
                "command": command,
                "workspace_cwd": str(workspace_root)
            }
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
