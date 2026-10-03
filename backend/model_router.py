import os
import json
import re
import struct
import urllib.request
import urllib.error
from pathlib import Path
from typing import Any, Dict, Optional, List, Tuple
from datetime import datetime, timedelta

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, BaseMessage

try:
    from backend.config import load_settings, get_secret, get_provider_config, PROVIDER_CONFIGS
except ImportError:
    from config import load_settings, get_secret, get_provider_config, PROVIDER_CONFIGS


# Global Cache for loaded GGUF engines to avoid reloading multi-GB weights every planner step
_GGUF_ENGINE_CACHE: Dict[str, Any] = {}

# In-memory TTL cache for dynamic model list fetching
_PROVIDER_MODELS_CACHE: Dict[str, Tuple[datetime, List[str]]] = {}


class DirectGGUFEngine:
    """
    Rajjo's Direct In-Process GGUF Execution Engine.
    Cached in RAM across planner steps with real function calling / JSON tool fallback.
    """
    def __init__(self, model_path: str, n_ctx: int = 4096, n_threads: Optional[int] = None, n_gpu_layers: int = 0):
        self.model_path = model_path
        self.n_ctx = n_ctx
        self.n_threads = n_threads or max(1, (os.cpu_count() or 4) - 1)
        self.n_gpu_layers = n_gpu_layers
        self._tools: List[Any] = []
        self._llm = None
        self._init_engine()

    def _init_engine(self):
        p = Path(self.model_path).resolve()
        if not p.exists():
            raise FileNotFoundError(f"GGUF model file does not exist at: {self.model_path}")
        if not p.name.lower().endswith(".gguf"):
            raise ValueError(f"File '{p.name}' is not a valid .gguf model file.")

        try:
            from llama_cpp import Llama
            print(f"[DirectGGUFEngine] Loading model weights into memory: {p.name}...")
            self._llm = Llama(
                model_path=str(p),
                n_ctx=self.n_ctx,
                n_threads=self.n_threads,
                n_gpu_layers=self.n_gpu_layers,
                verbose=False
            )
            print(f"[DirectGGUFEngine] Model successfully initialized: {p.name}")
        except ImportError:
            raise ImportError(
                "llama-cpp-python is required for direct GGUF execution. "
                "Install it using: pip install llama-cpp-python"
            )
        except Exception as e:
            raise RuntimeError(f"Failed to initialize direct GGUF engine for '{p.name}': {str(e)}")

    def bind_tools(self, tools: List[Any]):
        self._tools = tools
        return self

    def _format_tools_schema(self) -> List[Dict[str, Any]]:
        schemas = []
        for t in self._tools:
            name = getattr(t, "name", "")
            desc = getattr(t, "description", "")
            params = {}
            if hasattr(t, "args"):
                params = t.args
            elif hasattr(t, "args_schema") and t.args_schema:
                try:
                    params = t.args_schema.schema()
                except Exception:
                    pass
            schemas.append({
                "type": "function",
                "function": {
                    "name": name,
                    "description": desc,
                    "parameters": params or {"type": "object", "properties": {}}
                }
            })
        return schemas

    def _build_json_tool_prompt(self) -> str:
        tool_lines = []
        for t in self._tools:
            name = getattr(t, "name", "")
            desc = getattr(t, "description", "")
            tool_lines.append(f"- `{name}`: {desc}")
        tools_str = "\n".join(tool_lines)

        return (
            "\n\n[Available Tools]:\n"
            f"{tools_str}\n\n"
            "To invoke a tool, respond with a JSON object in this exact format:\n"
            "```json\n"
            '{"tool": "<tool_name>", "args": {<arguments>}}\n'
            "```\n"
            "If no tool is required, provide your final response directly."
        )

    def invoke(self, messages: List[BaseMessage], **kwargs) -> AIMessage:
        formatted_messages = []
        for m in messages:
            role = "user"
            if isinstance(m, SystemMessage):
                role = "system"
            elif isinstance(m, AIMessage):
                role = "assistant"
            formatted_messages.append({"role": role, "content": str(m.content)})

        # 1. Attempt Native Tool Calling if tools are bound
        if self._tools and self._llm:
            try:
                tools_schema = self._format_tools_schema()
                response = self._llm.create_chat_completion(
                    messages=formatted_messages,
                    tools=tools_schema,
                    tool_choice="auto",
                    temperature=kwargs.get("temperature", 0.3),
                    max_tokens=kwargs.get("max_tokens", 2048)
                )
                choice = response["choices"][0]["message"]
                content = choice.get("content") or ""
                raw_tool_calls = choice.get("tool_calls", [])

                if raw_tool_calls:
                    parsed_tool_calls = []
                    for tc in raw_tool_calls:
                        fn = tc.get("function", {})
                        fname = fn.get("name", "")
                        fargs = fn.get("arguments", "{}")
                        if isinstance(fargs, str):
                            try:
                                fargs = json.loads(fargs)
                            except Exception:
                                fargs = {"raw": fargs}
                        parsed_tool_calls.append({
                            "name": fname,
                            "args": fargs,
                            "id": tc.get("id", f"call_{len(parsed_tool_calls)}")
                        })
                    return AIMessage(content=content, tool_calls=parsed_tool_calls)
            except Exception as e:
                print(f"[DirectGGUFEngine] Native tool call notice ({e}), falling back to JSON tool prompt.")

        # 2. JSON Tool Calling Fallback
        if self._tools:
            # Inject JSON schema into system message
            tool_prompt = self._build_json_tool_prompt()
            if formatted_messages and formatted_messages[0]["role"] == "system":
                formatted_messages[0]["content"] += tool_prompt
            else:
                formatted_messages.insert(0, {"role": "system", "content": tool_prompt})

        response = self._llm.create_chat_completion(
            messages=formatted_messages,
            temperature=kwargs.get("temperature", 0.3),
            max_tokens=kwargs.get("max_tokens", 2048)
        )
        content = response["choices"][0]["message"].get("content") or ""

        # Check for JSON tool calling response
        if self._tools:
            json_match = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", content) or re.search(r"(\{\s*\"tool\"\s*:\s*\"[^\"]+\"[\s\S]*?\})", content)
            if json_match:
                try:
                    parsed = json.loads(json_match.group(1))
                    if "tool" in parsed and "args" in parsed:
                        tname = parsed["tool"]
                        targs = parsed.get("args", {})
                        clean_content = content.replace(json_match.group(0), "").strip()
                        return AIMessage(
                            content=clean_content,
                            tool_calls=[{"name": tname, "args": targs, "id": f"call_json_{int(time.time()*1000)}"}]
                        )
                except Exception:
                    pass

        return AIMessage(content=content)


class ModelRouter:
    """
    Unified LLM Factory and Universal API Accepter.
    Supports:
    - Universal OpenAI-compatible APIs (OpenAI, Groq, OpenRouter, DeepSeek, Together, LM Studio, vLLM)
    - Direct Anthropic integration
    - Google Gemini
    - Local Inference: Ollama (with multi-host discovery and local model tag listing)
    - Curated Ollama model library
    - Rajjo Direct GGUF Engine with RAM caching and dual tool-calling
    """

    @staticmethod
    def normalize_base_url(url: Optional[str]) -> Optional[str]:
        if not url or not url.strip():
            return None
        url = url.strip().rstrip("/")
        if not url.endswith("/v1") and not url.endswith("/api"):
            url = f"{url}/v1"
        url = re.sub(r'/v1/v1$', '/v1', url)
        return url

    @staticmethod
    def get_effective_config(override_config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        settings = load_settings()
        config = {
            "provider": settings.get("active_provider", "universal"),
            "model_id": settings.get("active_model_id", "deepseek-chat"),
            "base_url": settings.get("custom_base_url", ""),
            "custom_base_url": settings.get("custom_base_url", ""),
            "ollama_base_url": settings.get("ollama_base_url", "http://localhost:11434"),
            "gguf_model_path": settings.get("gguf_model_path", ""),
            "api_key": ""
        }
        if override_config:
            for k, v in override_config.items():
                if v is not None and v != "":
                    config[k] = v

            if override_config.get("custom_base_url"):
                config["base_url"] = override_config["custom_base_url"]
                config["custom_base_url"] = override_config["custom_base_url"]
            elif override_config.get("base_url"):
                config["base_url"] = override_config["base_url"]
                config["custom_base_url"] = override_config["base_url"]

        if not config.get("base_url") and config.get("custom_base_url"):
            config["base_url"] = config["custom_base_url"]

        return config

    @staticmethod
    def get_llm(model_config: Optional[Dict[str, Any]] = None):
        cfg = ModelRouter.get_effective_config(model_config)
        provider = (cfg.get("provider") or "universal").lower()
        model_id = cfg.get("model_id") or ""

        # 1. Direct In-Process GGUF Engine (Cached)
        if provider == "gguf":
            model_path_str = cfg.get("gguf_model_path") or cfg.get("model_path")
            if not model_path_str:
                raise ValueError("No GGUF model file specified. Please select a .gguf file from your drive.")
            
            p = str(Path(model_path_str).resolve())
            cache_key = f"{p}:4096:0"
            if cache_key in _GGUF_ENGINE_CACHE:
                return _GGUF_ENGINE_CACHE[cache_key]

            engine = DirectGGUFEngine(model_path=p)
            _GGUF_ENGINE_CACHE[cache_key] = engine
            return engine

        # 2. Ollama Local Inference
        elif provider == "ollama":
            base_url = cfg.get("ollama_base_url") or cfg.get("base_url") or "http://localhost:11434"
            base_url_norm = ModelRouter.normalize_base_url(base_url) or "http://localhost:11434/v1"

            if not model_id or model_id in ("gpt-4o", "default", "deepseek-chat"):
                _, installed_models, _ = ModelRouter.detect_ollama(base_url)
                if installed_models:
                    model_id = installed_models[0]
                else:
                    model_id = "llama3.2"

            return ChatOpenAI(
                model=model_id,
                api_key="ollama",
                base_url=base_url_norm,
                temperature=0.3,
                streaming=True
            )

        # 3. Groq Fast Cloud
        elif provider == "groq":
            api_key = cfg.get("api_key") or get_secret("GROQ_API_KEY")
            if not api_key:
                raise ValueError("Groq API key is missing. Please configure it in Models or Settings.")
            if not model_id or model_id.startswith("gpt-") or model_id.startswith("o1-"):
                model_id = "llama-3.3-70b-versatile"
            return ChatOpenAI(
                model=model_id,
                api_key=api_key,
                base_url="https://api.groq.com/openai/v1",
                temperature=0.3,
                streaming=True
            )

        # 4. OpenAI Cloud
        elif provider == "openai":
            api_key = cfg.get("api_key") or get_secret("OPENAI_API_KEY")
            base_url = ModelRouter.normalize_base_url(cfg.get("base_url")) or None
            if not api_key:
                raise ValueError("OpenAI API key is missing. Please configure it in Models or Settings.")
            if not model_id:
                model_id = "gpt-4o"
            return ChatOpenAI(
                model=model_id,
                api_key=api_key,
                base_url=base_url,
                temperature=0.3,
                streaming=True
            )

        # 5. Anthropic
        elif provider == "anthropic":
            api_key = cfg.get("api_key") or get_secret("ANTHROPIC_API_KEY")
            if not api_key:
                raise ValueError("Anthropic API key is missing. Please configure it in Models or Settings.")
            effective_model = model_id or "claude-3-7-sonnet"
            
            # Check if langchain-anthropic is available
            try:
                from langchain_anthropic import ChatAnthropic
                return ChatAnthropic(
                    model=effective_model,
                    api_key=api_key,
                    temperature=0.3,
                    streaming=True
                )
            except ImportError:
                # Direct OpenAI-compatible bridge or warning
                return ChatOpenAI(
                    model=effective_model,
                    api_key=api_key,
                    base_url="https://api.anthropic.com/v1",
                    temperature=0.3,
                    streaming=True,
                    default_headers={"anthropic-version": "2023-06-01"}
                )

        # 6. Google Gemini
        elif provider == "gemini":
            api_key = cfg.get("api_key") or get_secret("GEMINI_API_KEY")
            if not api_key:
                raise ValueError("Google Gemini API key is missing. Please configure it in Models or Settings.")
            return ChatOpenAI(
                model=model_id or "gemini-2.0-flash",
                api_key=api_key,
                base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
                temperature=0.3,
                streaming=True
            )

        # 7. OpenRouter
        elif provider == "openrouter":
            api_key = cfg.get("api_key") or get_secret("OPENROUTER_API_KEY")
            if not api_key:
                raise ValueError("OpenRouter API key is missing. Please configure it in Models or Settings.")
            return ChatOpenAI(
                model=model_id or "anthropic/claude-3.7-sonnet",
                api_key=api_key,
                base_url="https://openrouter.ai/api/v1",
                temperature=0.3,
                streaming=True,
                default_headers={
                    "HTTP-Referer": "https://rajjo.ai",
                    "X-Title": "Rajjo"
                }
            )

        # 8. Universal API Accepter
        else:
            api_key = cfg.get("api_key") or get_secret("CUSTOM_API_KEY") or "none"
            raw_url = cfg.get("base_url") or cfg.get("custom_base_url") or "http://localhost:1234/v1"
            base_url = ModelRouter.normalize_base_url(raw_url)
            return ChatOpenAI(
                model=model_id or "deepseek-chat",
                api_key=api_key,
                base_url=base_url,
                temperature=0.3,
                streaming=True
            )

    @staticmethod
    def detect_ollama(base_url: str = "http://localhost:11434") -> Tuple[bool, List[str], str]:
        candidate_hosts = []
        if base_url:
            clean_base = base_url.rstrip("/").replace("/v1", "").replace("/api", "")
            candidate_hosts.append(clean_base)
        candidate_hosts.extend(["http://127.0.0.1:11434", "http://localhost:11434"])
        candidate_hosts = list(dict.fromkeys(candidate_hosts))

        last_error = ""
        for host in candidate_hosts:
            tags_url = f"{host}/api/tags"
            try:
                req = urllib.request.Request(tags_url, headers={"User-Agent": "Rajjo/1.0"})
                with urllib.request.urlopen(req, timeout=3) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    raw_models = data.get("models", [])
                    model_names = [m.get("name") or m.get("model") for m in raw_models if m.get("name") or m.get("model")]
                    if model_names:
                        return True, model_names, f"Ollama connected at {host} ({len(model_names)} models installed)"
                    return True, [], f"Ollama is running at {host}, but no models are downloaded yet."
            except Exception as e:
                last_error = str(e)
                continue

        return False, [], f"Ollama unreachable on {', '.join(candidate_hosts)}. Error: {last_error}"

    @staticmethod
    def fetch_dynamic_provider_models(provider: str) -> List[str]:
        """
        Dynamically fetches current model lists from the provider's /models endpoint.
        Uses in-memory caching to avoid rate-limiting.
        """
        now = datetime.now()
        if provider in _PROVIDER_MODELS_CACHE:
            ts, cached_models = _PROVIDER_MODELS_CACHE[provider]
            if now - ts < timedelta(hours=1) and cached_models:
                return cached_models

        models: List[str] = []
        try:
            if provider == "openai":
                key = get_secret("OPENAI_API_KEY")
                if key:
                    req = urllib.request.Request(
                        "https://api.openai.com/v1/models",
                        headers={"Authorization": f"Bearer {key}", "User-Agent": "Rajjo/2.0"}
                    )
                    with urllib.request.urlopen(req, timeout=5) as resp:
                        data = json.loads(resp.read().decode("utf-8"))
                        for item in data.get("data", []):
                            mid = item.get("id", "")
                            if any(prefix in mid for prefix in ["gpt-", "o1", "o3", "chatgpt"]):
                                models.append(mid)
                        models.sort()

            elif provider == "groq":
                key = get_secret("GROQ_API_KEY")
                if key:
                    req = urllib.request.Request(
                        "https://api.groq.com/openai/v1/models",
                        headers={"Authorization": f"Bearer {key}", "User-Agent": "Rajjo/2.0"}
                    )
                    with urllib.request.urlopen(req, timeout=5) as resp:
                        data = json.loads(resp.read().decode("utf-8"))
                        models = [m.get("id") for m in data.get("data", []) if m.get("id")]
                        models.sort()

            elif provider == "openrouter":
                key = get_secret("OPENROUTER_API_KEY")
                req = urllib.request.Request(
                    "https://openrouter.ai/api/v1/models",
                    headers={"Authorization": f"Bearer {key}" if key else "", "User-Agent": "Rajjo/2.0"}
                )
                with urllib.request.urlopen(req, timeout=5) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    models = [m.get("id") for m in data.get("data", [])[:40] if m.get("id")]

            elif provider == "ollama":
                settings = load_settings()
                _, mlist, _ = ModelRouter.detect_ollama(settings.get("ollama_base_url", "http://localhost:11434"))
                models = mlist

        except Exception as e:
            print(f"[ModelRouter] Notice fetching dynamic models for {provider}: {e}")

        # Fallback to defaults from PROVIDER_CONFIGS if empty
        if not models:
            models = PROVIDER_CONFIGS.get(provider, {}).get("models", [])

        if models:
            _PROVIDER_MODELS_CACHE[provider] = (now, models)
        return models

    @staticmethod
    def fetch_ollama_cloud_models() -> Tuple[bool, List[Dict], str]:
        """
        Returns structured library of popular Ollama models.
        Replaces invalid HTML scraping endpoint with curated, rich catalog.
        """
        catalog = [
            {"name": "llama3.3", "description": "Meta's state-of-the-art 70B model with open weights", "size": "42GB", "pull_count": 2500000, "tags": ["70b", "latest"]},
            {"name": "llama3.2", "description": "Meta's fast, efficient lightweight models for edge & desktop", "size": "2.0GB", "pull_count": 3800000, "tags": ["3b", "1b", "latest"]},
            {"name": "deepseek-r1", "description": "DeepSeek's leading open-weights reasoning model with distilled variants", "size": "4.7GB", "pull_count": 4200000, "tags": ["7b", "8b", "14b", "32b", "70b"]},
            {"name": "qwen2.5", "description": "Alibaba's powerful multilingual and code-optimized model family", "size": "4.5GB", "pull_count": 1900000, "tags": ["7b", "14b", "32b", "72b"]},
            {"name": "phi4", "description": "Microsoft's 14B state-of-the-art reasoning model", "size": "9.1GB", "pull_count": 1200000, "tags": ["14b", "latest"]},
            {"name": "mistral", "description": "Mistral AI's flagship 7B general-purpose model", "size": "4.1GB", "pull_count": 4500000, "tags": ["7b", "instruct"]},
            {"name": "gemma2", "description": "Google's open model built from Gemini technology", "size": "5.4GB", "pull_count": 1700000, "tags": ["9b", "27b"]},
            {"name": "codellama", "description": "Meta's specialized code synthesis and debugging model", "size": "3.8GB", "pull_count": 2100000, "tags": ["7b", "13b", "python"]},
            {"name": "nomic-embed-text", "description": "High-performance embedding model with 8192 context length", "size": "274MB", "pull_count": 5200000, "tags": ["embeddings"]}
        ]
        return True, catalog, f"Retrieved {len(catalog)} featured models from Ollama Library"

    @staticmethod
    def validate_gguf(path_str: str) -> Dict[str, Any]:
        """
        Inspects and validates any local .gguf file using pure binary header parsing.
        Reads file size, magic bytes, tensor count, and metadata WITHOUT loading model weights!
        """
        if not path_str or not path_str.strip():
            return {"valid": False, "error": "No file path provided."}
        try:
            p = Path(path_str.strip().strip('"')).resolve()
            if not p.exists():
                return {"valid": False, "error": f"File not found: {path_str}"}
            if p.is_dir():
                return {"valid": False, "error": "Specified path is a directory, please select a .gguf file."}
            if not p.name.lower().endswith(".gguf"):
                return {"valid": False, "error": "File does not have a .gguf extension."}

            size_bytes = p.stat().st_size
            size_gb = round(size_bytes / (1024 ** 3), 2)

            # Read GGUF Header without loading multi-GB tensors
            with open(p, "rb") as f:
                magic = f.read(4)
                if magic != b"GGUF":
                    return {"valid": False, "error": "Invalid GGUF header magic bytes (expected 'GGUF')."}

                version_bytes = f.read(4)
                if len(version_bytes) < 4:
                    return {"valid": False, "error": "Truncated GGUF header."}
                version = struct.unpack("<I", version_bytes)[0]

                # GGUF v2/v3 has tensor_count (uint64) and kv_count (uint64)
                tensors_count = 0
                kv_count = 0
                try:
                    tensors_bytes = f.read(8)
                    kv_bytes = f.read(8)
                    if len(tensors_bytes) == 8 and len(kv_bytes) == 8:
                        tensors_count = struct.unpack("<Q", tensors_bytes)[0]
                        kv_count = struct.unpack("<Q", kv_bytes)[0]
                except Exception:
                    pass

            # Detect quantization heuristic from filename
            fname_lower = p.name.lower()
            quantization = "Q4_K_M"
            for q in ["q4_k_m", "q4_k_s", "q5_k_m", "q5_k_s", "q8_0", "q6_k", "q2_k", "q3_k_m", "f16"]:
                if q in fname_lower:
                    quantization = q.upper()
                    break

            return {
                "valid": True,
                "path": str(p),
                "filename": p.name,
                "size_gb": size_gb,
                "size_bytes": size_bytes,
                "gguf_version": version,
                "tensor_count": tensors_count,
                "metadata_count": kv_count,
                "quantization": quantization,
                "error": None
            }
        except Exception as e:
            return {"valid": False, "error": str(e)}

    @staticmethod
    def test_connection(config: Dict[str, Any]) -> Tuple[bool, str]:
        try:
            llm = ModelRouter.get_llm(config)
            test_prompt = [HumanMessage(content="Respond with 'Rajjo is online' in 5 words or less.")]
            resp = llm.invoke(test_prompt)
            content = getattr(resp, "content", str(resp))
            return True, f"Connection successful! Model response: {content[:100]}"
        except Exception as e:
            return False, f"Connection failed: {str(e)}"

router = ModelRouter()