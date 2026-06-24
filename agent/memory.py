import json
import sqlite3
import uuid
from datetime import datetime, timezone


class ConversationMemory:
    def __init__(self, db_path: str):
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self._init_tables()
        self._main_conv_id: str | None = None

    def _init_tables(self):
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                parent_id TEXT,
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
                tool_calls TEXT,
                created_at TEXT
            )
        """)
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS current_turn (
                conversation_id TEXT PRIMARY KEY,
                workspace TEXT,
                repos TEXT,
                active_file TEXT,
                provider_id TEXT,
                output_dir TEXT,
                frozen_at TEXT,
                updated_at TEXT
            )
        """)
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS app_state (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)
        self.conn.commit()
        try:
            self.conn.execute("ALTER TABLE conversations ADD COLUMN parent_id TEXT")
        except sqlite3.OperationalError:
            pass  # column already exists

        # Migrate current_turn from old id-based PK to conversation_id PK.
        # Old schema: id INTEGER PRIMARY KEY CHECK (id = 1) — single-row global.
        # New schema: conversation_id TEXT PRIMARY KEY — one row per conversation.
        # For existing DBs, ALTER TABLE ADD COLUMN conversation_id succeeds but
        # conversation_id is not a PK, so ON CONFLICT(conversation_id) fails.
        # Detection: if id is still the PK, drop and recreate.
        cursor = self.conn.execute("PRAGMA table_info(current_turn)")
        cols = {row[1] for row in cursor.fetchall()}
        if "id" in cols:
            # Drop old table and recreate with correct schema.
            self.conn.execute("DROP TABLE current_turn")
            self.conn.execute("""
                CREATE TABLE current_turn (
                    conversation_id TEXT PRIMARY KEY,
                    workspace TEXT,
                    repos TEXT,
                    active_file TEXT,
                    provider_id TEXT,
                    output_dir TEXT,
                    frozen_at TEXT,
                    updated_at TEXT
                )
            """)
            self.conn.commit()

    def get_or_create_conversation(self) -> str:
        row = self.conn.execute(
            "SELECT value FROM app_state WHERE key = 'main_conv_id'"
        ).fetchone()
        if row:
            return row["value"]

        conv_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        self.conn.execute(
            "INSERT INTO conversations (id, created_at, updated_at) VALUES (?, ?, ?)",
            (conv_id, now, now),
        )
        self.conn.execute(
            "INSERT INTO app_state (key, value) VALUES ('main_conv_id', ?)",
            (conv_id,),
        )
        self.conn.commit()
        return conv_id

    def _resolve_conv_id(self, conversation_id: str | None = None) -> str:
        if conversation_id is not None:
            return conversation_id
        if self._main_conv_id is None:
            self._main_conv_id = self.get_or_create_conversation()
        return self._main_conv_id

    def add_message(
        self,
        role: str,
        content: str,
        tool_name: str | None = None,
        tool_calls: list[dict] | None = None,
        conversation_id: str | None = None,
    ):
        conv_id = self._resolve_conv_id(conversation_id)
        now = datetime.now(timezone.utc).isoformat()
        tool_calls_json = json.dumps(tool_calls) if tool_calls else None
        self.conn.execute(
            "INSERT INTO messages (conversation_id, role, content, tool_name, tool_calls, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (conv_id, role, content, tool_name, tool_calls_json, now),
        )
        self.conn.execute(
            "UPDATE conversations SET updated_at = ? WHERE id = ?",
            (now, conv_id),
        )
        self.conn.commit()

    def get_messages(self, conversation_id: str | None = None) -> list[dict]:
        conv_id = self._resolve_conv_id(conversation_id)
        rows = self.conn.execute(
            "SELECT role, content, tool_name, tool_calls FROM messages WHERE conversation_id = ? ORDER BY id",
            (conv_id,),
        ).fetchall()
        return [dict(row) for row in rows]

    def get_openai_messages(self, conversation_id: str | None = None) -> list[dict]:
        """Return messages in OpenAI-compatible format."""
        import json as _json
        messages = []
        for msg in self.get_messages(conversation_id):
            if msg["role"] == "tool":
                messages.append({
                    "role": "tool",
                    "content": msg["content"],
                    "tool_call_id": msg["tool_name"] or "",
                })
            elif msg["role"] == "assistant" and msg["tool_calls"]:
                tc = _json.loads(msg["tool_calls"])
                entry = {"role": "assistant", "tool_calls": tc}
                if msg["content"]:
                    entry["content"] = msg["content"]
                messages.append(entry)
            else:
                messages.append({
                    "role": msg["role"],
                    "content": msg["content"],
                })
        return messages

    def clear(self, conversation_id: str | None = None):
        conv_id = self._resolve_conv_id(conversation_id)
        self.conn.execute(
            "DELETE FROM messages WHERE conversation_id = ?", (conv_id,)
        )
        self.clear_current_workspace(conversation_id)
        self.conn.commit()

    def set_current_workspace(self, ws: dict, conversation_id: str | None = None) -> None:
        """Persist the frozen workspace snapshot for the active round (single row, id=1)."""
        conv_id = self._resolve_conv_id(conversation_id)
        now = datetime.now(timezone.utc).isoformat()
        self.conn.execute(
            """
            INSERT INTO current_turn
                (conversation_id, workspace, repos, active_file, provider_id, output_dir, frozen_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(conversation_id) DO UPDATE SET
                workspace=excluded.workspace,
                repos=excluded.repos,
                active_file=excluded.active_file,
                provider_id=excluded.provider_id,
                output_dir=excluded.output_dir,
                frozen_at=excluded.frozen_at,
                updated_at=excluded.updated_at
            """,
            (
                conv_id,
                ws.get("workspace", ""),
                json.dumps(ws.get("repos", [])),
                ws.get("active_file", ""),
                ws.get("provider_id", ""),
                ws.get("output_dir", ""),
                ws.get("frozen_at", ""),
                now,
            ),
        )
        self.conn.commit()

    def get_current_workspace(self, conversation_id: str | None = None) -> dict | None:
        conv_id = self._resolve_conv_id(conversation_id)
        row = self.conn.execute(
            "SELECT workspace, repos, active_file, provider_id, output_dir, frozen_at "
            "FROM current_turn WHERE conversation_id = ?",
            (conv_id,),
        ).fetchone()
        if not row:
            return None
        return {
            "workspace": row["workspace"],
            "repos": json.loads(row["repos"]) if row["repos"] else [],
            "active_file": row["active_file"],
            "provider_id": row["provider_id"],
            "output_dir": row["output_dir"],
            "frozen_at": row["frozen_at"],
        }

    def clear_current_workspace(self, conversation_id: str | None = None) -> None:
        conv_id = self._resolve_conv_id(conversation_id)
        self.conn.execute("DELETE FROM current_turn WHERE conversation_id = ?", (conv_id,))
        self.conn.commit()

    def create_conversation(self, conv_id: str, parent_id: str | None = None) -> None:
        now = datetime.now(timezone.utc).isoformat()
        self.conn.execute(
            "INSERT OR IGNORE INTO conversations (id, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (conv_id, parent_id, now, now),
        )
        self.conn.commit()

    def get_conversation_children(self) -> list[dict]:
        rows = self.conn.execute(
            "SELECT id as conversation_id, parent_id, created_at FROM conversations WHERE parent_id IS NOT NULL ORDER BY created_at"
        ).fetchall()
        return [dict(row) for row in rows]

    def close(self):
        self.conn.close()
