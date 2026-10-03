import os
import subprocess
import time
import json
import re
import asyncio
from typing import Optional, List, Dict, Any
from langchain_core.tools import tool

try:
    from backend.config import load_settings, get_workspace_dir
    from backend.security.approval import approval_manager
    from backend.security.process_manager import process_manager
except ImportError:
    from config import load_settings, get_workspace_dir
    from security.approval import approval_manager
    from security.process_manager import process_manager

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
    # 1. System Root / Bulk Recursive Deletion (handles all flag orders: -rf, -r -f, -f -r)
    (
        r"(^|\s|;)(rm\s+.*-[a-zA-Z]*r.*-[a-zA-Z]*f|rm\s+-[a-zA-Z]*r[a-zA-Z]*f?|rmdir\s+/[sS]|del\s+/[fF]\s+/[sS]|Remove-Item\s+.*(-Recurse|-Force))\s+([/~]|c:\\|c:/|\$HOME|%USERPROFILE%|\.\.|\\\*|\/\*|\.\/|\.\/|/home)",
        "Blocked bulk recursive deletion targeting system root, home directory, or parent paths."
    ),
    (
        r"\brm\s+.*(-r|-f).*(/|\*|~|/\*|~/.*|\$HOME.*|\.\.|/home)(\s|$)",
        "Blocked recursive deletion targeting root, home, or system filesystem."
    ),
    (
        r"\b(rmdir|del)\s+/[sS]\s+/[qQ]\s+[a-zA-Z]:\\",
        "Blocked mass recursive drive-level deletion."
    ),
    (
        r"\bGet-ChildItem\b.*(-Recurse|-Filter).*\|\s*Remove-Item\b",
        "Blocked piped PowerShell recursive deletion."
    ),
    (
        r"\bRemove-Item\s+.*(-Recurse|-Force)\s+.*([a-zA-Z]:\\|\$HOME|~|/)",
        "Blocked mass recursive PowerShell deletion."
    ),
    (
        r"\bfind\s+.*-delete\b",
        "Blocked find command with -delete flag."
    ),
    # 2. System Power / Halt
    (
        r"\b(shutdown|reboot|poweroff|init\s+0)\b",
        "Blocked system shutdown, reboot, or poweroff command."
    ),
    # 3. Forced Git Operations
    (
        r"\bgit\s+push\s+.*(--force|-f)\b",
        "Blocked forced git push."
    ),
    # 4. Sensitive System Credential Files
    (
        r"\b(cat|type|Get-Content)\s+.*(/etc/passwd|/etc/shadow|\.ssh[\\/]id_|\.env|secrets\.json)",
        "Blocked shell read targeting sensitive credentials or password files."
    ),
    # 5. Disk & Partition Manipulation
    (
        r"\b(format\s+[a-zA-Z]:|diskpart|fdisk|mkfs|dd\s+if=)",
        "Blocked disk formatting, partition alteration, or raw device manipulation."
    ),
    # 6. Remote Code Download and Pipe to Interpreter (Drive-by / Web RCE)
    (
        r"(curl|wget|fetch|iwr|Invoke-WebRequest)\s+.*(\|\s*(bash|sh|zsh|iex|Invoke-Expression|powershell|cmd))",
        "Blocked remote script download piped directly to command interpreter."
    ),
    # 7. Fork bombs and resource exhaustion attacks
    (
        r":\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:|%0\|%0",
        "Blocked fork-bomb resource exhaustion pattern."
    ),
    # 8. Privilege Escalation
    (
        r"\b(sudo\s+|runas\s+|Start-Process\s+.*-Verb\s+RunAs)",
        "Blocked privilege escalation attempt."
    ),
    # 9. Reverse Shells & Network Backdoors
    (
        r"(nc(\.exe)?|ncat(\.exe)?)\s+.*-e\s+|/dev/tcp/\d+|powershell.*-EncodedCommand\b",
        "Blocked reverse shell or obfuscated command execution pattern."
    ),
    # 10. Tampering with Credentials or Session Tokens
    (
        r"(\.session_token|secrets\.json|\.ssh[\\/]id_|\.aws[\\/]credentials)",
        "Blocked attempt to access or modify credential stores or session tokens via shell."
    ),
    # 11. Inline Interpreter Destructive Invocations
    (
        r"\b(python\d?|node|perl|ruby|php)\s+(-c|-e)\s+.*(rmtree|unlink|remove\(|rmdir|system\(|subprocess|shutil|exec\(|eval\()",
        "Blocked inline script execution attempting destructive filesystem or process operations."
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

    for k in list(env.keys()):
        upper_k = k.upper()
        if upper_k.startswith("RAJJO_") or "API_KEY" in upper_k or ("SECRET" in upper_k and "KEY" in upper_k):
            env.pop(k, None)

    return env

@tool
def run_shell_command(command: str, timeout: Optional[int] = None) -> str:
    """
    Executes a shell command strictly inside the workspace boundary with sanitized environment.
    Supports approval gating for destructive actions and killable process tree management.
    Args:
        command: The shell command line to run.
        timeout: Execution timeout in seconds (optional, defaults to configured setting).
    """
    settings = load_settings()
    configured_timeout = timeout or settings.get("shell_timeout", 30)
    workspace_root = get_workspace_dir().resolve()

    # 1. Analyze safety policy
    risk_violation = analyze_command_risk(command)
    requires_approval = (
        bool(risk_violation)
        or settings.get("shell_confirm_destructive", True)
        or approval_manager.is_destructive_shell_command(command)
    )

    # 2. Enforce Approval Gate if required
    if requires_approval:
        try:
            loop = None
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                loop = None

            desc = f"Shell command execution requested: '{command}'"
            if risk_violation:
                desc += f" [Security Warning: {risk_violation}]"

            approved = False
            if loop and loop.is_running():
                future = asyncio.run_coroutine_threadsafe(
                    approval_manager.request_approval(
                        tool_name="run_shell_command",
                        tool_args={"command": command},
                        description=desc,
                        risk_level="high" if risk_violation else "normal"
                    ),
                    loop
                )
                approved = future.result(timeout=120)
            else:
                approved = asyncio.run(
                    approval_manager.request_approval(
                        tool_name="run_shell_command",
                        tool_args={"command": command},
                        description=desc,
                        risk_level="high" if risk_violation else "normal"
                    )
                )

            if not approved:
                return json.dumps({
                    "success": False,
                    "tool": "run_shell_command",
                    "data": None,
                    "error": {
                        "code": "USER_REJECTED",
                        "message": f"Execution was denied or timed out by the user approval gate: {command}"
                    },
                    "metadata": {"command": command}
                }, indent=2)

        except Exception as e:
            # If approval cannot be completed, block execution for safety
            return json.dumps({
                "success": False,
                "tool": "run_shell_command",
                "data": None,
                "error": {
                    "code": "APPROVAL_GATE_ERROR",
                    "message": f"Approval check failed: {str(e)}"
                },
                "metadata": {"command": command}
            }, indent=2)

    # 3. Execute with tracked process tree
    start_time = time.time()
    proc = None
    try:
        proc = subprocess.Popen(
            command,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=str(workspace_root),
            env=get_sanitized_environment()
        )
        process_manager.register_process(proc.pid)

        stdout, stderr = proc.communicate(timeout=configured_timeout)
        duration = round(time.time() - start_time, 3)
        stdout_clean = stdout.strip() if stdout else ""
        stderr_clean = stderr.strip() if stderr else ""
        success = (proc.returncode == 0)

        return json.dumps({
            "success": success,
            "tool": "run_shell_command",
            "data": {
                "stdout": stdout_clean,
                "stderr": stderr_clean,
                "exit_code": proc.returncode,
                "duration_seconds": duration
            },
            "error": {
                "code": f"EXIT_{proc.returncode}",
                "message": stderr_clean or f"Process exited with non-zero code {proc.returncode}"
            } if not success else None,
            "metadata": {
                "command": command,
                "workspace_cwd": str(workspace_root)
            }
        }, indent=2)

    except subprocess.TimeoutExpired:
        if proc:
            process_manager.kill_process_tree(proc.pid)
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
        if proc:
            process_manager.kill_process_tree(proc.pid)
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

    finally:
        if proc:
            process_manager.unregister_process(proc.pid)
