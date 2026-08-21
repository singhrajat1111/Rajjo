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

for d in [MEMORY_DIR, VECTOR_STORE_DIR, LOGS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# Default Settings
DEFAULT_SETTINGS = {
    "active_provider": "openai",
    "active_model_id": "gpt-4o",
    "custom_base_url": "",
    "ollama_base_url": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
    "gguf_model_path": "",
    "data_dir": str(DATA_DIR),
    "max_iterations": 10,
    "shell_timeout": 30,
    "shell_confirm_destructive": True,
    "theme": "dark"
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

    return {
        "openai": {"configured": bool(openai_key), "masked": mask_key(openai_key)},
        "groq": {"configured": bool(groq_key), "masked": mask_key(groq_key)},
        "anthropic": {"configured": bool(anthropic_key), "masked": mask_key(anthropic_key)},
        "custom": {"configured": bool(custom_key), "masked": mask_key(custom_key)},
    }
