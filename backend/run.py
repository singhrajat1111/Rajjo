import sys
import os
import argparse
import multiprocessing
from pathlib import Path

# Determine if running inside a frozen PyInstaller bundle
IS_FROZEN = getattr(sys, "frozen", False)

# Immediately ensure stdout and stderr are redirected to file if running frozen or headless
if IS_FROZEN or sys.stdout is None or sys.stderr is None:
    app_data = os.getenv("APPDATA")
    log_dir = (Path(app_data) / "Rajjo" / "logs") if app_data else (Path.home() / ".rajjo" / "logs")
    try:
        log_dir.mkdir(parents=True, exist_ok=True)
        log_file = log_dir / "rajjo_backend.log"
        f = open(log_file, "a", encoding="utf-8", buffering=1)
        if sys.stdout is None or IS_FROZEN:
            sys.stdout = f
        if sys.stderr is None or IS_FROZEN:
            sys.stderr = f
    except Exception:
        pass

# Ensure root and backend directory are in sys.path
backend_dir = Path(__file__).resolve().parent
root_dir = backend_dir.parent
for p in [str(backend_dir), str(root_dir)]:
    if p not in sys.path:
        sys.path.insert(0, p)

if __name__ == "__main__":
    multiprocessing.freeze_support()

    parser = argparse.ArgumentParser(description="Rajjo Backend Production Server")
    parser.add_argument("--port", type=int, default=int(os.getenv("RAJJO_PORT", "8000")), help="Server port")
    parser.add_argument("--host", type=str, default=os.getenv("RAJJO_HOST", "127.0.0.1"), help="Server host")
    parser.add_argument("--reload", action="store_true", default=False, help="Enable auto-reload (development only)")
    args = parser.parse_args()

    # In production frozen mode, never allow reloader
    reload_flag = False if IS_FROZEN else args.reload

    # Import app directly to avoid dynamic import resolution issues in frozen environments
    try:
        from backend.main import app
    except ImportError:
        from main import app

    import uvicorn

    print(f"[Rajjo Backend] Starting server on http://{args.host}:{args.port} (frozen={IS_FROZEN})...", flush=True)
    
    # Configure uvicorn
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_level="info",
        reload=reload_flag,
        access_log=True,
    )
