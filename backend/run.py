import sys
import os
from pathlib import Path

# Ensure root and backend directory in sys.path
backend_dir = Path(__file__).resolve().parent
root_dir = backend_dir.parent
for p in [str(backend_dir), str(root_dir)]:
    if p not in sys.path:
        sys.path.insert(0, p)

if __name__ == "__main__":
    import uvicorn
    print("[Rajjo Backend] Starting server on http://127.0.0.1:8000...")
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, log_level="info", reload=True)
