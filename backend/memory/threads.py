import sqlite3
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional

try:
    from backend.config import DB_PATH
except ImportError:
    from config import DB_PATH

class ThreadStore:
    """
    Persistent SQLite storage for multi-turn threads, conversation messages,
    and agent activity timelines. Solves in-memory loss on app restart.
    """
    def __init__(self):
        self._init_db()

    def _get_conn(self):
        return sqlite3.connect(str(DB_PATH))

    def _init_db(self):
        with self._get_conn() as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS threads (
                    id TEXT PRIMARY KEY,
                    title TEXT,
                    created_at TEXT,
                    updated_at TEXT,
                    metadata TEXT
                )
            ''')
            conn.execute('''
                CREATE TABLE IF NOT EXISTS thread_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    thread_id TEXT,
                    role TEXT,
                    content TEXT,
                    activities TEXT,
                    timestamp TEXT,
                    FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
                )
            ''')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_thread_messages_thread_id ON thread_messages(thread_id)')
            conn.commit()

    def create_thread(self, title: Optional[str] = None, metadata: Optional[dict] = None) -> str:
        thread_id = f"thread_{uuid.uuid4().hex[:12]}"
        now = datetime.now().isoformat()
        t_title = title or "New Conversation"
        meta_json = json.dumps(metadata or {})
        with self._get_conn() as conn:
            conn.execute(
                "INSERT INTO threads (id, title, created_at, updated_at, metadata) VALUES (?, ?, ?, ?, ?)",
                (thread_id, t_title, now, now, meta_json)
            )
            conn.commit()
        return thread_id

    def list_threads(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                """
                SELECT t.id, t.title, t.created_at, t.updated_at, t.metadata,
                       COUNT(m.id) as message_count
                FROM threads t
                LEFT JOIN thread_messages m ON t.id = m.thread_id
                GROUP BY t.id
                ORDER BY t.updated_at DESC
                LIMIT ?
                """,
                (limit,)
            )
            rows = cursor.fetchall()
            results = []
            for r in rows:
                results.append({
                    "id": r["id"],
                    "title": r["title"],
                    "created_at": r["created_at"],
                    "updated_at": r["updated_at"],
                    "metadata": json.loads(r["metadata"]) if r["metadata"] else {},
                    "message_count": r["message_count"]
                })
            return results

    def get_thread(self, thread_id: str) -> Optional[Dict[str, Any]]:
        with self._get_conn() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute("SELECT * FROM threads WHERE id = ?", (thread_id,))
            row = cursor.fetchone()
            if not row:
                return None
            return {
                "id": row["id"],
                "title": row["title"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
                "metadata": json.loads(row["metadata"]) if row["metadata"] else {}
            }

    def update_thread_title(self, thread_id: str, title: str) -> bool:
        now = datetime.now().isoformat()
        with self._get_conn() as conn:
            cursor = conn.execute(
                "UPDATE threads SET title = ?, updated_at = ? WHERE id = ?",
                (title, now, thread_id)
            )
            conn.commit()
            return cursor.rowcount > 0

    def delete_thread(self, thread_id: str) -> bool:
        with self._get_conn() as conn:
            conn.execute("DELETE FROM thread_messages WHERE thread_id = ?", (thread_id,))
            cursor = conn.execute("DELETE FROM threads WHERE id = ?", (thread_id,))
            conn.commit()
            return cursor.rowcount > 0

    def add_message(self, thread_id: str, role: str, content: str, activities: Optional[list] = None) -> int:
        # Ensure thread exists
        if not self.get_thread(thread_id):
            self.create_thread(title=content[:40] if role == "user" else "Conversation")

        now = datetime.now().isoformat()
        act_json = json.dumps(activities or [])
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO thread_messages (thread_id, role, content, activities, timestamp) VALUES (?, ?, ?, ?, ?)",
                (thread_id, role, content, act_json, now)
            )
            # Update thread updated_at
            conn.execute("UPDATE threads SET updated_at = ? WHERE id = ?", (now, thread_id))
            conn.commit()
            return cursor.lastrowid

    def get_messages(self, thread_id: str) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                "SELECT * FROM thread_messages WHERE thread_id = ? ORDER BY id ASC",
                (thread_id,)
            )
            rows = cursor.fetchall()
            results = []
            for r in rows:
                results.append({
                    "id": r["id"],
                    "thread_id": r["thread_id"],
                    "role": r["role"],
                    "content": r["content"],
                    "activities": json.loads(r["activities"]) if r["activities"] else [],
                    "timestamp": r["timestamp"]
                })
            return results

    def clear_all_threads(self) -> bool:
        with self._get_conn() as conn:
            conn.execute("DELETE FROM thread_messages")
            conn.execute("DELETE FROM threads")
            conn.commit()
            return True

thread_store = ThreadStore()
