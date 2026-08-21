import sqlite3
import json
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional
try:
    from backend.config import DB_PATH
except ImportError:
    from config import DB_PATH

class EpisodicMemory:
    """
    SQLite-based episodic memory to store every task run:
    timestamp, user_input, plan, history, outcome, status.
    """
    def __init__(self):
        self._init_db()

    def _get_conn(self):
        return sqlite3.connect(str(DB_PATH))

    def _init_db(self):
        with self._get_conn() as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT,
                    user_input TEXT,
                    plan TEXT,
                    history TEXT,
                    outcome TEXT,
                    status TEXT
                )
            ''')
            conn.commit()

    def save_task(self, user_input: str, plan: str, history: List[Dict[str, Any]], outcome: str, status: str) -> int:
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO tasks (timestamp, user_input, plan, history, outcome, status) VALUES (?, ?, ?, ?, ?, ?)",
                (datetime.now().isoformat(), user_input, plan, json.dumps(history), outcome, status)
            )
            conn.commit()
            return cursor.lastrowid

    def get_recent_tasks(self, limit: int = 20) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute("SELECT * FROM tasks ORDER BY id DESC LIMIT ?", (limit,))
            rows = cursor.fetchall()
            results = []
            for r in rows:
                results.append({
                    "id": r["id"],
                    "timestamp": r["timestamp"],
                    "user_input": r["user_input"],
                    "plan": r["plan"],
                    "history": json.loads(r["history"]) if r["history"] else [],
                    "outcome": r["outcome"],
                    "status": r["status"]
                })
            return results

    def search_tasks(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                "SELECT * FROM tasks WHERE user_input LIKE ? OR plan LIKE ? OR outcome LIKE ? ORDER BY id DESC LIMIT ?",
                (f"%{query}%", f"%{query}%", f"%{query}%", limit)
            )
            rows = cursor.fetchall()
            results = []
            for r in rows:
                results.append({
                    "id": r["id"],
                    "timestamp": r["timestamp"],
                    "user_input": r["user_input"],
                    "plan": r["plan"],
                    "history": json.loads(r["history"]) if r["history"] else [],
                    "outcome": r["outcome"],
                    "status": r["status"]
                })
            return results

    def delete_task(self, task_id: int) -> bool:
        with self._get_conn() as conn:
            cursor = conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
            conn.commit()
            return cursor.rowcount > 0

    def clear_all(self) -> bool:
        with self._get_conn() as conn:
            conn.execute("DELETE FROM tasks")
            conn.commit()
            return True

    def export_data(self) -> List[Dict[str, Any]]:
        return self.get_recent_tasks(limit=1000)

    def import_data(self, tasks: List[Dict[str, Any]]) -> int:
        count = 0
        for t in tasks:
            self.save_task(
                user_input=t.get("user_input", ""),
                plan=t.get("plan", ""),
                history=t.get("history", []),
                outcome=t.get("outcome", ""),
                status=t.get("status", "imported")
            )
            count += 1
        return count

episodic = EpisodicMemory()
