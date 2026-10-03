import os
import sys
import json
import subprocess
import threading
import time
from typing import Dict, Any, List, Optional
from langchain_core.tools import tool, StructuredTool
from pydantic import create_model, Field

try:
    from backend.config import load_settings, save_settings
    from backend.tools.registry import registry
except ImportError:
    from config import load_settings, save_settings
    from tools.registry import registry


class MCPClientConnection:
    """
    Stdio-based JSON-RPC client connection for Model Context Protocol servers.
    """
    def __init__(self, name: str, command: str, args: List[str], env: Optional[Dict[str, str]] = None):
        self.name = name
        self.command = command
        self.args = args
        self.env = env or {}
        self.process: Optional[subprocess.Popen] = None
        self._lock = threading.Lock()
        self._req_id = 0
        self.tools: List[Dict[str, Any]] = []
        self.connected = False
        self.error_message = ""

    def connect(self) -> bool:
        with self._lock:
            try:
                full_env = os.environ.copy()
                full_env.update(self.env)
                # Ensure node and python paths are resolvable
                cmd_list = [self.command] + self.args
                self.process = subprocess.Popen(
                    cmd_list,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    bufsize=1,
                    env=full_env,
                    shell=(sys.platform == "win32")
                )

                # Send initialize request
                init_res = self._send_request("initialize", {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "clientInfo": {"name": "RajjoDesktop", "version": "2.0.0"}
                })
                if not init_res:
                    self.error_message = "No response to initialize handshake"
                    self.connected = False
                    return False

                # Send initialized notification
                self._send_notification("notifications/initialized", {})

                # Query tools
                tools_res = self._send_request("tools/list", {})
                if tools_res and "result" in tools_res and "tools" in tools_res["result"]:
                    self.tools = tools_res["result"]["tools"]
                self.connected = True
                self.error_message = ""
                return True
            except Exception as e:
                self.connected = False
                self.error_message = str(e)
                print(f"[MCPClient:{self.name}] Connection failed: {e}")
                return False

    def disconnect(self):
        with self._lock:
            if self.process:
                try:
                    self.process.terminate()
                    self.process.wait(timeout=2)
                except Exception:
                    try:
                        self.process.kill()
                    except Exception:
                        pass
                self.process = None
            self.connected = False

    def _send_request(self, method: str, params: Dict[str, Any], timeout: float = 10.0) -> Optional[Dict[str, Any]]:
        if not self.process or self.process.poll() is not None:
            return None
        self._req_id += 1
        req = {
            "jsonrpc": "2.0",
            "id": self._req_id,
            "method": method,
            "params": params
        }
        req_line = json.dumps(req) + "\n"
        try:
            self.process.stdin.write(req_line)
            self.process.stdin.flush()
            start = time.time()
            while time.time() - start < timeout:
                line = self.process.stdout.readline()
                if line:
                    line = line.strip()
                    if line:
                        try:
                            data = json.loads(line)
                            if data.get("id") == self._req_id:
                                return data
                        except Exception:
                            continue
                time.sleep(0.05)
        except Exception as e:
            print(f"[MCPClient:{self.name}] Request error ({method}): {e}")
        return None

    def _send_notification(self, method: str, params: Dict[str, Any]):
        if not self.process or self.process.poll() is not None:
            return
        notif = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params
        }
        try:
            self.process.stdin.write(json.dumps(notif) + "\n")
            self.process.stdin.flush()
        except Exception:
            pass

    def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> str:
        res = self._send_request("tools/call", {
            "name": tool_name,
            "arguments": arguments
        }, timeout=30.0)
        if not res:
            return json.dumps({
                "success": False,
                "error": f"MCP tool call '{tool_name}' timed out or server disconnected."
            })
        if "error" in res:
            return json.dumps({"success": False, "error": res["error"]})
        result_data = res.get("result", {})
        content = result_data.get("content", [])
        text_out = []
        for c in content:
            if isinstance(c, dict) and c.get("type") == "text":
                text_out.append(c.get("text", ""))
            else:
                text_out.append(str(c))
        return "\n".join(text_out) or json.dumps(result_data)


class MCPManager:
    """
    Manages MCP servers and feeds discovered tools directly into Rajjo's tool registry.
    """
    def __init__(self):
        self._clients: Dict[str, MCPClientConnection] = {}
        self._registered_tools: Set[str] = set()

    def get_servers(self) -> List[Dict[str, Any]]:
        settings = load_settings()
        configured = settings.get("mcp_servers", [])
        result = []
        for s in configured:
            name = s["name"]
            client = self._clients.get(name)
            is_connected = client.connected if client else False
            tools_count = len(client.tools) if client else 0
            tools_list = [t.get("name") for t in (client.tools if client else [])]
            result.append({
                "name": name,
                "command": s.get("command", ""),
                "args": s.get("args", []),
                "env": s.get("env", {}),
                "enabled": s.get("enabled", True),
                "status": "connected" if is_connected else ("disabled" if not s.get("enabled", True) else "disconnected"),
                "tools_count": tools_count,
                "tools": tools_list,
                "error": client.error_message if client else ""
            })
        return result

    def add_server(self, server_config: Dict[str, Any]) -> Dict[str, Any]:
        settings = load_settings()
        servers = settings.get("mcp_servers", [])
        # Check if already exists
        idx = next((i for i, s in enumerate(servers) if s["name"] == server_config["name"]), None)
        cfg = {
            "name": server_config["name"],
            "command": server_config["command"],
            "args": server_config.get("args", []),
            "env": server_config.get("env", {}),
            "enabled": server_config.get("enabled", True)
        }
        if idx is not None:
            servers[idx] = cfg
        else:
            servers.append(cfg)
        save_settings({"mcp_servers": servers})

        # Connect if enabled
        if cfg["enabled"]:
            self._connect_server(cfg)
        return cfg

    def remove_server(self, name: str) -> bool:
        settings = load_settings()
        servers = settings.get("mcp_servers", [])
        servers = [s for s in servers if s["name"] != name]
        save_settings({"mcp_servers": servers})

        if name in self._clients:
            self._clients[name].disconnect()
            del self._clients[name]
        return True

    def toggle_server(self, name: str, enabled: bool) -> bool:
        settings = load_settings()
        servers = settings.get("mcp_servers", [])
        for s in servers:
            if s["name"] == name:
                s["enabled"] = enabled
                break
        save_settings({"mcp_servers": servers})

        if enabled:
            cfg = next((s for s in servers if s["name"] == name), None)
            if cfg:
                self._connect_server(cfg)
        else:
            if name in self._clients:
                self._clients[name].disconnect()
        return True

    def _connect_server(self, cfg: Dict[str, Any]):
        name = cfg["name"]
        client = MCPClientConnection(
            name=name,
            command=cfg["command"],
            args=cfg.get("args", []),
            env=cfg.get("env", {})
        )
        self._clients[name] = client
        if client.connect():
            self._register_client_tools(client)

    def _register_client_tools(self, client: MCPClientConnection):
        for t in client.tools:
            tool_name = f"mcp_{client.name}_{t['name']}"
            tool_desc = t.get("description", f"MCP Tool from {client.name}")

            # Define invocation closure
            def make_invoker(cli: MCPClientConnection, orig_name: str):
                def invoke_tool(**kwargs):
                    return cli.call_tool(orig_name, kwargs)
                return invoke_tool

            fn = make_invoker(client, t['name'])
            fn.__name__ = tool_name
            fn.__doc__ = tool_desc

            # Create structured tool
            st_tool = StructuredTool.from_function(
                func=fn,
                name=tool_name,
                description=tool_desc
            )
            registry.register_tool(
                tool=st_tool,
                category=f"MCP ({client.name})",
                risk_level="normal",
                requires_confirmation=False
            )

    def initialize_configured_servers(self):
        settings = load_settings()
        for s in settings.get("mcp_servers", []):
            if s.get("enabled", True):
                threading.Thread(target=self._connect_server, args=(s,), daemon=True).start()

mcp_manager = MCPManager()
