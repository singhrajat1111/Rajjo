import os
import shutil
import json
import re
from pathlib import Path
from typing import List, Dict, Any, Optional
from langchain_core.tools import tool

try:
    from backend.config import get_workspace_dir
except ImportError:
    from config import get_workspace_dir

# Blocked sensitive path patterns and file names
BLOCKED_SENSITIVE_PATTERNS = [
    r"[\\/]\.ssh([\\/]|$)",
    r"[\\/]\.aws([\\/]|$)",
    r"[\\/]\.gnupg([\\/]|$)",
    r"[\\/]\.session_token$",
    r"[\\/]secrets\.json$",
    r"[\\/]\.env(\..+)?$",
    r"^[a-zA-Z]:[\\/](windows|system32|syswow64)($|[\\/])",
    r"^[\\/](etc|root|proc|sys|boot|dev)($|[\\/])",
]

class SecurityPathViolation(Exception):
    """Raised when a path breaches the workspace boundary or targets sensitive files."""
    pass

def safe_resolve_path(target_path: str) -> Path:
    """
    Safely resolves a file/directory path strictly within the active workspace root.
    Guards against:
    - Path traversal (e.g. ../../Windows)
    - Symlink redirection outside workspace
    - Direct access to sensitive credential stores (.ssh, .aws, .session_token, secrets.json)
    """
    if not target_path or not str(target_path).strip():
        raise SecurityPathViolation("Path argument cannot be empty.")

    clean_str = str(target_path).strip()
    workspace_root = get_workspace_dir().resolve()

    target = Path(clean_str)
    if not target.is_absolute():
        resolved = (workspace_root / target).resolve()
    else:
        resolved = target.resolve()

    # Enforce workspace boundary jail
    try:
        is_inside = resolved.is_relative_to(workspace_root)
    except AttributeError:
        is_inside = str(resolved).lower().startswith(str(workspace_root).lower())

    if not is_inside:
        raise SecurityPathViolation(
            f"Path '{clean_str}' resolves outside the allowed workspace boundary ({workspace_root})."
        )

    # Check against blocked sensitive path patterns
    resolved_str = str(resolved).lower()
    for pattern in BLOCKED_SENSITIVE_PATTERNS:
        if re.search(pattern, resolved_str, re.IGNORECASE):
            raise SecurityPathViolation(
                f"Access to protected system or credential path '{clean_str}' is denied by security policy."
            )

    return resolved

def _format_result(tool_name: str, success: bool, data: Any = None, error_code: Optional[str] = None, error_msg: Optional[str] = None, metadata: Optional[dict] = None) -> str:
    res = {
        "success": success,
        "tool": tool_name,
        "data": data,
        "error": {"code": error_code, "message": error_msg} if not success else None,
        "metadata": metadata or {}
    }
    return json.dumps(res, indent=2)

@tool
def read_file(path: str, max_chars: int = 20000) -> str:
    """
    Reads the text content of a file within the workspace boundary.
    Args:
        path: Path to the file to read (relative to workspace or within workspace root).
        max_chars: Maximum characters to read (default: 20000).
    """
    try:
        p = safe_resolve_path(path)
    except SecurityPathViolation as spv:
        return _format_result("read_file", False, error_code="ACCESS_DENIED_PATH_RESTRICTION", error_msg=str(spv))

    try:
        if not p.exists():
            return _format_result("read_file", False, error_code="FILE_NOT_FOUND", error_msg=f"File not found: {path}")
        if p.is_dir():
            return _format_result("read_file", False, error_code="IS_A_DIRECTORY", error_msg=f"Path is a directory, not a file: {path}")

        file_size = p.stat().st_size
        with open(p, "r", encoding="utf-8", errors="replace") as f:
            content = f.read(max_chars)
        
        truncated = file_size > max_chars
        return _format_result(
            "read_file",
            True,
            data={"content": content, "size_bytes": file_size, "truncated": truncated},
            metadata={"path": str(p)}
        )
    except Exception as e:
        return _format_result("read_file", False, error_code="READ_ERROR", error_msg=str(e))

@tool
def write_file(path: str, content: str) -> str:
    """
    Writes content to a file within the workspace boundary. Creates parent directories if needed.
    Args:
        path: Path to the file to write (must be within workspace root).
        content: Text content to write into the file.
    """
    try:
        p = safe_resolve_path(path)
    except SecurityPathViolation as spv:
        return _format_result("write_file", False, error_code="ACCESS_DENIED_PATH_RESTRICTION", error_msg=str(spv))

    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write(content)
        return _format_result(
            "write_file",
            True,
            data={"path": str(p), "bytes_written": len(content.encode("utf-8"))},
            metadata={"status": "written"}
        )
    except Exception as e:
        return _format_result("write_file", False, error_code="WRITE_ERROR", error_msg=str(e))

@tool
def create_directory(path: str) -> str:
    """
    Creates a new directory within the workspace boundary.
    Args:
        path: Directory path to create (must be within workspace root).
    """
    try:
        p = safe_resolve_path(path)
    except SecurityPathViolation as spv:
        return _format_result("create_directory", False, error_code="ACCESS_DENIED_PATH_RESTRICTION", error_msg=str(spv))

    try:
        p.mkdir(parents=True, exist_ok=True)
        return _format_result("create_directory", True, data={"path": str(p)})
    except Exception as e:
        return _format_result("create_directory", False, error_code="MKDIR_ERROR", error_msg=str(e))

@tool
def list_dir(path: str = ".") -> str:
    """
    Lists files and directories in the given path within the workspace boundary.
    Args:
        path: Path to directory (default is workspace root).
    """
    try:
        p = safe_resolve_path(path)
    except SecurityPathViolation as spv:
        return _format_result("list_dir", False, error_code="ACCESS_DENIED_PATH_RESTRICTION", error_msg=str(spv))

    try:
        if not p.exists():
            return _format_result("list_dir", False, error_code="DIR_NOT_FOUND", error_msg=f"Directory not found: {path}")
        if not p.is_dir():
            return _format_result("list_dir", False, error_code="NOT_A_DIR", error_msg=f"Path is not a directory: {path}")

        items = []
        for entry in os.scandir(p):
            try:
                # Do not expose blocked hidden sensitive files in directory listing
                if entry.name in (".session_token", "secrets.json", ".env"):
                    continue
                is_dir = entry.is_dir()
                size = entry.stat().st_size if not is_dir else 0
                items.append({
                    "name": entry.name,
                    "is_directory": is_dir,
                    "size_bytes": size
                })
            except Exception:
                continue

        # Sort directories first, then alphabetical
        items.sort(key=lambda x: (not x["is_directory"], x["name"].lower()))
        return _format_result("list_dir", True, data={"items": items, "count": len(items)}, metadata={"path": str(p)})
    except Exception as e:
        return _format_result("list_dir", False, error_code="LIST_ERROR", error_msg=str(e))

@tool
def search_files(query: str, path: str = ".", max_results: int = 50) -> str:
    """
    Searches for files matching query text or filename within the workspace boundary.
    Args:
        query: String to search for within file contents or filenames.
        path: Root directory to begin search (must be within workspace).
        max_results: Maximum matching results to return.
    """
    try:
        root_path = safe_resolve_path(path)
    except SecurityPathViolation as spv:
        return _format_result("search_files", False, error_code="ACCESS_DENIED_PATH_RESTRICTION", error_msg=str(spv))

    matches = []
    try:
        if not root_path.exists():
            return _format_result("search_files", False, error_code="PATH_NOT_FOUND", error_msg=f"Search path not found: {path}")

        for root, dirs, files in os.walk(root_path):
            # Skip hidden, cache, and sensitive folders
            dirs[:] = [
                d for d in dirs
                if not d.startswith(".") and d not in ("node_modules", "venv", "__pycache__", "dist", "build", ".ssh", ".aws")
            ]
            for file in files:
                if len(matches) >= max_results:
                    break
                # Skip sensitive files
                if file in (".session_token", "secrets.json", ".env") or file.endswith(".key"):
                    continue

                file_path = Path(root) / file
                # Check filename match
                if query.lower() in file.lower():
                    matches.append({"path": str(file_path), "match_type": "filename"})
                    continue
                # Check content match for reasonably sized files (< 1MB)
                try:
                    if file_path.stat().st_size < 1_000_000:
                        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                            if query in f.read():
                                matches.append({"path": str(file_path), "match_type": "content"})
                except Exception:
                    continue

        return _format_result("search_files", True, data={"matches": matches, "total_matches": len(matches)})
    except Exception as e:
        return _format_result("search_files", False, error_code="SEARCH_ERROR", error_msg=str(e))
