import sqlite3
import uuid
from datetime import datetime, timezone


class ConversationMemory:
    def __init__(self, db_path: str):
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self._init_tables()

    def _init_tables(self):
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                created_at TEXT,
                updated_at TEXT
            )
        """)
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id TEXT,
                role TEXT,
                content TEXT,
                tool_name TEXT,
                created_at TEXT
            )
        """)
        self.conn.commit()

    def get_or_create_conversation(self) -> str:
        row = self.conn.execute(
            "SELECT id FROM conversations ORDER BY updated_at DESC LIMIT 1"
        ).fetchone()
        if row:
            return row["id"]

        conv_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        self.conn.execute(
            "INSERT INTO conversations (id, created_at, updated_at) VALUES (?, ?, ?)",
            (conv_id, now, now),
        )
        self.conn.commit()
        return conv_id

    def add_message(
        self, role: str, content: str, tool_name: str | None = None
    ):
        conv_id = self.get_or_create_conversation()
        now = datetime.now(timezone.utc).isoformat()
        self.conn.execute(
            "INSERT INTO messages (conversation_id, role, content, tool_name, created_at) VALUES (?, ?, ?, ?, ?)",
            (conv_id, role, content, tool_name, now),
        )
        self.conn.execute(
            "UPDATE conversations SET updated_at = ? WHERE id = ?",
            (now, conv_id),
        )
        self.conn.commit()

    def get_messages(self) -> list[dict]:
        conv_id = self.get_or_create_conversation()
        rows = self.conn.execute(
            "SELECT role, content, tool_name FROM messages WHERE conversation_id = ? ORDER BY id",
            (conv_id,),
        ).fetchall()
        return [dict(row) for row in rows]

    def get_openai_messages(self) -> list[dict]:
        """Return messages in OpenAI-compatible format."""
        messages = []
        for msg in self.get_messages():
            if msg["role"] == "tool":
                messages.append({
                    "role": "tool",
                    "content": msg["content"],
                    "tool_call_id": msg["tool_name"] or "",
                })
            else:
                messages.append({
                    "role": msg["role"],
                    "content": msg["content"],
                })
        return messages

    def clear(self):
        conv_id = self.get_or_create_conversation()
        self.conn.execute(
            "DELETE FROM messages WHERE conversation_id = ?", (conv_id,)
        )
        self.conn.commit()

    def close(self):
        self.conn.close()
