from typing import Dict, List, Any, Optional
from langchain_core.tools import BaseTool
try:
    from backend.tools.fs_tools import read_file, write_file, create_directory, list_dir, search_files
    from backend.tools.shell_tools import run_shell_command
    from backend.tools.web_search import web_search
    from backend.tools.browser_tools import open_browser_url, open_visible_browser, browser_navigate, browser_screenshot
except ImportError:
    from fs_tools import read_file, write_file, create_directory, list_dir, search_files
    from shell_tools import run_shell_command
    from web_search import web_search
    from browser_tools import open_browser_url, open_visible_browser, browser_navigate, browser_screenshot

ALL_TOOLS = [
    read_file,
    write_file,
    create_directory,
    list_dir,
    search_files,
    run_shell_command,
    web_search,
    open_browser_url,
    open_visible_browser,
    browser_navigate,
    browser_screenshot
]

class ToolRegistry:
    def __init__(self):
        self._tools: Dict[str, BaseTool] = {t.name: t for t in ALL_TOOLS}
        # By default all tools are enabled
        self._enabled_state: Dict[str, bool] = {name: True for name in self._tools}
        self._tool_categories = {
            "read_file": "Filesystem",
            "write_file": "Filesystem",
            "create_directory": "Filesystem",
            "list_dir": "Filesystem",
            "search_files": "Filesystem",
            "run_shell_command": "Shell Execution",
            "web_search": "Web Search",
            "open_browser_url": "Browser Control",
            "open_visible_browser": "Visible Window & Browser",
            "browser_navigate": "Browser Control",
            "browser_screenshot": "Browser Control"
        }

    def get_tool(self, name: str) -> Optional[BaseTool]:
        return self._tools.get(name)

    def get_active_tools(self) -> List[BaseTool]:
        return [t for name, t in self._tools.items() if self._enabled_state.get(name, True)]

    def is_enabled(self, name: str) -> bool:
        return self._enabled_state.get(name, True)

    def set_enabled(self, name: str, enabled: bool) -> bool:
        if name in self._tools:
            self._enabled_state[name] = enabled
            return True
        return False

    def list_tools_metadata(self) -> List[Dict[str, Any]]:
        meta = []
        for name, tool in self._tools.items():
            meta.append({
                "name": name,
                "description": tool.description or "",
                "category": self._tool_categories.get(name, "General"),
                "enabled": self._enabled_state.get(name, True),
                "args_schema": str(tool.args) if hasattr(tool, "args") else ""
            })
        return meta

registry = ToolRegistry()
