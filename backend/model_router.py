import os
import json
import re
import urllib.request
import urllib.error
from pathlib import Path
from typing import Any, Dict, Optional, List, Tuple

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, BaseMessage

try:
    from backend.config import load_settings, get_secret, get_provider_config
except ImportError:
    from config import load_settings, get_secret, get_provider_config


class DirectGGUFEngine:
    """
    Rajjo's Direct In-Process GGUF Execution Engine.
    Loads and runs .gguf model files directly from any path on SSD/HDD/USB
    with multi-threaded CPU/GPU acceleration.
    """
    def __init__(self, model_path: str, n_ctx: int = 4096, n_threads: Optional[int] = None, n_gpu_layers: int = 0):
        self.model_path = model_path
        self.n_ctx = n_ctx
        self.n_threads = n_threads or max(1, (os.cpu_count() or 4) - 1)
        self.n_gpu_layers = n_gpu_layers
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
            self._llm = Llama(
                model_path=str(p),
                n_ctx=self.n_ctx,
                n_threads=self.n_threads,
                n_gpu_layers=self.n_gpu_layers,
                verbose=False
            )
        except ImportError:
            raise ImportError(
                "llama-cpp-python is required for direct GGUF execution. "
                "Install it using: pip install llama-cpp-python"
            )
        except Exception as e:
            raise RuntimeError(f"Failed to initialize direct GGUF engine for '{p.name}': {str(e)}")

    def invoke(self, messages: List[BaseMessage], **kwargs) -> AIMessage:
        formatted_messages = []
        for m in messages:
            role = "user"
            if isinstance(m, SystemMessage):
                role = "system"
            elif isinstance(m, AIMessage):
                role = "assistant"
            formatted_messages.append({"role": role, "content": str(m.content)})

        response = self._llm.create_chat_completion(
            messages=formatted_messages,
            temperature=kwargs.get("temperature", 0.3),
            max_tokens=kwargs.get("max_tokens", 2048)
        )
        content = response["choices"][0]["message"]["content"]
        return AIMessage(content=content)

    def bind_tools(self, tools: List[Any]):
        # Return self for direct tool handling
        return self


class ModelRouter:
    """
    Unified LLM Factory and Universal API Accepter.
    Supports:
    - Universal OpenAI-compatible APIs (OpenAI, Groq, OpenRouter, DeepSeek, Together, LM Studio, vLLM, Ollama, Anthropic, Gemini, etc.)
    - Local Inference: Ollama (with robust multi-host discovery and local model tag listing)
    - Ollama Cloud: Browse and install models from Ollama's model library
    - Rajjo Direct GGUF Engine: Run any .gguf file directly from SSD/HDD/USB with no directory setup required.
    """

    @staticmethod
    def normalize_base_url(url: Optional[str]) -> Optional[str]:
        if not url or not url.strip():
            return None
        url = url.strip().rstrip("/")
        # If it doesn't end with /v1 and is not an Ollama /api endpoint
        if not url.endswith("/v1") and not url.endswith("/api"):
            url = f"{url}/v1"
        # Avoid duplicate /v1/v1
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

            # Harmonize custom_base_url and base_url
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

        # 1. Direct In-Process GGUF Engine
        if provider == "gguf":
            model_path_str = cfg.get("gguf_model_path") or cfg.get("model_path")
            if not model_path_str:
                raise ValueError("No GGUF model file specified. Please select a .gguf file from your drive.")
            return DirectGGUFEngine(model_path=model_path_str)

        # 2. Ollama Local Inference
        elif provider == "ollama":
            base_url = cfg.get("ollama_base_url") or cfg.get("base_url") or "http://localhost:11434"
            base_url_norm = ModelRouter.normalize_base_url(base_url) or "http://localhost:11434/v1"

            # If model_id not provided, try detecting installed models
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
            if not model_id or model_id.startswith("gpt-") or model_id.startswith("o1-") or model_id.startswith("o3-"):
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

        # 5. Anthropic (via OpenAI-compatible proxy or direct)
        elif provider == "anthropic":
            api_key = cfg.get("api_key") or get_secret("ANTHROPIC_API_KEY")
            base_url = ModelRouter.normalize_base_url(cfg.get("base_url")) or None
            if not api_key:
                raise ValueError("Anthropic API key is missing. Please configure it in Models or Settings.")
            if not model_id:
                model_id = "claude-3-5-sonnet-20241022"
            # Use OpenAI-compatible endpoint for Anthropic
            return ChatOpenAI(
                model=model_id,
                api_key=api_key,
                base_url=base_url or "https://api.anthropic.com/v1/",
                temperature=0.3,
                streaming=True
            )

        # 6. Google Gemini
        elif provider == "gemini":
            api_key = cfg.get("api_key") or get_secret("GEMINI_API_KEY")
            if not api_key:
                raise ValueError("Google Gemini API key is missing. Please configure it in Models or Settings.")
            if not model_id:
                model_id = "gemini-1.5-pro"
            return ChatOpenAI(
                model=model_id,
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
            if not model_id:
                model_id = "anthropic/claude-3.5-sonnet"
            return ChatOpenAI(
                model=model_id,
                api_key=api_key,
                base_url="https://openrouter.ai/api/v1",
                temperature=0.3,
                streaming=True,
                default_headers={
                    "HTTP-Referer": "https://rajjo.ai",
                    "X-Title": "Rajjo"
                }
            )

        # 8. Universal API Accepter (DeepSeek, OpenRouter, Together, LM Studio, vLLM, Mistral, Any Custom Endpoint)
        elif provider in ("custom", "universal", "deepseek", "together", "mistral", "xai"):
            api_key = cfg.get("api_key") or get_secret("CUSTOM_API_KEY") or "none"
            raw_url = cfg.get("base_url") or cfg.get("custom_base_url") or "http://localhost:1234/v1"
            base_url = ModelRouter.normalize_base_url(raw_url)
            effective_model = model_id or "default"
            return ChatOpenAI(
                model=effective_model,
                api_key=api_key,
                base_url=base_url,
                temperature=0.3,
                streaming=True
            )

        else:
            # Universal fallback for any custom provider name
            api_key = cfg.get("api_key") or "none"
            base_url = ModelRouter.normalize_base_url(cfg.get("base_url") or cfg.get("custom_base_url")) or "http://localhost:8000/v1"
            return ChatOpenAI(
                model=model_id or "default",
                api_key=api_key,
                base_url=base_url,
                temperature=0.3,
                streaming=True
            )

    @staticmethod
    def detect_ollama(base_url: str = "http://localhost:11434") -> Tuple[bool, List[str], str]:
        """
        Robust Ollama detection across multiple localhost bindings (localhost, 127.0.0.1).
        Retrieves all installed local models.
        """
        candidate_hosts = []
        if base_url:
            clean_base = base_url.rstrip("/").replace("/v1", "").replace("/api", "")
            candidate_hosts.append(clean_base)
        candidate_hosts.extend(["http://127.0.0.1:11434", "http://localhost:11434"])
        # Deduplicate preserving order
        candidate_hosts = list(dict.fromkeys(candidate_hosts))

        last_error = ""
        for host in candidate_hosts:
            tags_url = f"{host}/api/tags"
            try:
                req = urllib.request.Request(tags_url, headers={"User-Agent": "Rajjo/1.0"})
                with urllib.request.urlopen(req, timeout=3) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    raw_models = data.get("models", [])
                    model_names = []
                    for m in raw_models:
                        name = m.get("name") or m.get("model") or ""
                        if name:
                            model_names.append(name)

                    if model_names:
                        return True, model_names, f"Ollama connected at {host} ({len(model_names)} models installed)"
                    return True, [], f"Ollama is running at {host}, but no models are downloaded yet."
            except Exception as e:
                last_error = str(e)
                continue

        return False, [], f"Ollama unreachable on {', '.join(candidate_hosts)}. Error: {last_error}"

    @staticmethod
    def fetch_ollama_cloud_models() -> Tuple[bool, List[Dict], str]:
        """
        Fetch available models from Ollama Cloud library.
        Returns (success, models_list, message)
        """
        try:
            # Ollama library API
            library_url = "https://ollama.com/library?format=json"
            req = urllib.request.Request(library_url, headers={"User-Agent": "Rajjo/1.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))

            models = data.get("models", [])
            # Extract relevant info
            model_list = []
            for m in models:
                model_list.append({
                    "name": m.get("name", ""),
                    "description": m.get("description", ""),
                    "tags": m.get("tags", []),
                    "size": m.get("size", ""),
                    "pull_count": m.get("pull_count", 0),
                    "updated_at": m.get("updated_at", ""),
                })

            return True, model_list, f"Found {len(model_list)} models in Ollama Cloud Library"

        except Exception as e:
            return False, [], f"Failed to fetch Ollama Cloud models: {str(e)}"

    @staticmethod
    def validate_gguf(path_str: str) -> Dict[str, Any]:
        """
        Inspect and validate any local .gguf file anywhere on the filesystem.
        """
        if not path_str or not path_str.strip():
            return {"valid": False, "error": "No file path provided."}
        try:
            p = Path(path_str.strip().strip('"')).resolve()
            if not p.exists():
                return {"valid": False, "error": f"File not found: {path_str}"}
            if p.is_dir():
                return {"valid": False, "error": "Specified path is a folder, please select a .gguf file."}
            if not p.name.lower().endswith(".gguf"):
                return {"valid": False, "error": "File does not have a .gguf extension."}

            size_bytes = p.stat().st_size
            size_gb = round(size_bytes / (1024 ** 3), 2)

            # Check GGUF magic header bytes (0x47 0x47 0x55 0x46)
            try:
                with open(p, "rb") as f:
                    magic = f.read(4)
                if magic != b"GGUF":
                    return {"valid": False, "error": "File does not contain valid GGUF header magic bytes."}
            except Exception as e:
                return {"valid": False, "error": f"Failed to read file: {e}"}

            # Try to read GGUF metadata if possible
            arch = None
            quantization = None
            if size_bytes > 50 * 1024 * 1024:  # Only attempt full model parse for real weights > 50MB
                try:
                    from llama_cpp import Llama
                    llm = Llama(model_path=str(p), n_ctx=512, verbose=False)
                except Exception:
                    pass

            if size_gb < 2:
                quantization = "Q4_K_M or similar (small)"
            elif size_gb < 5:
                quantization = "Q4_K_M / Q5_K_M"
            elif size_gb < 10:
                quantization = "Q6_K / Q8_0"
            else:
                quantization = "High precision / F16"

            return {
                "valid": True,
                "path": str(p),
                "filename": p.name,
                "size_gb": size_gb,
                "size_bytes": size_bytes,
                "arch": arch,
                "quantization": quantization,
                "error": None
            }
        except Exception as e:
            return {"valid": False, "error": str(e)}

    @staticmethod
    def test_connection(config: Dict[str, Any]) -> Tuple[bool, str]:
        """
        Test if the given model configuration can invoke a prompt and return output.
        """
        try:
            llm = ModelRouter.get_llm(config)
            test_prompt = [HumanMessage(content="Respond with 'Rajjo is online' in 5 words or less.")]
            resp = llm.invoke(test_prompt)
            content = getattr(resp, "content", str(resp))
            return True, f"Connection successful! Model response: {content[:100]}"
        except Exception as e:
            return False, f"Connection failed: {str(e)}"


router = ModelRouter()