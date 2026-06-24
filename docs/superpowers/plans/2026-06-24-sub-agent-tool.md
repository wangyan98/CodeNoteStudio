# Sub-Agent Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the main agent a `create_subagent` tool that delegates subtasks to parallel child agents with isolated context and triple-gate nesting prevention.

**Architecture:** Reuse the existing `AgentLoop`/`ConversationMemory`/`ToolRegistry` stack. Multi-conversationalize the memory to support parallel child loops. Upgrade the tool registry to execute async handlers. Add a `create_subagent` tool that inherits parent history (tool results redacted), injects anti-nesting tags, and gathers parallel child loops.

**Tech Stack:** Python 3.14, asyncio, pytest + pytest-asyncio 1.4.0, sqlite3, httpx

## Global Constraints

- All new params on existing methods default to `None` — existing call sites and tests must not break.
- Child agent loops reuse the parent's `provider` instance (same model, same httpx client — sequential execution within the tool handler).
- Workspace/repos/active_file for children are sourced from the **main agent's frozen `current_turn`** snapshot (TODO #26), not from fresh request params.
- Tests run with `cd agent && pytest`.
- Sub-agent tool is the only async handler in the registry; all others remain sync.

---

### Task 1: Multi-conversation `ConversationMemory`

**Files:**
- Modify: `agent/memory.py`
- Modify: `agent/tests/test_memory.py`

**Interfaces:**
- Consumes: _(none — foundational task)_
- Produces:
  - `ConversationMemory.add_message(..., conversation_id: str | None = None)`
  - `ConversationMemory.get_messages(conversation_id: str | None = None) -> list[dict]`
  - `ConversationMemory.get_openai_messages(conversation_id: str | None = None) -> list[dict]`
  - `ConversationMemory.clear(conversation_id: str | None = None)`
  - `ConversationMemory.set_current_workspace(ws: dict, conversation_id: str | None = None)`
  - `ConversationMemory.get_current_workspace(conversation_id: str | None = None) -> dict | None`
  - `ConversationMemory.clear_current_workspace(conversation_id: str | None = None)`
  - `ConversationMemory.create_conversation(conv_id: str, parent_id: str | None = None)`
  - `ConversationMemory._main_conv_id: str` (lazily set by `get_or_create_conversation()`, cached)
  - `ConversationMemory._resolve_conv_id(id) -> str` (private helper: returns `id` if not None, else `self._main_conv_id`)
  - `ConversationMemory.get_conversation_children() -> list[dict]` (returns `[{conversation_id, parent_id, created_at}]` for traceability)

- [ ] **Step 1: Write failing tests for `conversation_id` parameter in `test_memory.py`**

Append to `agent/tests/test_memory.py`:

```python
import uuid


class TestMultiConversation:
    @pytest.fixture
    def memory(self):
        from memory import ConversationMemory
        mem = ConversationMemory(":memory:")
        yield mem
        mem.close()

    def test_add_message_with_explicit_conversation_id(self, memory):
        cid1 = str(uuid.uuid4())
        cid2 = str(uuid.uuid4())

        memory.create_conversation(cid1)
        memory.create_conversation(cid2)
        memory.add_message("user", "hello from c1", conversation_id=cid1)
        memory.add_message("user", "hello from c2", conversation_id=cid2)

        msgs1 = memory.get_messages(cid1)
        msgs2 = memory.get_messages(cid2)
        assert len(msgs1) == 1
        assert msgs1[0]["content"] == "hello from c1"
        assert len(msgs2) == 1
        assert msgs2[0]["content"] == "hello from c2"

    def test_clear_with_conversation_id_scoped(self, memory):
        cid1 = str(uuid.uuid4())
        cid2 = str(uuid.uuid4())
        memory.create_conversation(cid1)
        memory.create_conversation(cid2)
        memory.add_message("user", "msg1", conversation_id=cid1)
        memory.add_message("user", "msg2", conversation_id=cid2)

        memory.clear(cid1)
        assert len(memory.get_messages(cid1)) == 0
        assert len(memory.get_messages(cid2)) == 1

    def test_workspace_scoped_to_conversation(self, memory):
        cid = str(uuid.uuid4())
        memory.create_conversation(cid)
        ws = {"workspace": "/child", "repos": [], "active_file": "",
              "provider_id": "", "output_dir": "", "frozen_at": "t"}
        memory.set_current_workspace(ws, conversation_id=cid)

        got = memory.get_current_workspace(cid)
        assert got == ws

        # Main conversation workspace is independent.
        assert memory.get_current_workspace() is None

    def test_get_openai_messages_with_conversation_id(self, memory):
        cid = str(uuid.uuid4())
        memory.create_conversation(cid)
        memory.add_message("user", "q", conversation_id=cid)
        memory.add_message("assistant", "a", conversation_id=cid)
        memory.add_message("tool", '{"ok":true}', tool_name="echo", conversation_id=cid)

        msgs = memory.get_openai_messages(cid)
        assert len(msgs) == 3
        assert msgs[2] == {"role": "tool", "content": '{"ok":true}', "tool_call_id": "echo"}

    def test_create_conversation_with_parent_id(self, memory):
        parent_id = str(uuid.uuid4())
        child_id = str(uuid.uuid4())
        memory.create_conversation(parent_id)
        memory.create_conversation(child_id, parent_id=parent_id)

        children = memory.get_conversation_children()
        # The child is returned; main (auto-created by get_or_create_conversation) is not.
        child_entry = next(c for c in children if c["conversation_id"] == child_id)
        assert child_entry is not None
        assert child_entry["parent_id"] == parent_id
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd agent && .python/bin/python -m pytest tests/test_memory.py -v -k TestMultiConversation
```
Expected: FAIL — `create_conversation` not defined, `conversation_id` param not on `add_message`.

- [ ] **Step 3: Add `parent_id` column to `conversations` table in `_init_tables`**

In `agent/memory.py`, modify `_init_tables`:

```python
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
            id INTEGER PRIMARY KEY CHECK (id = 1),
            conversation_id TEXT,
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

- [ ] **Step 4: Add `conversation_id` column migration for existing DBs**

After `_init_tables()`, add:

```python
try:
    self.conn.execute("ALTER TABLE conversations ADD COLUMN parent_id TEXT")
except sqlite3.OperationalError:
    pass  # column already exists
try:
    self.conn.execute("ALTER TABLE current_turn ADD COLUMN conversation_id TEXT")
except sqlite3.OperationalError:
    pass
```

- [ ] **Step 5: Add `_main_conv_id` cache and lazy resolver**

In `ConversationMemory.__init__`, after `_init_tables()`:

```python
self._main_conv_id: str | None = None
```

Add private helper:

```python
def _resolve_conv_id(self, conversation_id: str | None = None) -> str:
    if conversation_id is not None:
        return conversation_id
    if self._main_conv_id is None:
        self._main_conv_id = self.get_or_create_conversation()
    return self._main_conv_id
```

- [ ] **Step 6: Add `conversation_id` param to `add_message`**

```python
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
```

- [ ] **Step 7: Add `conversation_id` param to `get_messages`, `get_openai_messages`, `clear`**

```python
def get_messages(self, conversation_id: str | None = None) -> list[dict]:
    conv_id = self._resolve_conv_id(conversation_id)
    rows = self.conn.execute(
        "SELECT role, content, tool_name, tool_calls FROM messages WHERE conversation_id = ? ORDER BY id",
        (conv_id,),
    ).fetchall()
    return [dict(row) for row in rows]

def get_openai_messages(self, conversation_id: str | None = None) -> list[dict]:
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
```

- [ ] **Step 8: Add `conversation_id` param to workspace methods**

```python
def set_current_workspace(self, ws: dict, conversation_id: str | None = None) -> None:
    conv_id = self._resolve_conv_id(conversation_id)
    now = datetime.now(timezone.utc).isoformat()
    self.conn.execute(
        """
        INSERT INTO current_turn
            (id, conversation_id, workspace, repos, active_file, provider_id, output_dir, frozen_at, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            conversation_id=excluded.conversation_id,
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
        "FROM current_turn WHERE id = 1 AND conversation_id = ?",
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
    self.conn.execute("DELETE FROM current_turn WHERE id = 1 AND conversation_id = ?", (conv_id,))
    self.conn.commit()
```

- [ ] **Step 9: Add `create_conversation` and `get_conversation_children`**

```python
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
```

- [ ] **Step 10: Run multi-conversation tests**

```
cd agent && .python/bin/python -m pytest tests/test_memory.py -v -k TestMultiConversation
```
Expected: PASS (all 5 tests)

- [ ] **Step 11: Run ALL existing memory tests to verify backward compat**

```
cd agent && .python/bin/python -m pytest tests/test_memory.py -v
```
Expected: ALL PASS (new params default to `None`, existing flows unchanged)

- [ ] **Step 12: Run ALL existing agent tests to verify nothing broken**

```
cd agent && .python/bin/python -m pytest tests/ -v
```
Expected: ALL PASS

- [ ] **Step 13: Commit**

```bash
git add agent/memory.py agent/tests/test_memory.py
git commit -m "feat: multi-conversation ConversationMemory with scoped conversation_id"
```

---

### Task 2: Async `ToolRegistry.execute`

**Files:**
- Modify: `agent/tools/registry.py`
- Modify: `agent/tests/test_registry.py`

**Interfaces:**
- Consumes: _(none)_
- Produces:
  - `ToolRegistry.execute(name: str, arguments: dict) -> dict` becomes `async def execute(...)`
  - `ToolRegistry._host_loop` attribute (set via `set_host_loop(loop)`) — nullable, set by the current `AgentLoop` before `run()`
  - `ToolRegistry.set_host_loop(loop)` — stores the current host `AgentLoop` reference

- [ ] **Step 1: Write async-handler test in `test_registry.py`**

Append to `agent/tests/test_registry.py`:

```python
import pytest
import asyncio


class FakeHostLoop:
    is_subagent = False
    conv_id = "main-conv"
    memory = None


class TestAsyncExecute:
    @pytest.fixture
    def registry(self):
        from tools.registry import ToolRegistry
        return ToolRegistry()

    @pytest.mark.asyncio
    async def test_execute_sync_handler_returns_dict(self, registry):
        registry.register(
            name="echo",
            description="echo",
            parameters={},
            handler=lambda msg: {"ok": True, "msg": msg},
        )
        result = await registry.execute("echo", {"msg": "hi"})
        assert result == {"ok": True, "msg": "hi"}

    @pytest.mark.asyncio
    async def test_execute_async_handler_is_awaited(self, registry):
        async def async_echo(msg):
            await asyncio.sleep(0)
            return {"ok": True, "msg": msg}

        registry.register(
            name="async_echo",
            description="async echo",
            parameters={},
            handler=async_echo,
        )
        result = await registry.execute("async_echo", {"msg": "hi"})
        assert result == {"ok": True, "msg": "hi"}

    @pytest.mark.asyncio
    async def test_execute_unknown_tool_raises_keyerror(self, registry):
        with pytest.raises(KeyError):
            await registry.execute("nonexistent", {})

    def test_set_host_loop(self, registry):
        host = FakeHostLoop()
        registry.set_host_loop(host)
        assert registry._host_loop is host
```

- [ ] **Step 2: Run test to verify it fails**

```
cd agent && .python/bin/python -m pytest tests/test_registry.py -v -k TestAsyncExecute
```
Expected: FAIL — `execute` is sync, cannot `await`.

- [ ] **Step 3: Make `execute` async in `registry.py`**

```python
import asyncio
from typing import Callable


class ToolRegistry:
    def __init__(self):
        self.tools: dict[str, dict] = {}
        self._host_loop = None

    def set_host_loop(self, loop):
        """Store the current host AgentLoop (set before each run)."""
        self._host_loop = loop

    # ... register unchanged ...

    # ... get_openai_schemas unchanged ...

    async def execute(self, name: str, arguments: dict) -> dict:
        if name not in self.tools:
            raise KeyError(f"Tool '{name}' not registered")
        handler = self.tools[name]["handler"]
        result = handler(**arguments)
        if asyncio.iscoroutine(result):
            result = await result
        return result
```

- [ ] **Step 4: Run async tests**

```
cd agent && .python/bin/python -m pytest tests/test_registry.py -v -k TestAsyncExecute
```
Expected: PASS (all 4 tests)

- [ ] **Step 5: Run ALL existing registry tests to verify backward compat**

```
cd agent && .python/bin/python -m pytest tests/test_registry.py -v
```
Expected: All existing tests pass (async `execute` is backwards compat when awaited).

- [ ] **Step 6: Commit**

```bash
git add agent/tools/registry.py agent/tests/test_registry.py
git commit -m "feat: async ToolRegistry.execute with sync/async handler detection"
```

---

### Task 3: Sub-agent system message builder + constants in `context.py`

**Files:**
- Modify: `agent/context.py`

**Interfaces:**
- Consumes: `SYSTEM_TEMPLATE` (existing), `build_system_message` (existing in same file)
- Produces:
  - `SUBAGENT_ROOT_TAG = "<subagent_root/>"`
  - `PLACEHOLDER_TOOL_RESULT = "[tool result omitted — subagent inherited context]"`
  - `SUBAGENT_GUARD = "<subagent_guard>\nYou are running as a SUB-AGENT...\n</subagent_guard>"` (exact multiline string)
  - `build_subagent_system_message(workspace, repos, output_dir, tools_summary, active_file) -> str`
- Note: No test file — these constants are tested indirectly in Task 5/6 via subagent integration tests.

- [ ] **Step 1: Add constants and `build_subagent_system_message` to `context.py`**

Add after the existing `SUBAGENT_GUARD` and constants at the top of `context.py`:

```python
SUBAGENT_ROOT_TAG = "<subagent_root/>"
PLACEHOLDER_TOOL_RESULT = "[tool result omitted — subagent inherited context]"
SUBAGENT_GUARD = """\
<subagent_guard>
You are running as a SUB-AGENT. You MUST NOT call the `create_subagent` tool for any reason.
Your job is to complete the delegated subtask using the other available tools and end with a concise final answer. Calling `create_subagent` will be rejected.
</subagent_guard>"""
```

Add `build_subagent_system_message` after `build_system_message`:

```python
def build_subagent_system_message(
    workspace: str,
    repos: list[str],
    output_dir: str,
    tools_summary: list[dict] | None = None,
    active_file: str = "",
) -> str:
    """Build the system message for a sub-agent, including the root tag and anti-nesting guard."""
    tools_section = _build_tools_section(tools_summary) if tools_summary else _FALLBACK_TOOLS
    base = SYSTEM_TEMPLATE.format(
        workspace=workspace,
        repos=", ".join(repos) if repos else "(none)",
        output_dir=output_dir,
        tools_section=tools_section,
        active_file=active_file or "(none)",
    )
    return f"{SUBAGENT_ROOT_TAG}\n{base}\n\n{SUBAGENT_GUARD}"
```

- [ ] **Step 2: Verify the module still imports**

```
cd agent && .python/bin/python -c "from context import build_subagent_system_message, SUBAGENT_ROOT_TAG, PLACEHOLDER_TOOL_RESULT, SUBAGENT_GUARD; print('ok')"
```
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add agent/context.py
git commit -m "feat: sub-agent system message builder with root tag and anti-nesting guard"
```

---

### Task 4: AgentLoop — `conversation_id`, `is_subagent`, async tools, sub-agent system path

**Files:**
- Modify: `agent/agent_loop.py`
- Modify: `agent/tests/test_agent_loop.py` (add `conversation_id` to callsites)

**Interfaces:**
- Consumes: `ConversationMemory` (Task 1), `ToolRegistry.execute` async (Task 2), `build_subagent_system_message` (Task 3)
- Produces:
  - `AgentLoop.__init__(..., conversation_id: str | None = None, is_subagent: bool = False, parent_conv_id: str | None = None)`
  - `AgentLoop.conversation_id: str` (resolved from param or `memory.get_or_create_conversation()`)
  - `AgentLoop.is_subagent: bool`
  - `AgentLoop.parent_conv_id: str | None`

- [ ] **Step 1: Update `AgentLoop.__init__` to accept new params**

In `agent/agent_loop.py`, modify `__init__`:

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
    conversation_id: str | None = None,
    is_subagent: bool = False,
    parent_conv_id: str | None = None,
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
    self.is_subagent = is_subagent
    self.parent_conv_id = parent_conv_id
    self.conversation_id = conversation_id or memory.get_or_create_conversation()
    self._activated_skills: set[str] = set()
```

- [ ] **Step 2: Update `run()` to thread `conversation_id` through all `memory.add_message` calls**

Replace every `self.memory.add_message(...)` call in `run()` with `self.memory.add_message(..., conversation_id=self.conversation_id)`.

Three sites in `run()`:

**Site A** (system message on first turn):
```python
self.memory.add_message("system", system_msg, conversation_id=self.conversation_id)
```

**Site B** (assistant with tool calls):
```python
self.memory.add_message(
    "assistant",
    text,
    tool_calls=[...],
    conversation_id=self.conversation_id,
)
```

**Site C** (tool result):
```python
self.memory.add_message("tool", result_str, tool_name=tc["id"], conversation_id=self.conversation_id)
```

**Site D** (assistant without tool calls, final turn):
```python
self.memory.add_message("assistant", full_text, conversation_id=self.conversation_id)
```

**Site E** (skill activation):
```python
self.memory.add_message(
    "system",
    f"[Activated skill: {skill_name}]\n\n{full_skill}",
    conversation_id=self.conversation_id,
)
```

**Site F** (user message):
```python
self.memory.add_message("user", user_message, conversation_id=self.conversation_id)
```

- [ ] **Step 3: Update `run()` to use `await self.registry.execute(...)`**

Change line `result = self.registry.execute(tool_name, args)` to:

```python
result = await self.registry.execute(tool_name, args)
```

- [ ] **Step 4: Update first-turn logic to skip system/freeze for sub-agents**

In `run()`, change the first-turn block:

```python
is_pending_first_turn = len(existing) == 0
if is_pending_first_turn:
    if not self.is_subagent:
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
        self.memory.add_message("system", system_msg, conversation_id=self.conversation_id)
        self.memory.set_current_workspace({
            "workspace": self.workspace,
            "repos": self.repos,
            "active_file": self.active_file,
            "provider_id": self.provider_id,
            "output_dir": self.output_dir,
            "frozen_at": datetime.now(timezone.utc).isoformat(),
        }, conversation_id=self.conversation_id)
```

Sub-agents skip the system+freeze block entirely — their system is written by the `_build_subagent` handler in `subagent_tool.py` (Task 5).

- [ ] **Step 5: Add `get_openai_messages` call to use conversation_id**

Change `messages = self.memory.get_openai_messages()` to:

```python
messages = self.memory.get_openai_messages(conversation_id=self.conversation_id)
```

- [ ] **Step 6: Update `test_agent_loop.py` — add `conversation_id` to AgentLoop() callsites**

Each `AgentLoop(...)` constructor call needs `conversation_id=memory.get_or_create_conversation()`. Since new params default to `None`, existing tests with `:memory:` will still work because `conversation_id or memory.get_or_create_conversation()` resolves correctly. **No changes needed to tests** — the default `None` path auto-allocates via `get_or_create_conversation()`.

Add a new test class `TestAgentLoopWithConversationId` in `test_agent_loop.py`:

```python
import uuid


class TestAgentLoopWithConversationId:
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
    async def test_explicit_conversation_id_isolates_messages(self, registry_with_tools, memory):
        """Messages from two AgentLoops with different conv_ids don't leak."""
        cid1 = str(uuid.uuid4())
        cid2 = str(uuid.uuid4())
        memory.create_conversation(cid1)
        memory.create_conversation(cid2)

        provider1 = FakeProvider([[{"type": "text", "content": "one"}, {"type": "done"}]])
        provider2 = FakeProvider([[{"type": "text", "content": "two"}, {"type": "done"}]])

        agent1 = AgentLoop(provider=provider1, registry=registry_with_tools, memory=memory,
                           workspace="/ws", repos=["/repo"], output_dir="/ws/docs", max_steps=5,
                           conversation_id=cid1)
        agent2 = AgentLoop(provider=provider2, registry=registry_with_tools, memory=memory,
                           workspace="/ws", repos=["/repo"], output_dir="/ws/docs", max_steps=5,
                           conversation_id=cid2)

        async for _ in agent1.run("hi"):
            pass
        async for _ in agent2.run("hey"):
            pass

        msgs1 = memory.get_messages(cid1)
        msgs2 = memory.get_messages(cid2)
        assert len(msgs1) > 0
        assert len(msgs2) > 0
        assert msgs1[-1]["content"] == "one"
        assert msgs2[-1]["content"] == "two"

    @pytest.mark.asyncio
    async def test_is_subagent_skips_system_and_freeze(self, registry_with_tools, memory):
        """Sub-agent does NOT write a system message or freeze workspace."""
        cid = str(uuid.uuid4())
        memory.create_conversation(cid)
        provider = FakeProvider([[{"type": "text", "content": "ok"}, {"type": "done"}]])
        agent = AgentLoop(provider=provider, registry=registry_with_tools, memory=memory,
                          workspace="/ws", repos=["/repo"], output_dir="/ws/docs", max_steps=5,
                          conversation_id=cid, is_subagent=True)
        async for _ in agent.run("task"):
            pass

        msgs = memory.get_messages(cid)
        # Only the user message and assistant reply; no system message.
        roles = [m["role"] for m in msgs]
        assert "system" not in roles
        assert roles == ["user", "assistant"]
        # No workspace frozen for this sub conv.
        assert memory.get_current_workspace(cid) is None
```

- [ ] **Step 7: Run new tests**

```
cd agent && .python/bin/python -m pytest tests/test_agent_loop.py -v -k TestAgentLoopWithConversationId
```
Expected: PASS (2 tests)

- [ ] **Step 8: Run ALL existing agent loop tests to verify backward compat**

```
cd agent && .python/bin/python -m pytest tests/test_agent_loop.py -v
```
Expected: ALL existing tests still PASS

- [ ] **Step 9: Commit**

```bash
git add agent/agent_loop.py agent/tests/test_agent_loop.py
git commit -m "feat: AgentLoop conversation_id isolation, is_subagent flag, async tool execution"
```

---

### Task 5: `create_subagent` tool — gates, inheritance, parallel orchestration

**Files:**
- Create: `agent/tools/subagent_tool.py`
- Create: `agent/tests/test_subagent.py` (first half: gate tests)

**Interfaces:**
- Consumes: `ConversationMemory` (Task 1), `ToolRegistry.set_host_loop` (Task 2), `build_subagent_system_message` + constants (Task 3), `AgentLoop` (Task 4)
- Produces:
  - `register_subagent_tools(registry: ToolRegistry)` — registers `create_subagent` into the registry, handler reads `registry._host_loop` for gate checks and orchestration
  - `PLACEHOLDER_TOOL_RESULT`, `SUBAGENT_ROOT_TAG` re-exported
  - `_has_subagent_root(memory, conv_id) -> bool` — scans messages for the root tag
  - `_build_subagent(desc, parent_conv_id, host_loop) -> AgentLoop` — creates a child loop with inherited history
  - `_run_one(child_loop) -> dict` — drives a child loop to completion, returns `{"ok": bool, "answer": str, "conversation_id": str}` or `{"ok": bool, "error": str, "conversation_id": str}`
  - `create_subagent(tasks: list[dict]) -> dict` — the async handler

- [ ] **Step 1: Write gate-rejection tests in `test_subagent.py`**

```python
import pytest
import uuid
from context import SUBAGENT_ROOT_TAG, PLACEHOLDER_TOOL_RESULT


class FakeProvider:
    def __init__(self, responses: list[list[dict]] | None = None):
        self.responses = responses or [[{"type": "text", "content": "done"}, {"type": "done"}]]
        self.call_count = 0

    async def chat_stream(self, messages, tools):
        if self.call_count < len(self.responses):
            for event in self.responses[self.call_count]:
                yield event
        else:
            yield {"type": "text", "content": "done"}
            yield {"type": "done"}
        self.call_count += 1


class TestSubAgentGates:
    @pytest.fixture
    def registry(self):
        from tools.registry import ToolRegistry
        return ToolRegistry()

    @pytest.fixture
    def memory(self):
        from memory import ConversationMemory
        return ConversationMemory(":memory:")

    def _make_main_agent(self, registry, memory, conv_id):
        from agent_loop import AgentLoop
        provider = FakeProvider()
        agent = AgentLoop(
            provider=provider, registry=registry, memory=memory,
            workspace="/ws", repos=["/repo"], output_dir="/ws/docs",
            max_steps=5, conversation_id=conv_id,
        )
        registry.set_host_loop(agent)
        return agent

    def _make_sub_agent(self, registry, memory, conv_id, tasks_desc):
        """Creates a sub-agent with the tagged system + inherited history."""
        from agent_loop import AgentLoop
        from context import build_subagent_system_message

        # Write child's tagged system
        tools_summary = [{"name": k, "description": v["description"]} for k, v in registry.tools.items()]
        system_msg = build_subagent_system_message("/ws", ["/repo"], "/ws/docs", tools_summary)
        memory.add_message("system", system_msg, conversation_id=conv_id)
        # Write user task
        memory.add_message("user", tasks_desc, conversation_id=conv_id)

        provider = FakeProvider()
        agent = AgentLoop(
            provider=provider, registry=registry, memory=memory,
            workspace="/ws", repos=["/repo"], output_dir="/ws/docs",
            max_steps=5, conversation_id=conv_id, is_subagent=True,
        )
        return agent

    def test_gate_state_rejects_subagent(self):
        """Gate (3): is_subagent=True rejects create_subagent outright."""
        from tools.subagent_tool import _check_gates

        # Simulate a host loop that IS a sub-agent.
        class Host:
            is_subagent = True
            conv_id = "c1"
            memory = None
        host = Host()

        result = _check_gates(host, host.memory, host.conv_id)
        assert result is not None
        assert result["ok"] is False
        assert result["reason"] == "nested_subagent_blocked"
        assert result["gate"] == "state"

    def test_gate_tag_rejects_subagent(self, memory):
        """Gate (2): <subagent_root/> tag in history rejects create_subagent."""
        from tools.subagent_tool import _has_subagent_root

        cid = str(uuid.uuid4())
        memory.create_conversation(cid)
        # Write a tagged system message (simulating a sub-agent context).
        memory.add_message("system", f"{SUBAGENT_ROOT_TAG}\nYou are a sub-agent.", conversation_id=cid)

        assert _has_subagent_root(memory, cid) is True

    def test_gate_tag_passes_main_agent(self, memory):
        """Gate (2): main agent history has no <subagent_root/> → passes."""
        from tools.subagent_tool import _has_subagent_root

        cid = str(uuid.uuid4())
        memory.create_conversation(cid)
        memory.add_message("system", "You are a code assistant.", conversation_id=cid)
        memory.add_message("user", "hello", conversation_id=cid)

        assert _has_subagent_root(memory, cid) is False

    def test_placeholder_constant_is_used_in_inheritance(self):
        """Smoke test: PLACEHOLDER_TOOL_RESULT is a non-empty string."""
        assert len(PLACEHOLDER_TOOL_RESULT) > 0
        assert "subagent" in PLACEHOLDER_TOOL_RESULT.lower()

    def test_subagent_system_contains_tag_and_guard(self):
        """Gate (1): sub-agent system message includes the tag + guard text."""
        from context import build_subagent_system_message, SUBAGENT_ROOT_TAG, SUBAGENT_GUARD
        from tools.registry import ToolRegistry

        reg = ToolRegistry()
        reg.register("echo", "Echo", {}, lambda: {})
        tools_summary = [{"name": k, "description": v["description"]} for k, v in reg.tools.items()]
        msg = build_subagent_system_message("/ws", ["/repo"], "/ws/docs", tools_summary)

        assert msg.startswith(SUBAGENT_ROOT_TAG)
        assert SUBAGENT_GUARD.strip() in msg
        assert "MUST NOT" in msg
```

- [ ] **Step 2: Run gate tests to verify they fail**

```
cd agent && .python/bin/python -m pytest tests/test_subagent.py -v -k TestSubAgentGates
```
Expected: FAIL — `subagent_tool.py` does not exist yet.

- [ ] **Step 3: Implement `subagent_tool.py` — gate helpers and handler skeleton**

```python
"""Sub-agent tool — create_subagent.

Registers a tool that spawns parallel child AgentLoops with:
  - Parent-history inheritance (tool results redacted).
  - Triple-gate anti-nesting: prompt soft guidance (in system message),
    <subagent_root/> tag scan, and is_subagent state flag.
"""
import asyncio
import uuid
import os
from context import (
    SUBAGENT_ROOT_TAG,
    PLACEHOLDER_TOOL_RESULT,
    build_subagent_system_message,
)


def _has_subagent_root(memory, conv_id: str) -> bool:
    """Scan a conversation's messages for the <subagent_root/> tag.

    Returns True if ANY message's content contains the tag — this means
    the current context is already a sub-agent (the tag was injected in
    its system message) and nesting must be rejected.
    """
    msgs = memory.get_messages(conversation_id=conv_id)
    for m in msgs:
        content = m.get("content", "") or ""
        if SUBAGENT_ROOT_TAG in content:
            return True
    return False


def _check_gates(host_loop, memory, conv_id: str) -> dict | None:
    """Check all three anti-nesting gates. Returns a blocked dict or None (pass)."""
    # Gate (3): state flag
    if host_loop.is_subagent:
        return {"ok": False, "reason": "nested_subagent_blocked", "gate": "state"}
    # Gate (2): tag scan
    if _has_subagent_root(memory, conv_id):
        return {"ok": False, "reason": "nested_subagent_blocked", "gate": "tag"}
    return None


def _inherit_parent_history(memory, parent_conv_id: str, child_conv_id: str) -> None:
    """Clone parent messages into child conv, redacting tool-result contents."""
    parent_msgs = memory.get_messages(conversation_id=parent_conv_id)
    for m in parent_msgs:
        role = m["role"]
        if role == "system":
            # Do NOT inherit the parent's system — child gets its own.
            continue
        content = m.get("content", "") or ""
        if role == "tool":
            content = PLACEHOLDER_TOOL_RESULT
        tool_name = m.get("tool_name") or None
        tool_calls_raw = m.get("tool_calls") or None
        tool_calls = None
        if tool_calls_raw:
            import json as _json
            tool_calls = _json.loads(tool_calls_raw) if isinstance(tool_calls_raw, str) else tool_calls_raw
        memory.add_message(
            role, content,
            tool_name=tool_name,
            tool_calls=tool_calls,
            conversation_id=child_conv_id,
        )


def _build_subagent(desc: str, parent_conv_id: str, host_loop):
    """Construct a child AgentLoop with inherited history, tagged system, and task."""
    from agent_loop import AgentLoop

    child_conv_id = str(uuid.uuid4())
    memory = host_loop.memory
    registry = host_loop.registry

    # Create the child conversation row with parent link.
    memory.create_conversation(child_conv_id, parent_id=parent_conv_id)

    # Inherit parent history (system dropped, tool results redacted).
    _inherit_parent_history(memory, parent_conv_id, child_conv_id)

    # Write the child's own tagged system message.
    tools_summary = [
        {"name": t["name"], "description": t["description"]}
        for t in registry.tools.values()
    ]
    frozen = memory.get_current_workspace(conversation_id=parent_conv_id) or {}
    workspace = frozen.get("workspace", host_loop.workspace)
    repos = frozen.get("repos", host_loop.repos)
    output_dir = frozen.get("output_dir", host_loop.output_dir)
    active_file = frozen.get("active_file", host_loop.active_file)
    system_msg = build_subagent_system_message(workspace, repos, output_dir, tools_summary, active_file)
    memory.add_message("system", system_msg, conversation_id=child_conv_id)

    # Write the user message (the subtask description).
    memory.add_message("user", desc, conversation_id=child_conv_id)

    # Construct the child loop.
    child = AgentLoop(
        provider=host_loop.provider,
        registry=registry,
        memory=memory,
        workspace=workspace,
        repos=repos,
        output_dir=output_dir,
        max_steps=host_loop.max_steps,
        active_file=active_file,
        provider_id=host_loop.provider_id,
        conversation_id=child_conv_id,
        is_subagent=True,
        parent_conv_id=parent_conv_id,
    )
    return child


async def _run_one(child_loop) -> dict:
    """Drive a child AgentLoop to completion and return its result item."""
    final_text = ""
    try:
        async for event in child_loop._run_loop():
            if event["type"] == "text":
                final_text += event["content"]
            elif event["type"] == "done":
                break
    except Exception:
        pass  # handled below

    result_text = final_text.strip() or "(no final answer)"
    return {
        "ok": True,
        "answer": result_text,
        "conversation_id": child_loop.conversation_id,
    }


def register_subagent_tools(registry):
    """Register create_subagent tool on the given registry.

    The handler reads registry._host_loop for gate checks and orchestration.
    Must be called AFTER registry.set_host_loop() for the current AgentLoop.
    """
    async def handler(tasks):
        host = registry._host_loop
        if host is None:
            return {"ok": False, "reason": "no_host_loop"}

        # Gates (2) and (3)
        blocked = _check_gates(host, host.memory, host.conversation_id)
        if blocked:
            return blocked

        parent_conv_id = host.conversation_id

        # Validate tasks
        if not isinstance(tasks, list) or len(tasks) == 0:
            return {"ok": False, "reason": "invalid_tasks"}

        # Build all child loops
        builds = []
        for t in tasks:
            desc = t.get("description", "") if isinstance(t, dict) else str(t)
            child = _build_subagent(desc, parent_conv_id, host)
            builds.append(child)

        # Run all in parallel
        results = await asyncio.gather(
            *[_run_one(b) for b in builds],
            return_exceptions=True,
        )

        # Normalize exceptions into error items
        subagents = []
        for i, r in enumerate(results):
            if isinstance(r, Exception):
                subagents.append({
                    "index": i,
                    "ok": False,
                    "error": str(r),
                    "conversation_id": builds[i].conversation_id if i < len(builds) else "",
                })
            else:
                r["index"] = i
                subagents.append(r)

        return {"ok": True, "subagents": subagents}

    registry.register(
        name="create_subagent",
        description=(
            "Spawn one or more sub-agents to run delegated subtasks in parallel. "
            "Each sub-agent inherits the current conversation history (tool results "
            "redacted) and runs its own independent tool loop to completion. Returns "
            "each sub-agent's final answer. CANNOT be called from within a sub-agent."
        ),
        parameters={
            "type": "object",
            "properties": {
                "tasks": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "type": "object",
                        "properties": {
                            "description": {
                                "type": "string",
                                "description": "The delegated subtask description.",
                            },
                        },
                        "required": ["description"],
                    },
                },
            },
            "required": ["tasks"],
        },
        handler=handler,
    )
```

- [ ] **Step 4: Verify `_run_one` needs an internal loop method on AgentLoop**

The `_run_one` function calls `child_loop._run_loop()` — a method that doesn't exist yet. `AgentLoop.run(user_message)` adds a user message AND runs the loop. But for sub-agents, the messages are already in the DB (inherited parent history + system + task description). `run()`'s first-turn branch will see `len(existing) > 0` and skip the system message — good. But it will `add_message("user", user_message)` unconditionally, adding a DUPLICATE user message. We need a version that skips the user injection.

Add `_run_loop()` to `agent_loop.py` after `run()`:

```python
async def _run_loop(self) -> AsyncIterator[dict]:
    """Internal: run the tool loop from the existing conversation history.

    Like run() but does NOT add a user message — the messages are already
    in the DB (used for sub-agent replay). Yields the same events as run().
    """
    try:
        yield {"type": "user", "content": "(resuming)"}

        tools = self.registry.get_openai_schemas()
        step = 0

        while step < self.max_steps:
            step += 1
            messages = self.memory.get_openai_messages(conversation_id=self.conversation_id)

            tool_calls_in_turn: list[dict] = []
            assistant_text_parts: list[str] = []

            try:
                async for event in self.provider.chat_stream(messages, tools):
                    if event["type"] == "text":
                        assistant_text_parts.append(event["content"])
                        yield event

                    elif event["type"] == "tool_call":
                        tc = event["tool_call"]
                        tool_calls_in_turn.append(tc)
                        yield {
                            "type": "tool_call",
                            "name": tc["function"]["name"],
                            "arguments": tc["function"]["arguments"],
                        }

                    elif event["type"] == "done":
                        pass
            except Exception as e:
                yield {
                    "type": "error",
                    "content": f"LLM call failed: {e}",
                }
                yield {"type": "done"}
                return

            if tool_calls_in_turn:
                text = "".join(assistant_text_parts) if assistant_text_parts else ""
                self.memory.add_message(
                    "assistant",
                    text,
                    tool_calls=[
                        {
                            "id": tc["id"],
                            "type": "function",
                            "function": {
                                "name": tc["function"]["name"],
                                "arguments": json.dumps(tc["function"]["arguments"], ensure_ascii=False),
                            },
                        }
                        for tc in tool_calls_in_turn
                    ],
                    conversation_id=self.conversation_id,
                )

                for tc in tool_calls_in_turn:
                    tool_name = tc["function"]["name"]
                    args = tc["function"]["arguments"]
                    if tool_name.startswith("create_") and "name" in args and self.workspace:
                        resolved = os.path.normpath(os.path.join(self.workspace, args["name"]))
                        args = {**args, "name": resolved}
                    try:
                        result = await self.registry.execute(tool_name, args)
                    except Exception as e:
                        result = {"ok": False, "error": str(e)}

                    result_str = json.dumps(result, ensure_ascii=False)
                    MAX_TOOL_RESULT_CHARS = 8000
                    if len(result_str) > MAX_TOOL_RESULT_CHARS:
                        truncated = {"ok": result.get("ok"), "truncated": True}
                        if "count" in result:
                            truncated["count"] = result["count"]
                        if "total_lines" in result:
                            truncated["total_lines"] = result["total_lines"]
                        if "hint" in result:
                            truncated["hint"] = result["hint"]
                        truncated["preview"] = result_str[:MAX_TOOL_RESULT_CHARS]
                        truncated["error"] = result.get("error", "")[:200] if not result.get("ok") else ""
                        result_str = json.dumps(truncated, ensure_ascii=False)
                    self.memory.add_message("tool", result_str, tool_name=tc["id"], conversation_id=self.conversation_id)
                    yield {
                        "type": "tool_result",
                        "tool_call_id": tc["id"],
                        "name": tool_name,
                        "result": result,
                    }

                self._activate_skills(tool_calls_in_turn)
                continue

            full_text = "".join(assistant_text_parts)
            if full_text:
                self.memory.add_message("assistant", full_text, conversation_id=self.conversation_id)
            yield {"type": "done"}
            return

        yield {"type": "text", "content": "\n\n[Max steps reached. Stopping.]"}
        yield {"type": "done"}

    except Exception as e:
        yield {
            "type": "error",
            "content": f"Agent error: {e}",
        }
        yield {"type": "done"}
```

**Refactor `run()` to delegate to `_run_loop()`** — extract the shared loop body and wrap with user-message injection:

```python
async def run(self, user_message: str) -> AsyncIterator[dict]:
    try:
        existing = self.memory.get_messages(conversation_id=self.conversation_id)
        is_pending_first_turn = len(existing) == 0
        if is_pending_first_turn:
            if not self.is_subagent:
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
                self.memory.add_message("system", system_msg, conversation_id=self.conversation_id)
                self.memory.set_current_workspace({
                    "workspace": self.workspace,
                    "repos": self.repos,
                    "active_file": self.active_file,
                    "provider_id": self.provider_id,
                    "output_dir": self.output_dir,
                    "frozen_at": datetime.now(timezone.utc).isoformat(),
                }, conversation_id=self.conversation_id)

        self.memory.add_message("user", user_message, conversation_id=self.conversation_id)
        yield {"type": "user", "content": user_message}

        async for event in self._run_loop():
            yield event

    except Exception as e:
        yield {
            "type": "error",
            "content": f"Agent error: {e}",
        }
        yield {"type": "done"}
```

- [ ] **Step 5: Add `_run_loop` import of `json` and `os` at top of `agent_loop.py`**

Already present (`import json, os` at line 1). No change needed.

- [ ] **Step 6: Run gate tests again**

```
cd agent && .python/bin/python -m pytest tests/test_subagent.py -v -k TestSubAgentGates
```
Expected: All gate tests PASS.

- [ ] **Step 7: Run ALL existing tests to ensure refactor didn't break anything**

```
cd agent && .python/bin/python -m pytest tests/ -v
```
Expected: ALL PASS.

- [ ] **Step 8: Commit**

```bash
git add agent/tools/subagent_tool.py agent/tests/test_subagent.py
git commit -m "feat: create_subagent tool with triple-gate anti-nesting and parallel orchestration"
```

---

### Task 6: Server integration — main conv_id, host-loop binding, /history extension

**Files:**
- Modify: `agent/server.py`
- Modify: `agent/tests/test_server.py`

**Interfaces:**
- Consumes: `ConversationMemory` (Task 1), `register_subagent_tools` (Task 5)
- Produces:
  - `create_app()` generates a `main_conversation_id`, creates the conversation row, passes it to `AgentLoop` construction.
  - `build_registry()` no longer registers `create_subagent` — it's registered after `AgentLoop` construction.
  - `GET /history?conversation_id=<id>` returns messages for the specified conv_id.
  - `GET /history` response includes `subagent_conversations` list.
  - `make_agent` factory threads `conversation_id`.

- [ ] **Step 1: Update `build_registry()` — do NOT register create_subagent here**

Remove the `register_subagent_tools` call from `build_registry()`. The registry build stays as-is (skill tools only). `create_subagent` is registered per-AgentLoop.

- [ ] **Step 2: Update `create_app()` — generate main conversation_id, bind host loop, register subagent tool**

```python
def create_app(agent_factory=None, memory=None):
    app = FastAPI(title="Code Note Agent")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    registry = build_registry()
    providers = load_providers()

    if memory is None:
        db_path = os.path.expanduser("~/.code-note-studio/agent-conversation.db")
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        memory = ConversationMemory(db_path)

    # Generate and persist the main conversation id.
    main_conversation_id = memory.get_or_create_conversation()

    # Import here to avoid circular imports.
    from tools.subagent_tool import register_subagent_tools

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/providers")
    async def get_providers():
        return {
            "ok": True,
            "providers": [
                {"id": p["id"], "name": p["name"], "model": p["model"]}
                for p in providers
            ],
        }

    @app.post("/chat")
    async def chat(request: Request):
        body = await request.json()
        message = body["message"]
        provider_id = body.get("provider_id")
        workspace = body.get("workspace", "") or os.getcwd()
        repos = body.get("repos", [])
        active_file = body.get("active_file", "")
        default_output = workspace if workspace else os.getcwd()
        output_dir = body.get("output_dir", default_output)

        provider_config = next(
            (p for p in providers if p["id"] == provider_id),
            providers[0] if providers else None,
        )
        if not provider_config:
            async def error_stream():
                yield f"data: {json.dumps({'type': 'error', 'content': 'No provider configured'})}\n\n"
            return StreamingResponse(error_stream(), media_type="text/event-stream")

        api_key = provider_config.get("api_key") or os.environ.get("MODEL_API_KEY", "")
        provider = OpenAICompatProvider(
            base_url=provider_config["base_url"],
            api_key=api_key,
            model=provider_config["model"],
        )

        if agent_factory:
            agent = agent_factory(provider, workspace, repos, output_dir, provider_id, active_file)
        else:
            agent = AgentLoop(
                provider=provider,
                registry=registry,
                memory=memory,
                workspace=workspace,
                repos=repos,
                output_dir=output_dir,
                active_file=active_file,
                provider_id=provider_id,
                conversation_id=main_conversation_id,
            )

        # Bind this AgentLoop as the host for create_subagent calls in this round.
        registry.set_host_loop(agent)
        # Ensure create_subagent is registered (idempotent re-register, new host bound).
        register_subagent_tools(registry)

        async def event_stream():
            async for event in agent.run(message):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    @app.get("/history")
    async def get_history(conversation_id: str = None):
        conv_id = conversation_id or main_conversation_id
        messages = memory.get_messages(conversation_id=conv_id)
        user_visible = [m for m in messages if m["role"] != "system"]
        response = {
            "ok": True,
            "messages": user_visible,
            "conversation_id": conv_id,
        }
        # Include frozen snapshot for any conversation that has one.
        frozen = memory.get_current_workspace(conversation_id=conv_id)
        if frozen:
            response["frozen"] = frozen
        # Include sub-agent traceability for the main conversation.
        if conv_id == main_conversation_id:
            response["subagent_conversations"] = memory.get_conversation_children()
        return response

    @app.delete("/history")
    async def clear_history(conversation_id: str = None):
        conv_id = conversation_id or main_conversation_id
        memory.clear(conversation_id=conv_id)
        return {"ok": True}

    return app
```

- [ ] **Step 3: Update `test_server.py` factory to thread `conversation_id`**

Modify the `app` fixture and `test_restart_recovery` factory:

In `app` fixture:
```python
@pytest.fixture
def app():
    import tempfile
    import os

    tmpdir = tempfile.mkdtemp()
    db_path = os.path.join(tmpdir, "test.db")

    memory = ConversationMemory(db_path)
    registry = ToolRegistry()
    main_conv_id = memory.get_or_create_conversation()

    def make_agent(provider, workspace, repos, output_dir, provider_id="", active_file=""):
        return AgentLoop(
            provider=provider,
            registry=registry,
            memory=memory,
            workspace=workspace or "/ws",
            repos=repos or [],
            output_dir=output_dir or "/ws/docs",
            max_steps=5,
            provider_id=provider_id,
            active_file=active_file,
            conversation_id=main_conv_id,
        )

    return create_app(make_agent, memory)
```

In `test_restart_recovery`:
```python
main_conv_id = memory.get_or_create_conversation()

def make_agent(provider, workspace, repos, output_dir, provider_id="", active_file=""):
    return AgentLoop(provider=provider, registry=registry, memory=memory,
                     workspace=workspace or "/ws", repos=repos or [],
                     output_dir=output_dir or "/ws/docs", max_steps=5,
                     provider_id=provider_id, active_file=active_file,
                     conversation_id=main_conv_id)
```

- [ ] **Step 4: Run all tests to validate server integration**

```
cd agent && .python/bin/python -m pytest tests/ -v
```
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add agent/server.py agent/tests/test_server.py
git commit -m "feat: server binds main conversation_id, registers subagent tool per-agent, /history supports conv_id query"
```

---

### Task 7: Sub-agent integration test — end-to-end

**Files:**
- Modify: `agent/tests/test_subagent.py` (append integration tests)

**Interfaces:**
- Consumes: All previous tasks

- [ ] **Step 1: Write integration tests**

Append to `agent/tests/test_subagent.py`:

```python
class TestSubAgentIntegration:
    @pytest.fixture
    def registry(self):
        from tools.registry import ToolRegistry
        return ToolRegistry()

    @pytest.fixture
    def memory(self):
        from memory import ConversationMemory
        return ConversationMemory(":memory:")

    @pytest.mark.asyncio
    async def test_single_subagent_runs_to_completion(self, registry, memory):
        """A single child: inherits, runs, returns conclusion to parent."""
        from agent_loop import AgentLoop
        from tools.subagent_tool import register_subagent_tools

        # Register a tool the sub-agent can use.
        registry.register(
            name="lookup",
            description="Look up a value",
            parameters={"type": "object", "properties": {"key": {"type": "string"}}, "required": ["key"]},
            handler=lambda key: {"ok": True, "value": f"result-for-{key}"},
        )

        main_conv_id = memory.get_or_create_conversation()
        # Set up main agent — write system + a user message so history exists.
        memory.add_message("system", "You are a main agent.", conversation_id=main_conv_id)
        memory.add_message("user", "main task", conversation_id=main_conv_id)
        memory.add_message("assistant", "I will delegate.", conversation_id=main_conv_id)
        # Simulate a prior tool call result (should be redacted in child).
        memory.add_message("tool", '{"ok":true,"result":"big prior output"}', tool_name="call_1", conversation_id=main_conv_id)

        # Register subagent tool.
        register_subagent_tools(registry)

        class RespondingProvider:
            """Child: makes one tool call, then answers."""
            def __init__(self):
                self.call = 0

            async def chat_stream(self, messages, tools):
                if self.call == 0:
                    self.call += 1
                    yield {
                        "type": "tool_call",
                        "tool_call": {
                            "id": "call_sub",
                            "function": {
                                "name": "lookup",
                                "arguments": {"key": "foo"},
                            },
                        },
                    }
                    yield {"type": "done"}
                else:
                    self.call += 1
                    yield {"type": "text", "content": "Sub-agent found: result-for-foo"}
                    yield {"type": "done"}

        # Construct a main agent as host.
        main_provider = FakeProvider()
        main = AgentLoop(
            provider=main_provider, registry=registry, memory=memory,
            workspace="/ws", repos=["/repo"], output_dir="/ws/docs",
            max_steps=10, conversation_id=main_conv_id,
        )
        registry.set_host_loop(main)

        # Instead of calling run() (which would add another user message),
        # directly invoke the handler to test sub-agent flow.
        from tools.subagent_tool import _build_subagent, _run_one

        child_conv_id = str(uuid.uuid4())
        memory.create_conversation(child_conv_id, parent_id=main_conv_id)

        # Manually build the sub-agent with a responding provider.
        child = _build_subagent("Find value for foo", main_conv_id, main)
        # Override provider with our scripted one.
        child.provider = RespondingProvider()

        result = await _run_one(child)
        assert result["ok"] is True
        assert "result-for-foo" in result["answer"]
        assert result["conversation_id"] == child.conversation_id

        # Verify child history has placeholder for the inherited tool result.
        child_msgs = memory.get_messages(child.conversation_id)
        inherited_tool = [m for m in child_msgs if m["tool_name"] == "call_1"]
        assert len(inherited_tool) == 1
        assert inherited_tool[0]["content"] == PLACEHOLDER_TOOL_RESULT

        # Verify child history has its own REAL tool result (not placeholder).
        child_tool_results = [m for m in child_msgs if m["role"] == "tool" and m["tool_name"] == "call_sub"]
        assert len(child_tool_results) == 1
        assert "result-for-foo" in child_tool_results[0]["content"]
        assert PLACEHOLDER_TOOL_RESULT not in child_tool_results[0]["content"]

    @pytest.mark.asyncio
    async def test_parallel_subagents_run_independently(self, registry, memory):
        """Two children each run to completion in parallel, results are gathered."""
        from agent_loop import AgentLoop
        from tools.subagent_tool import register_subagent_tools, _build_subagent, _run_one
        import asyncio

        registry.register(
            name="calc",
            description="Calculate",
            parameters={"type": "object", "properties": {"expr": {"type": "string"}}, "required": ["expr"]},
            handler=lambda expr: {"ok": True, "result": eval(expr)},
        )
        register_subagent_tools(registry)

        main_conv_id = memory.get_or_create_conversation()
        memory.add_message("system", "Main agent.", conversation_id=main_conv_id)
        memory.add_message("user", "main task", conversation_id=main_conv_id)

        main = AgentLoop(
            provider=FakeProvider(), registry=registry, memory=memory,
            workspace="/ws", repos=["/repo"], output_dir="/ws/docs",
            max_steps=5, conversation_id=main_conv_id,
        )
        registry.set_host_loop(main)

        child_a = _build_subagent("Task A", main_conv_id, main)
        child_b = _build_subagent("Task B", main_conv_id, main)

        class FastProvider:
            async def chat_stream(self, messages, tools):
                yield {"type": "text", "content": "done"}
                yield {"type": "done"}

        child_a.provider = FastProvider()
        child_b.provider = FastProvider()

        results = await asyncio.gather(
            _run_one(child_a), _run_one(child_b),
            return_exceptions=True,
        )
        assert len(results) == 2
        assert results[0]["ok"] is True
        assert results[1]["ok"] is True

    @pytest.mark.asyncio
    async def test_subagent_gate_rejects_from_child_context(self, registry, memory):
        """Gate (2) + (3): a sub-agent cannot create its own sub-agent."""
        from tools.subagent_tool import register_subagent_tools, _check_gates

        main_conv_id = memory.get_or_create_conversation()
        cid = str(uuid.uuid4())
        memory.create_conversation(cid, parent_id=main_conv_id)

        # Write a tagged system — simulating a sub-agent context.
        from context import build_subagent_system_message
        tools_summary = [{"name": "echo", "description": "echo"}]
        sys_msg = build_subagent_system_message("/ws", [], "/ws/docs", tools_summary)
        memory.add_message("system", sys_msg, conversation_id=cid)

        class SubHost:
            is_subagent = True
            conv_id = cid
            memory = memory

        host = SubHost()
        blocked = _check_gates(host, memory, cid)
        assert blocked is not None
        assert blocked["ok"] is False
        assert blocked["reason"] == "nested_subagent_blocked"
        # State gate fires first.
        assert blocked["gate"] == "state"

    @pytest.mark.asyncio
    async def test_inheritance_preserves_user_assistant_but_not_tool(self, registry, memory):
        """Parent tool results become placeholders; user/assistant stay intact."""
        from tools.subagent_tool import _inherit_parent_history

        parent_cid = memory.get_or_create_conversation()
        child_cid = str(uuid.uuid4())
        memory.create_conversation(child_cid, parent_id=parent_cid)

        memory.add_message("system", "Parent system", conversation_id=parent_cid)
        memory.add_message("user", "Parent question", conversation_id=parent_cid)
        memory.add_message("assistant", "Parent answer", conversation_id=parent_cid)
        memory.add_message("tool", '{"ok":true,"data":"big"}', tool_name="search", conversation_id=parent_cid)

        _inherit_parent_history(memory, parent_cid, child_cid)

        child_msgs = memory.get_messages(child_cid)
        roles_content = [(m["role"], m["content"]) for m in child_msgs]

        # System is skipped (not inherited).
        assert ("system", "Parent system") not in roles_content

        # User and assistant are unchanged.
        assert ("user", "Parent question") in roles_content
        assert ("assistant", "Parent answer") in roles_content

        # Tool result is replaced with placeholder.
        assert ("tool", PLACEHOLDER_TOOL_RESULT) in roles_content
        assert ("tool", '{"ok":true,"data":"big"}') not in roles_content
```

- [ ] **Step 2: Run integration tests**

```
cd agent && .python/bin/python -m pytest tests/test_subagent.py -v -k TestSubAgentIntegration
```
Expected: PASS (all 4 tests)

- [ ] **Step 3: Run FULL test suite**

```
cd agent && .python/bin/python -m pytest tests/ -v
```
Expected: ALL PASS — no regressions.

- [ ] **Step 4: Commit**

```bash
git add agent/tests/test_subagent.py
git commit -m "test: sub-agent integration tests — inheritance, parallelism, gates, e2e"
```

---

### Task 8: Final verification and cleanup

- [ ] **Step 1: Run full agent test suite**

```
cd agent && .python/bin/python -m pytest tests/ -v
```
Expected: ALL PASS (including all existing tests).

- [ ] **Step 2: Run the agent server smoke test**

```
cd agent && .python/bin/python server.py --port 18765 &
sleep 1
curl -s http://127.0.0.1:18765/health | python -m json.tool
kill %1
```
Expected: `{"status": "ok"}`

- [ ] **Step 3: Verify imports are clean**

```
cd agent && .python/bin/python -c "from server import create_app; app = create_app(); print('server OK')"
```
Expected: `server OK`

- [ ] **Step 4: Verify frontend test suite is not broken**

```
npm test -- --run 2>&1 | tail -5
```
Expected: All vitest tests pass (no Python changes affect frontend).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: final verification — all tests pass, imports clean"
```
