# Agent Round Config Freeze Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze the agent's workspace/repos/active-file config at the start of a conversation round, persist it with the conversation across server restarts, and reset it on Clear.

**Architecture:** The renderer (`AgentDialog`) snapshots live app state into a `FrozenContext` when the first message of a round is sent, and sends that frozen snapshot (not live state) on every subsequent message. The backend persists conversation messages plus a single-row `current_turn` snapshot table to `~/.code-note-studio/agent-conversation.db`; `AgentLoop` only constructs the system message on the first turn and otherwise reuses the persisted one. After server restart the renderer restores the round by fetching `/history`, which returns messages plus the frozen snapshot.

**Tech Stack:** Python 3 / FastAPI / sqlite3 (backend, tests via pytest+httpx); React + TypeScript / Electron (renderer, tests via vitest + @testing-library/react).

## Global Constraints

- Persisted DB path: `~/.code-note-studio/agent-conversation.db` (expanduser).
- The authoritative frozen config on the backend is the first `role=system` message text; the `current_turn` structured fields are only for UI recovery and next-request body assembly.
- One round = first message sent after (open dialog | last Clear). Freezing happens on send, not on dialog open.
- Freeze scope: active file path (one), repos (now always a single-element list from `state.codeRepoPath`), workspace, selected provider id.
- After Clear, the next message starts a fresh round and re-freezes from live state.
- The frozen-snapshot-dropped-but-messages-present inconsistency is tolerated: the agent continues using its persisted system message; no history is dropped, no re-freeze.

---

## File Structure

- `agent/memory.py` (modify) — add `current_turn` table + `set_current_workspace` / `get_current_workspace` / `clear_current_workspace`.
- `agent/server.py` (modify) — default DB to `~/.code-note-studio/agent-conversation.db`; `/chat` persists snapshot after first-turn system message; `/history` GET returns `frozen`; `/history` DELETE clears snapshot too.
- `agent/agent_loop.py` (modify) — first turn persists snapshot via `memory.set_current_workspace`; primality check `len(existing) == 0` semantics named.
- `agent/tests/test_memory.py` (modify) — tests for the three new methods.
- `agent/tests/test_agent_loop.py` (modify) — test that first turn persists snapshot, second turn reuses system message.
- `agent/tests/test_server.py` (modify) — test `/history` carries `frozen`, DELETE clears it, restart recovery.
- `src/renderer/src/components/AgentDialog.tsx` (modify) — `FrozenContext` + `frozen`/`frozenRef` state + derive `roundState` + freeze on first send + send from `frozenRef` + clear `frozen` on Clear + three-state header display + `/history` restore.
- `tests/renderer/AgentDialog.test.tsx` (create) — test freeze-from-first-send and clear-resets-freeze via a pure helper `deriveRoundState` and a `buildFrozenFromState` extractor.

The pure helpers (`deriveRoundState`, `buildFrozenFromState`) are extracted from `AgentDialog` into the same file as exported non-component functions so they can be unit-tested without driving the network streaming.

---

### Task 1: Add `current_turn` snapshot table and methods to `ConversationMemory`

**Files:**
- Modify: `agent/memory.py`
- Test: `agent/tests/test_memory.py`

**Interfaces:**
- Produces: `ConversationMemory.set_current_workspace(ws: dict) -> None`, `ConversationMemory.get_current_workspace() -> dict | None`, `ConversationMemory.clear_current_workspace() -> None`. Each instance also creates a `current_turn` table on init. `ws` dict shape: `{"workspace": str, "repos": list[str], "active_file": str, "provider_id": str, "output_dir": str, "frozen_at": str}`.

- [ ] **Step 1: Write failing tests for the three new methods**

Append to `agent/tests/test_memory.py` inside the `TestConversationMemory` class:

```python
    def test_current_turn_table_created(self, memory):
        cursor = memory.conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )
        tables = [row[0] for row in cursor.fetchall()]
        assert "current_turn" in tables

    def test_set_and_get_current_workspace(self, memory):
        ws = {
            "workspace": "/ws",
            "repos": ["/repo"],
            "active_file": "/ws/a.py",
            "provider_id": "p1",
            "output_dir": "/ws/docs",
            "frozen_at": "2026-06-24T00:00:00+00:00",
        }
        memory.set_current_workspace(ws)
        got = memory.get_current_workspace()
        assert got == ws

    def test_set_current_workspace_upserts_single_row(self, memory):
        memory.set_current_workspace({"workspace": "/a", "repos": [], "active_file": "",
                                      "provider_id": "", "output_dir": "", "frozen_at": "t1"})
        memory.set_current_workspace({"workspace": "/b", "repos": [], "active_file": "",
                                      "provider_id": "", "output_dir": "", "frozen_at": "t2"})
        rows = memory.conn.execute("SELECT COUNT(*) FROM current_turn").fetchone()
        assert rows[0] == 1
        assert memory.get_current_workspace()["workspace"] == "/b"

    def test_get_current_workspace_null_when_empty(self, memory):
        assert memory.get_current_workspace() is None

    def test_clear_current_workspace(self, memory):
        memory.set_current_workspace({"workspace": "/ws", "repos": [], "active_file": "",
                                      "provider_id": "", "output_dir": "", "frozen_at": "t"})
        memory.clear_current_workspace()
        assert memory.get_current_workspace() is None
        rows = memory.conn.execute("SELECT COUNT(*) FROM current_turn").fetchone()
        assert rows[0] == 0

    def test_clear_also_clears_current_workspace(self, memory):
        memory.add_message("user", "hi")
        memory.set_current_workspace({"workspace": "/ws", "repos": [], "active_file": "",
                                      "provider_id": "", "output_dir": "", "frozen_at": "t"})
        memory.clear()
        assert len(memory.get_messages()) == 0
        assert memory.get_current_workspace() is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd agent && python -m pytest tests/test_memory.py -v`
Expected: FAIL — `AttributeError: 'ConversationMemory' object has no attribute 'set_current_workspace'` (and methods missing).

- [ ] **Step 3: Implement the table and methods**

In `agent/memory.py`, add the `current_turn` table to `_init_tables` and the three methods. Replace the `_init_tables` method body's table section:

```python
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
                tool_calls TEXT,
                created_at TEXT
            )
        """)
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS current_turn (
                id INTEGER PRIMARY KEY CHECK (id = 1),
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
```

Add the three methods to the class (after `clear`, before `close`):

```python
    def set_current_workspace(self, ws: dict) -> None:
        """Persist the frozen workspace snapshot for the active round (single row, id=1)."""
        now = datetime.now(timezone.utc).isoformat()
        self.conn.execute(
            """
            INSERT INTO current_turn
                (id, workspace, repos, active_file, provider_id, output_dir, frozen_at, updated_at)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                workspace=excluded.workspace,
                repos=excluded.repos,
                active_file=excluded.active_file,
                provider_id=excluded.provider_id,
                output_dir=excluded.output_dir,
                frozen_at=excluded.frozen_at,
                updated_at=excluded.updated_at
            """,
            (
                1,
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

    def get_current_workspace(self) -> dict | None:
        row = self.conn.execute(
            "SELECT workspace, repos, active_file, provider_id, output_dir, frozen_at "
            "FROM current_turn WHERE id = 1"
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

    def clear_current_workspace(self) -> None:
        self.conn.execute("DELETE FROM current_turn WHERE id = 1")
        self.conn.commit()
```

Update the existing `clear` method to also clear the snapshot. Replace `clear`:

```python
    def clear(self):
        conv_id = self.get_or_create_conversation()
        self.conn.execute(
            "DELETE FROM messages WHERE conversation_id = ?", (conv_id,)
        )
        self.clear_current_workspace()
        self.conn.commit()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd agent && python -m pytest tests/test_memory.py -v`
Expected: PASS — all tests including new ones green.

- [ ] **Step 5: Commit**

```bash
git add agent/memory.py agent/tests/test_memory.py
git commit -m "feat: persist agent round workspace snapshot in current_turn table"
```

---

### Task 2: `AgentLoop` persists snapshot on first turn

**Files:**
- Modify: `agent/agent_loop.py`
- Test: `agent/tests/test_agent_loop.py`

**Interfaces:**
- Consumes: `ConversationMemory.set_current_workspace` (from Task 1).
- Produces: `AgentLoop.run` writes the snapshot on the first turn only. No signature change.

- [ ] **Step 1: Write failing test for first-turn snapshot persistence**

Append to `agent/tests/test_agent_loop.py`:

```python
class TestAgentLoopSnapshot:
    @pytest.fixture
    def registry_with_tools(self):
        from tools.registry import ToolRegistry
        reg = ToolRegistry()
        reg.register(
            name="echo",
            description="Echo back the input",
            parameters={"type": "object", "properties": {"message": {"type": "string"}}, "required": ["message"]},
            handler=lambda message: {"ok": True, "echo": message},
        )
        return reg

    @pytest.fixture
    def memory(self):
        from memory import ConversationMemory
        return ConversationMemory(":memory:")

    @pytest.mark.asyncio
    async def test_first_turn_persists_snapshot(self, registry_with_tools, memory):
        provider = FakeProvider([[{"type": "text", "content": "ok"}, {"type": "done"}]])
        agent = AgentLoop(
            provider=provider, registry=registry_with_tools, memory=memory,
            workspace="/ws", repos=["/repo"], output_dir="/ws/docs", max_steps=5,
            active_file="/ws/a.py",
        )
        async for _ in agent.run("hello"):
            pass
        ws = memory.get_current_workspace()
        assert ws is not None
        assert ws["workspace"] == "/ws"
        assert ws["repos"] == ["/repo"]
        assert ws["active_file"] == "/ws/a.py"
        assert ws["output_dir"] == "/ws/docs"
        assert ws["provider_id"] == ""
        assert ws["frozen_at"] != ""

    @pytest.mark.asyncio
    async def test_second_turn_does_not_overwrite_snapshot(self, registry_with_tools, memory):
        # One FakeProvider instance scripted for two calls.
        provider = FakeProvider([
            [{"type": "text", "content": "one"}, {"type": "done"}],
            [{"type": "text", "content": "two"}, {"type": "done"}],
        ])
        agent_a = AgentLoop(
            provider=provider, registry=registry_with_tools, memory=memory,
            workspace="/ws", repos=["/repo"], output_dir="/ws/docs", max_steps=5,
            active_file="/ws/a.py",
        )
        async for _ in agent_a.run("first"):
            pass
        first_frozen_at = memory.get_current_workspace()["frozen_at"]

        # A NEW AgentLoop with DIFFERENT workspace, simulating a later message
        # where live state has changed but the round should stay frozen.
        agent_b = AgentLoop(
            provider=provider, registry=registry_with_tools, memory=memory,
            workspace="/changed", repos=["/other"], output_dir="/changed/docs", max_steps=5,
            active_file="/changed/b.py",
        )
        async for _ in agent_b.run("second"):
            pass

        ws = memory.get_current_workspace()
        # Snapshot must still reflect the FIRST turn's frozen config.
        assert ws["workspace"] == "/ws"
        assert ws["repos"] == ["/repo"]
        assert ws["active_file"] == "/ws/a.py"
        assert ws["output_dir"] == "/ws/docs"
        assert ws["frozen_at"] == first_frozen_at
        # Only one system message persisted.
        systems = [m for m in memory.get_messages() if m["role"] == "system"]
        assert len(systems) == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && python -m pytest tests/test_agent_loop.py::TestAgentLoopSnapshot -v`
Expected: FAIL — `ws is None` (snapshot not persisted on first turn).

- [ ] **Step 3: Implement snapshot persistence on first turn**

In `agent/agent_loop.py`, the first-turn block currently builds and stores the system message. Add snapshot persistence after `self.memory.add_message("system", system_msg)`. Replace this block (around lines 33-46):

```python
            existing = self.memory.get_messages()
            is_pending_first_turn = len(existing) == 0
            if is_pending_first_turn:
                tools_summary = [
                    {"name": t["name"], "description": t["description"]}
                    for t in self.registry.tools.values()
                ]
                system_msg = build_system_message(
                    workspace=self.workspace,
                    repos=self.repos,
                    output_dir=self.output_dir,
                    tools_summary=tools_summary,
                    active_file=self.active_file,
                )
                self.memory.add_message("system", system_msg)
                # Freeze the round's config: the system message above is the
                # authoritative frozen config; this structured snapshot is for
                # UI recovery and next-request body assembly.
                self.memory.set_current_workspace({
                    "workspace": self.workspace,
                    "repos": self.repos,
                    "active_file": self.active_file,
                    "provider_id": getattr(self, "provider_id", "") or "",
                    "output_dir": self.output_dir,
                    "frozen_at": datetime.now(timezone.utc).isoformat(),
                })
```

Add the imports at the top of `agent/agent_loop.py`:

```python
from datetime import datetime, timezone
```

(The `getattr(self, "provider_id", "")` fallback keeps it safe since `AgentLoop` currently has no `provider_id` attribute; the value stays `""` here and is populated by the server — see Task 3.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && python -m pytest tests/test_agent_loop.py::TestAgentLoopSnapshot -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agent/agent_loop.py agent/tests/test_agent_loop.py
git commit -m "feat: agent loop persists round config snapshot on first turn"
```

---

### Task 3: Server defaults to persisted DB, persists `provider_id` in snapshot, and returns `frozen` from `/history`

**Files:**
- Modify: `agent/server.py`
- Test: `agent/tests/test_server.py`

**Interfaces:**
- Consumes: `ConversationMemory.set_current_workspace` / `get_current_workspace` / `clear_current_workspace` (Task 1), `AgentLoop` snapshot persistence (Task 2).
- Produces: `/chat` accepts the request as before (the snapshot's `provider_id` is set from `provider_id` in the request body on the first turn). `GET /history` returns `{"ok": true, "messages": [...], "frozen": <snapshot or null>}`. `DELETE /history` clears both messages and snapshot.

- [ ] **Step 1: Write failing server tests**

Append to `agent/tests/test_server.py`:

```python
@pytest.mark.asyncio
async def test_history_returns_frozen_snapshot_after_chat(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/chat", json={
            "message": "hello", "provider_id": "fake",
            "workspace": "/ws", "repos": ["/repo"], "active_file": "/ws/a.py",
            "output_dir": "/ws/docs",
        })
        resp = await client.get("/history")
        data = resp.json()
        assert data["ok"] is True
        assert data["frozen"] is not None
        assert data["frozen"]["workspace"] == "/ws"
        assert data["frozen"]["repos"] == ["/repo"]
        assert data["frozen"]["active_file"] == "/ws/a.py"
        assert data["frozen"]["provider_id"] == "fake"


@pytest.mark.asyncio
async def test_history_frozen_null_before_any_chat(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/history")
        assert resp.json()["frozen"] is None


@pytest.mark.asyncio
async def test_clear_clears_messages_and_snapshot(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/chat", json={
            "message": "hello", "provider_id": "fake",
            "workspace": "/ws", "repos": ["/repo"], "active_file": "", "output_dir": "/ws/docs",
        })
        await client.delete("/history")
        resp = await client.get("/history")
        data = resp.json()
        assert data["messages"] == []
        assert data["frozen"] is None


@pytest.mark.asyncio
async def test_subsequent_chat_does_not_overwrite_snapshot(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/chat", json={
            "message": "first", "provider_id": "fake",
            "workspace": "/ws", "repos": ["/repo"], "active_file": "/ws/a.py",
            "output_dir": "/ws/docs",
        })
        frozen_at_1 = (await (await client.get("/history")).json())["frozen"]["frozen_at"]
        # Second message: live state has changed in the request body.
        await client.post("/chat", json={
            "message": "second", "provider_id": "fake",
            "workspace": "/changed", "repos": ["/other"], "active_file": "/changed/b.py",
            "output_dir": "/changed/docs",
        })
        data = (await (await client.get("/history")).json())
        # Snapshot still reflects the first turn.
        assert data["frozen"]["workspace"] == "/ws"
        assert data["frozen"]["repos"] == ["/repo"]
        assert data["frozen"]["frozen_at"] == frozen_at_1
        # Only one system message.
        systems = [m for m in data["messages"] if m["role"] == "system"]
        assert len(systems) == 1


@pytest.mark.asyncio
async def test_restart_recovery_restores_messages_and_snapshot(tmp_path):
    import os
    from server import create_app
    from memory import ConversationMemory
    from tools.registry import ToolRegistry
    from agent_loop import AgentLoop

    db_path = os.path.join(str(tmp_path), "agent.db")

    def build():
        memory = ConversationMemory(db_path)
        registry = ToolRegistry()
        def make_agent(provider, workspace, repos, output_dir):
            return AgentLoop(provider=provider, registry=registry, memory=memory,
                             workspace=workspace or "/ws", repos=repos or [],
                             output_dir=output_dir or "/ws/docs", max_steps=5)
        return create_app(make_agent, memory), memory

    app1, memory1 = build()
    transport = ASGITransport(app=app1)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/chat", json={
            "message": "hello", "provider_id": "fake",
            "workspace": "/ws", "repos": ["/repo"], "active_file": "/ws/a.py", "output_dir": "/ws/docs",
        })

    memory1.close()
    # Simulate restart: brand new memory + app pointing at same on-disk DB.
    app2, memory2 = build()
    transport2 = ASGITransport(app=app2)
    async with AsyncClient(transport=transport2, base_url="http://test") as client:
        resp = await client.get("/history")
        data = resp.json()
        # History persisted across the new ConversationMemory instance.
        assert data["frozen"] is not None
        assert data["frozen"]["workspace"] == "/ws"
        assert any(m["role"] == "system" for m in data["messages"])
        assert any(m["role"] == "user" and m["content"] == "hello" for m in data["messages"])
    memory2.close()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd agent && python -m pytest tests/test_server.py -v`
Expected: FAIL — `test_history_returns_frozen_snapshot_after_chat` (`frozen` key absent / None), and `test_clear_clears_messages_and_snapshot`.

- [ ] **Step 3: Implement server changes**

In `agent/server.py`:

(a) Default the memory DB to the persisted path when no `memory` is passed. Replace the `if memory is None:` block (around line 148-149):

```python
    if memory is None:
        db_path = os.path.expanduser("~/.code-note-studio/agent-conversation.db")
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        memory = ConversationMemory(db_path)
```

(b) Pass the request's `provider_id` into `AgentLoop` so the first-turn snapshot records it. Update the `AgentLoop(...)` construction (the non-factory branch, around lines 196-204) to add `provider_id=provider_id`:

```python
            agent = AgentLoop(
                provider=provider,
                registry=registry,
                memory=memory,
                workspace=workspace,
                repos=repos,
                output_dir=output_dir,
                active_file=active_file,
                provider_id=provider_id,
            )
```

(c) Add `provider_id` as a constructor param. In `agent/agent_loop.py`, update `__init__` signature and assignment:

```python
    def __init__(
        self,
        provider: BaseProvider,
        registry: ToolRegistry,
        memory: ConversationMemory,
        workspace: str,
        repos: list[str],
        output_dir: str,
        max_steps: int = 80,
        active_file: str = "",
        provider_id: str = "",
    ):
        self.provider = provider
        self.registry = registry
        self.memory = memory
        self.workspace = workspace
        self.repos = repos
        self.output_dir = output_dir
        self.max_steps = max_steps
        self.active_file = active_file
        self.provider_id = provider_id
        self._activated_skills: set[str] = set()
```

And change the Task 2 snapshot line `getattr(self, "provider_id", "") or ""` to simply `self.provider_id`.

(d) Return `frozen` from `GET /history` and clear the snapshot on `DELETE /history`. Replace the two history handlers (around lines 212-221):

```python
    @app.get("/history")
    async def get_history():
        messages = memory.get_messages()
        user_visible = [m for m in messages if m["role"] != "system"]
        return {
            "ok": True,
            "messages": user_visible,
            "frozen": memory.get_current_workspace(),
        }

    @app.delete("/history")
    async def clear_history():
        memory.clear()
        return {"ok": True}
```

(`memory.clear()` already clears both messages and snapshot per Task 1.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd agent && python -m pytest tests/test_server.py -v`
Expected: PASS — all tests including new ones. Also rerun the loop tests:

```bash
cd agent && python -m pytest tests/test_agent_loop.py tests/test_memory.py -v
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agent/server.py agent/agent_loop.py agent/tests/test_server.py
git commit -m "feat: persist agent conversation DB and expose frozen snapshot in /history"
```

---

### Task 4: Renderer — freeze config on first send, send from frozen, reset on Clear

**Files:**
- Modify: `src/renderer/src/components/AgentDialog.tsx`
- Test: `tests/renderer/AgentDialog.test.tsx`

**Interfaces:**
- Consumes: `/history` now returns `{ ok, messages, frozen }` (Task 3); `/chat` accepts `{ message, provider_id, workspace, repos, active_file }` as before (but will be sent from frozen values on subsequent messages).
- Produces: pure exported helpers `buildFrozenFromState(state, selectedProvider) -> FrozenContext` and `deriveRoundState(messagesLen, frozen) -> "pending" | "frozen" | "staleContext"`, plus the updated `AgentDialog`.

- [ ] **Step 1: Write failing tests for the pure helpers**

Create `tests/renderer/AgentDialog.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { buildFrozenFromState, deriveRoundState } from '../../src/renderer/src/components/AgentDialog'
import { initialState } from '../../src/renderer/src/contexts/AppContext'
import type { AppState } from '../../src/renderer/src/types'

describe('buildFrozenFromState', () => {
  it('freezes workspace, repo, active file, and provider', () => {
    const state: AppState = {
      ...initialState,
      workspacePath: '/ws',
      codeRepoPath: '/repo',
      openCodeFiles: [{ path: '/ws/a.py', content: 'x', language: 'python' } as any],
      activeCodeFileIndex: 0,
    }
    const frozen = buildFrozenFromState(state, 'p1')
    expect(frozen.workspace).toBe('/ws')
    expect(frozen.repos).toEqual(['/repo'])
    expect(frozen.activeFile).toBe('/ws/a.py')
    expect(frozen.providerId).toBe('p1')
    expect(frozen.frozenAt).not.toBe('')
  })

  it('falls back to empty repo list when no code repo path', () => {
    const state: AppState = { ...initialState, workspacePath: '/ws' }
    const frozen = buildFrozenFromState(state, 'p1')
    expect(frozen.repos).toEqual([])
    expect(frozen.activeFile).toBe('')
  })
})

describe('deriveRoundState', () => {
  it('pending when no messages', () => {
    expect(deriveRoundState(0, null)).toBe('pending')
  })
  it('frozen when messages exist and snapshot present', () => {
    expect(deriveRoundState(5, { workspace: '/ws', repos: [], activeFile: '', providerId: '', frozenAt: 't' } as any)).toBe('frozen')
  })
  it('staleContext when messages exist but snapshot is null', () => {
    expect(deriveRoundState(5, null)).toBe('staleContext')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/renderer/AgentDialog.test.tsx`
Expected: FAIL — `buildFrozenFromState` / `deriveRoundState` are not exported (import error).

- [ ] **Step 3: Add the helpers and the freeze logic to AgentDialog**

In `src/renderer/src/components/AgentDialog.tsx`:

(a) Add the interface and helpers near the top of the file (after the existing imports):

```ts
export interface FrozenContext {
  workspace: string
  repos: string[]
  activeFile: string
  providerId: string
  frozenAt: string
}

export function buildFrozenFromState(state: any, selectedProvider: string): FrozenContext {
  const activeFilePath =
    state.activeCodeFileIndex >= 0
      ? state.openCodeFiles?.[state.activeCodeFileIndex]?.path || ''
      : ''
  return {
    workspace: state.workspacePath || '',
    repos: state.codeRepoPath ? [state.codeRepoPath] : [],
    activeFile: activeFilePath,
    providerId: selectedProvider || '',
    frozenAt: new Date().toISOString(),
  }
}

export type RoundState = 'pending' | 'frozen' | 'staleContext'

export function deriveRoundState(messagesLen: number, frozen: FrozenContext | null): RoundState {
  if (messagesLen === 0) return 'pending'
  return frozen ? 'frozen' : 'staleContext'
}
```

(b) Add `frozen` state + `frozenRef` inside the `AgentDialog` component (next to the other `useState` calls, around line 25-33):

```tsx
  const [frozen, setFrozen] = useState<FrozenContext | null>(null)
  const frozenRef = useRef<FrozenContext | null>(null)
  const roundIdRef = useRef<number>(0)
  useEffect(() => { frozenRef.current = frozen }, [frozen])
```

(c) Update the `/history` load effect (lines 60-72) to restore `frozen`:

Replace:
```tsx
      try {
        const resp = await fetch(`http://127.0.0.1:${p}/history`)
        const data = await resp.json()
        if (data.ok && data.messages.length > 0) {
          setMessages(data.messages.map((m: any) => ({
            id: Math.random().toString(36),
            role: m.role === 'tool' ? 'tool_result' : m.role,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            toolName: m.tool_name,
          })))
        }
      } catch {}
```
with:
```tsx
      try {
        const resp = await fetch(`http://127.0.0.1:${p}/history`)
        const data = await resp.json()
        if (data.ok) {
          const restored = data.messages.map((m: any) => ({
            id: Math.random().toString(36),
            role: m.role === 'tool' ? 'tool_result' : m.role,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            toolName: m.tool_name,
          }))
          setMessages(restored)
          // Restore the round snapshot if the backend persisted one.
          // Backend snapshot uses snake_case; map to the frontend FrozenContext.
          const f = data.frozen
          setFrozen(f ? {
            workspace: f.workspace || '',
            repos: Array.isArray(f.repos) ? f.repos : [],
            activeFile: f.active_file || '',
            providerId: f.provider_id || '',
            frozenAt: f.frozen_at || '',
          } : null)
        }
      } catch {}
```

(d) Update `handleSend` to freeze on the first send and send from `frozenRef`. Replace the body of `handleSend`'s `try` block where it builds the request (lines ~95-118). Inside `handleSend`, after computing `userMsg` and `setInput('')` / `setLoading(true)`, and before the `fetch`:

```tsx
    // Freeze config on the first send of a round only.
    const msgCount = messages.length
    const rs = deriveRoundState(msgCount, frozenRef.current)
    let snapshot = frozenRef.current
    if (rs === 'pending') {
      snapshot = buildFrozenFromState(state, selectedProvider)
      setFrozen(snapshot)
      frozenRef.current = snapshot
      roundIdRef.current += 1
    }
```

Then change the `fetch` body to use `snapshot` instead of live `state`:

```tsx
      const response = await fetch(`http://127.0.0.1:${port}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg.content,
          provider_id: snapshot?.providerId || selectedProvider,
          workspace: snapshot?.workspace || '',
          repos: snapshot?.repos || [],
          active_file: snapshot?.activeFile || '',
        }),
      })
```

Remove `state.workspacePath` and `state.codeRepoPath` from the `useCallback` dependency array (they are no longer read on send — only `messages` is needed for the round-state derivation). Update the dependency array to:

```tsx
  }, [input, port, loading, selectedProvider, messages])
```

(e) Update `handleClearHistory` to reset `frozen`:

Replace the `handleClearHistory` body (lines 206-212) with:

```tsx
  const handleClearHistory = async () => {
    if (!port) return
    try {
      await fetch(`http://127.0.0.1:${port}/history`, { method: 'DELETE' })
      setMessages([])
      setFrozen(null)
      frozenRef.current = null
    } catch {}
  }
```

(f) Update the header context display for the three states. Compute `roundState` before the `return`:

```tsx
  const roundState = deriveRoundState(messages.length, frozen)
  const repoLabel =
    roundState === 'frozen'
      ? (frozen!.repos[0]?.split('/').pop() || 'none')
      : roundState === 'pending'
      ? (state.codeRepoPath?.split('/').pop() || 'none')
      : '快照不可用'
```

Replace the `agent-dialog-context` block (lines ~254-261):

```tsx
            <div className="agent-dialog-context">
              <select value={selectedProvider} onChange={(e) => setSelectedProvider(e.target.value)}>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.model})</option>
                ))}
              </select>
              <span title={frozen?.activeFile || state.codeRepoPath || ''}>
                {roundState === 'frozen' ? '🔒 ' : ''}Repo: {repoLabel}
              </span>
            </div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/renderer/AgentDialog.test.tsx`
Expected: PASS.

- [ ] **Step 5: Manual smoke check + typecheck**

Run: `npx tsc --noEmit -p tsconfig.web.json`
Expected: no errors (fix any `any`-related type complaints; the helpers intentionally use `any` for `state` to match the existing loose typing in `AppContext`).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/AgentDialog.tsx tests/renderer/AgentDialog.test.tsx
git commit -m "feat: freeze agent round config on first send and reset on Clear"
```

---

### Task 5: Full test sweep and manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run backend test suite**

Run: `cd agent && python -m pytest -v`
Expected: all green.

- [ ] **Step 2: Run frontend test suite**

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 3: Manual flow check**

Build/start the app (`npm run dev` or the project's run command), open the agent dialog, send a message with a code repo active, then switch to a different file and send another — verify the second request's body (via the agent's behavior or network) still references the originally-frozen file/repo. Click Clear, verify messages reset and the next message starts a fresh frozen round. Restart the app and reopen the dialog — verify the prior conversation and frozen snapshot are restored.

- [ ] **Step 4: Commit nothing (verification step)**

No commit required. If any defect surfaces, file a follow-up task.