import os
import sys
import json
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Determine Base Data Directory
def get_default_data_dir() -> Path:
    env_dir = os.getenv("RAJJO_DATA_DIR")
    if env_dir:
        path = Path(env_dir)
    elif sys.platform == "win32":
        app_data = os.getenv("APPDATA")
        if app_data:
            path = Path(app_data) / "Rajjo"
        else:
            path = Path.home() / ".rajjo"
    else:
        path = Path.home() / ".rajjo"
    path.mkdir(parents=True, exist_ok=True)
    return path

DATA_DIR = get_default_data_dir()
MEMORY_DIR = DATA_DIR / "memory"
VECTOR_STORE_DIR = DATA_DIR / "vectorstore"
DB_PATH = DATA_DIR / "rajjo.db"
CONFIG_PATH = DATA_DIR / "config.json"
SECRETS_PATH = DATA_DIR / "secrets.json"
LOGS_DIR = DATA_DIR / "logs"
SCREENSHOTS_DIR = DATA_DIR / "screenshots"
MCP_DIR = DATA_DIR / "mcp"

for d in [MEMORY_DIR, VECTOR_STORE_DIR, LOGS_DIR, SCREENSHOTS_DIR, MCP_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# Default Settings
DEFAULT_SETTINGS = {
    "active_provider": "universal",
    "active_model_id": "deepseek-chat",
    "custom_base_url": "",
    "ollama_base_url": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
    "gguf_model_path": "",
    "data_dir": str(DATA_DIR),
    "max_iterations": 10,
    "shell_timeout": 30,
    "shell_confirm_destructive": True,
    "theme": "dark",
    "default_language": "en",
    "output_format": "markdown",
    "auto_save_conversations": True,
    "telemetry_enabled": False,
    "reduce_motion": False,
    "ui_density": "comfortable",
    "accent_color": "brand",
    "http_proxy": "",
    "https_proxy": "",
    "no_proxy": "localhost,127.0.0.1,.local",
}

def load_settings() -> dict:
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                saved = json.load(f)
                settings = {**DEFAULT_SETTINGS, **saved}
                return settings
        except Exception:
            pass
    return DEFAULT_SETTINGS.copy()

def save_settings(settings: dict) -> dict:
    current = load_settings()
    current.update(settings)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(current, f, indent=2)
    return current

# Secure Secret Management
def load_secrets() -> dict:
    if SECRETS_PATH.exists():
        try:
            with open(SECRETS_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def get_secret(key_name: str) -> str:
    """Retrieve secret from file or environment variables."""
    secrets = load_secrets()
    val = secrets.get(key_name)
    if val:
        return val
    # Fallback to environment variable
    return os.getenv(key_name, "")

def save_secret(key_name: str, value: str):
    secrets = load_secrets()
    secrets[key_name] = value.strip() if value else ""
    with open(SECRETS_PATH, "w", encoding="utf-8") as f:
        json.dump(secrets, f, indent=2)

def mask_key(val: str) -> str:
    if not val:
        return ""
    if len(val) <= 8:
        return "••••••••"
    return f"{val[:4]}••••••••{val[-4:]}"

def get_masked_secrets_summary() -> dict:
    """Returns safe masked secret statuses without leaking keys."""
    openai_key = get_secret("OPENAI_API_KEY")
    groq_key = get_secret("GROQ_API_KEY")
    anthropic_key = get_secret("ANTHROPIC_API_KEY")
    custom_key = get_secret("CUSTOM_API_KEY")
    gemini_key = get_secret("GEMINI_API_KEY")
    openrouter_key = get_secret("OPENROUTER_API_KEY")

    return {
        "openai": {"configured": bool(openai_key), "masked": mask_key(openai_key)},
        "groq": {"configured": bool(groq_key), "masked": mask_key(groq_key)},
        "anthropic": {"configured": bool(anthropic_key), "masked": mask_key(anthropic_key)},
        "custom": {"configured": bool(custom_key), "masked": mask_key(custom_key)},
        "gemini": {"configured": bool(gemini_key), "masked": mask_key(gemini_key)},
        "openrouter": {"configured": bool(openrouter_key), "masked": mask_key(openrouter_key)},
    }

# Provider configurations
PROVIDER_CONFIGS = {
    "openai": {
        "name": "OpenAI",
        "default_model": "gpt-4o",
        "models": ["gpt-4o", "gpt-4o-mini", "o1-preview", "o1-mini", "o3-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"],
        "base_url": "https://api.openai.com/v1",
        "key_env": "OPENAI_API_KEY",
        "key_secret": "OPENAI_API_KEY",
    },
    "anthropic": {
        "name": "Anthropic",
        "default_model": "claude-3-5-sonnet-20241022",
        "models": ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229", "claude-3-sonnet-20240229", "claude-3-haiku-20240307"],
        "base_url": "https://api.anthropic.com/v1",
        "key_env": "ANTHROPIC_API_KEY",
        "key_secret": "ANTHROPIC_API_KEY",
    },
    "groq": {
        "name": "Groq",
        "default_model": "llama-3.3-70b-versatile",
        "models": ["llama-3.3-70b-versatile", "llama-3.3-8b-versatile", "llama-3.1-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"],
        "base_url": "https://api.groq.com/openai/v1",
        "key_env": "GROQ_API_KEY",
        "key_secret": "GROQ_API_KEY",
    },
    "gemini": {
        "name": "Google Gemini",
        "default_model": "gemini-1.5-pro",
        "models": ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-1.0-pro"],
        "base_url": "https://generativelanguage.googleapis.com/v1beta",
        "key_env": "GEMINI_API_KEY",
        "key_secret": "GEMINI_API_KEY",
    },
    "openrouter": {
        "name": "OpenRouter",
        "default_model": "anthropic/claude-3.5-sonnet",
        "models": ["anthropic/claude-3.5-sonnet", "openai/gpt-4o", "meta-llama/llama-3.3-70b-instruct", "mistralai/mistral-large", "google/gemini-pro"],
        "base_url": "https://openrouter.ai/api/v1",
        "key_env": "OPENROUTER_API_KEY",
        "key_secret": "OPENROUTER_API_KEY",
    },
    "universal": {
        "name": "Universal API",
        "default_model": "deepseek-chat",
        "models": ["deepseek-chat", "deepseek-coder", "custom"],
        "base_url": "",
        "key_env": "CUSTOM_API_KEY",
        "key_secret": "CUSTOM_API_KEY",
    },
    "ollama": {
        "name": "Local Ollama",
        "default_model": "llama3.2",
        "models": [],  # Dynamically populated
        "base_url": "http://localhost:11434",
        "key_env": "",
        "key_secret": "",
    },
    "gguf": {
        "name": "Direct GGUF",
        "default_model": "rajjo-direct-gguf",
        "models": [],
        "base_url": "",
        "key_env": "",
        "key_secret": "",
    },
}

def get_provider_config(provider: str) -> dict:
    """Get configuration for a provider."""
    return PROVIDER_CONFIGS.get(provider, PROVIDER_CONFIGS["universal"])

def get_all_providers() -> list:
    """Get list of all available providers."""
    return list(PROVIDER_CONFIGS.keys())