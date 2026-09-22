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
SESSION_TOKEN_PATH = DATA_DIR / ".session_token"
LOGS_DIR = DATA_DIR / "logs"
SCREENSHOTS_DIR = DATA_DIR / "screenshots"
MCP_DIR = DATA_DIR / "mcp"

for d in [MEMORY_DIR, VECTOR_STORE_DIR, LOGS_DIR, SCREENSHOTS_DIR, MCP_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# Detect Frozen PyInstaller Production Environment
IS_FROZEN = getattr(sys, "frozen", False)

# Setup Production Logging if Running Headless/Frozen
def _setup_production_logging():
    if IS_FROZEN or sys.stdout is None or sys.stderr is None:
        log_file = LOGS_DIR / "rajjo_backend.log"
        try:
            f = open(log_file, "a", encoding="utf-8", buffering=1)
            sys.stdout = f
            sys.stderr = f
        except Exception:
            pass

_setup_production_logging()

# Project Root & Workspace Directory
PROJECT_ROOT = Path(sys.executable).resolve().parent if IS_FROZEN else Path(__file__).resolve().parent.parent
DEFAULT_WORKSPACE_DIR = (DATA_DIR / "workspace") if IS_FROZEN else PROJECT_ROOT
DEFAULT_WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)

# Default Settings
DEFAULT_SETTINGS = {
    "active_provider": "universal",
    "active_model_id": "deepseek-chat",
    "custom_base_url": "",
    "ollama_base_url": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
    "gguf_model_path": "",
    "data_dir": str(DATA_DIR),
    "workspace_dir": str(DEFAULT_WORKSPACE_DIR),
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

def get_workspace_dir() -> Path:
    """Returns the validated active workspace directory path."""
    settings = load_settings()
    ws = settings.get("workspace_dir")
    if ws:
        try:
            p = Path(ws).resolve()
            if p.exists() and p.is_dir():
                return p
        except Exception:
            pass
    return DEFAULT_WORKSPACE_DIR

# ----------------- Session Token Management -----------------
def get_or_create_session_token() -> str:
    """Retrieves or creates an ephemeral, cryptographically secure API bearer token."""
    import secrets
    # 1. Check environment variable first
    env_token = os.getenv("RAJJO_API_TOKEN")
    if env_token and len(env_token.strip()) >= 16:
        return env_token.strip()

    # 2. Check local session token file
    if SESSION_TOKEN_PATH.exists():
        try:
            stored = SESSION_TOKEN_PATH.read_text(encoding="utf-8").strip()
            if len(stored) >= 32:
                return stored
        except Exception:
            pass

    # 3. Generate new secure 64-char hex token
    new_token = secrets.token_hex(32)
    try:
        if sys.platform != "win32":
            # Strict 0600 permissions on POSIX
            flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
            fd = os.open(str(SESSION_TOKEN_PATH), flags, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(new_token)
        else:
            SESSION_TOKEN_PATH.write_text(new_token, encoding="utf-8")
    except Exception as e:
        print(f"[Rajjo Config] Warning writing session token: {e}")
    return new_token

# ----------------- Secure Secret Management (OS Keyring) -----------------
KEYRING_SERVICE = "RajjoAgent"

def _get_keyring():
    try:
        import keyring
        return keyring
    except Exception:
        return None

def get_secret(key_name: str) -> str:
    """Retrieve secret from OS Keyring, environment, or legacy store."""
    # 1. Check OS Keyring
    kr = _get_keyring()
    if kr:
        try:
            val = kr.get_password(KEYRING_SERVICE, key_name)
            if val:
                return val
        except Exception:
            pass

    # 2. Check environment variable
    env_val = os.getenv(key_name, "")
    if env_val:
        return env_val

    # 3. Check legacy secrets.json if present
    if SECRETS_PATH.exists():
        try:
            with open(SECRETS_PATH, "r", encoding="utf-8") as f:
                legacy = json.load(f)
                val = legacy.get(key_name, "")
                if val:
                    return val
        except Exception:
            pass
    return ""

def save_secret(key_name: str, value: str):
    """Saves a secret into the OS Keyring. Clears it if value is empty."""
    val = value.strip() if value else ""
    kr = _get_keyring()
    if kr:
        try:
            if val:
                kr.set_password(KEYRING_SERVICE, key_name, val)
            else:
                try:
                    kr.delete_password(KEYRING_SERVICE, key_name)
                except Exception:
                    pass
            return
        except Exception as e:
            print(f"[Rajjo Config] Keyring set error: {e}")

    # Fallback to local secrets.json if keyring is unavailable in environment
    secrets_data = {}
    if SECRETS_PATH.exists():
        try:
            with open(SECRETS_PATH, "r", encoding="utf-8") as f:
                secrets_data = json.load(f)
        except Exception:
            pass
    if val:
        secrets_data[key_name] = val
    else:
        secrets_data.pop(key_name, None)
    with open(SECRETS_PATH, "w", encoding="utf-8") as f:
        json.dump(secrets_data, f, indent=2)

def migrate_legacy_secrets():
    """Migrates any existing plaintext secrets.json to OS Keyring and safely cleans up."""
    if not SECRETS_PATH.exists():
        return
    kr = _get_keyring()
    if not kr:
        return
    try:
        with open(SECRETS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        migrated = 0
        for k, v in data.items():
            if v and isinstance(v, str):
                try:
                    kr.set_password(KEYRING_SERVICE, k, v)
                    migrated += 1
                except Exception as e:
                    print(f"[Rajjo Config] Migration error for {k}: {e}")
        if migrated > 0:
            print(f"[Rajjo Config] Successfully migrated {migrated} secrets from plaintext secrets.json to OS Keyring.")
        # Securely overwrite and unlink secrets.json
        try:
            with open(SECRETS_PATH, "w", encoding="utf-8") as f:
                f.write("{}")
            SECRETS_PATH.unlink(missing_ok=True)
        except Exception:
            pass
    except Exception as e:
        print(f"[Rajjo Config] Legacy migration warning: {e}")

# Trigger migration check on startup
migrate_legacy_secrets()

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
        "models": [
            "gpt-4o",
            "gpt-4o-mini",
            "o3-mini",
            "o1",
            "o1-mini",
            "gpt-4.5-preview",
            "chatgpt-4o-latest",
            "gpt-4-turbo",
        ],
        "base_url": "https://api.openai.com/v1",
        "key_env": "OPENAI_API_KEY",
        "key_secret": "OPENAI_API_KEY",
    },
    "anthropic": {
        "name": "Anthropic",
        "default_model": "claude-3-7-sonnet",
        "models": [
            "claude-3-7-sonnet",
            "claude-3-5-sonnet-latest",
            "claude-3-5-haiku-latest",
            "claude-3-5-sonnet-20241022",
            "claude-3-5-haiku-20241022",
            "claude-3-opus-20240229",
        ],
        "base_url": "https://api.anthropic.com/v1",
        "key_env": "ANTHROPIC_API_KEY",
        "key_secret": "ANTHROPIC_API_KEY",
    },
    "groq": {
        "name": "Groq",
        "default_model": "llama-3.3-70b-versatile",
        "models": [
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
            "deepseek-r1-distill-llama-70b",
            "mixtral-8x7b-32768",
            "gemma2-9b-it",
        ],
        "base_url": "https://api.groq.com/openai/v1",
        "key_env": "GROQ_API_KEY",
        "key_secret": "GROQ_API_KEY",
    },
    "gemini": {
        "name": "Google Gemini",
        "default_model": "gemini-2.0-flash",
        "models": [
            "gemini-2.0-flash",
            "gemini-2.0-pro-exp-02-05",
            "gemini-2.0-flash-thinking-exp",
            "gemini-1.5-pro",
            "gemini-1.5-flash",
        ],
        "base_url": "https://generativelanguage.googleapis.com/v1beta",
        "key_env": "GEMINI_API_KEY",
        "key_secret": "GEMINI_API_KEY",
    },
    "openrouter": {
        "name": "OpenRouter",
        "default_model": "anthropic/claude-3.7-sonnet",
        "models": [
            "anthropic/claude-3.7-sonnet",
            "anthropic/claude-3.5-sonnet",
            "openai/gpt-4o",
            "openai/o3-mini",
            "deepseek/deepseek-r1",
            "deepseek/deepseek-chat",
            "meta-llama/llama-3.3-70b-instruct",
            "google/gemini-2.0-flash-001",
        ],
        "base_url": "https://openrouter.ai/api/v1",
        "key_env": "OPENROUTER_API_KEY",
        "key_secret": "OPENROUTER_API_KEY",
    },
    "universal": {
        "name": "Universal API",
        "default_model": "deepseek-chat",
        "models": [
            "deepseek-chat",
            "deepseek-reasoner",
            "qwen-plus",
            "qwen-max",
            "custom",
        ],
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