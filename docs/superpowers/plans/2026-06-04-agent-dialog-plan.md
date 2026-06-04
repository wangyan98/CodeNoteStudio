# Agent Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI Agent floating dialog to Code Note Studio — Python FastAPI backend with ReAct loop + SSE streaming, Electron UI with floating chat panel.

**Architecture:** Python FastAPI service (`agent/`) runs as a child process managed by Electron main process. It exposes a REST+SSE API consumed by the renderer via IPC bridge. The Agent implements a ReAct loop with provider-agnostic LLM calling and tool-use via existing `skills/` scripts.

**Tech Stack:** Python 3 (FastAPI, httpx, sqlite3), TypeScript (Electron IPC, React), SSE for streaming

---

## File Map

| File | Purpose |
|------|---------|
| `agent/__init__.py` | Empty package init |
| `agent/requirements.txt` | Python deps |
| `agent/conftest.py` | Pytest: add agent/ to sys.path for test imports |
| `agent/provider/__init__.py` | Empty package init |
| `agent/provider/base.py` | Abstract provider interface |
| `agent/provider/openai_compat.py` | OpenAI-compatible provider (DeepSeek/Qwen/etc) |
| `agent/tools/__init__.py` | Empty package init |
| `agent/tools/registry.py` | Tool registration + OpenAI function schema builder |
| `agent/tools/file_ops.py` | Read repo files, search code, list dirs |
| `agent/tools/mindmap_tools.py` | Wraps skills/mind-map/ scripts |
| `agent/tools/derive_tools.py` | Wraps skills/derive-tree/ scripts |
| `agent/tools/network_tools.py` | Wraps skills/network-graph/ scripts |
| `agent/tools/markdown_tools.py` | Wraps skills/markdown/ scripts |
| `agent/context.py` | Prompt template + system message builder |
| `agent/memory.py` | SQLite conversation store |
| `agent/agent_loop.py` | ReAct loop core |
| `agent/server.py` | FastAPI app entry point |
| `src/main/agent-manager.ts` | Electron: spawn/kill Python process |
| `src/main/ipc-handlers.ts` | Modify: add agent IPC handlers |
| `src/preload/index.ts` | Modify: expose agentAPI |
| `src/renderer/src/types/electron.d.ts` | Modify: add agentAPI types |
| `src/renderer/src/components/AgentDialog.tsx` | Floating chat dialog |
| `src/renderer/src/components/AgentDialog.css` | Dialog styles |
| `src/renderer/src/components/ServerStatus.tsx` | Modify: add Agent button |

---

### Task 1: Provider Abstraction Layer

**Files:**
- Create: `agent/provider/__init__.py`
- Create: `agent/provider/base.py`
- Create: `agent/provider/openai_compat.py`
- Create: `agent/requirements.txt`

- [ ] **Step 1: Write tests for base provider and openai_compat provider**

Create `agent/tests/__init__.py` (empty).

Create `agent/tests/test_provider.py`:

```python
import pytest
import json
from unittest.mock import AsyncMock, patch, MagicMock
from provider.base import BaseProvider
from provider.openai_compat import OpenAICompatProvider


class TestBaseProvider:
    def test_cannot_instantiate_base(self):
        with pytest.raises(TypeError):
            BaseProvider()


class TestOpenAICompatProvider:
    @pytest.fixture
    def provider(self):
        return OpenAICompatProvider(
            base_url="https://api.test.com/v1",
            api_key="test-key",
            model="test-model"
        )

    def test_init_stores_config(self, provider):
        assert provider.base_url == "https://api.test.com/v1"
        assert provider.api_key == "test-key"
        assert provider.model == "test-model"

    @pytest.mark.asyncio
    async def test_chat_stream_emits_events(self, provider):
        """Simulate a complete LLM response: thought -> tool_call -> finish."""
        mock_response = {
            "id": "chat-123",
            "object": "chat.completion.chunk",
            "choices": [{
                "index": 0,
                "delta": {
                    "content": "Let me search the code first.",
                },
                "finish_reason": None
            }]
        }

        async def mock_stream(url, headers, json_data, timeout):
            # Return an async iterator that yields our mock chunk
            class MockResponse:
                async def __aiter__(self):
                    yield type('Chunk', (), {
                        'text': 'data: ' + json.dumps(mock_response) + '\n\n'
                    })()

                async def __aenter__(self):
                    return self

                async def __aexit__(self, *args):
                    pass

            return MockResponse()

        messages = [{"role": "user", "content": "search for main"}]
        tools = [{"type": "function", "function": {"name": "search_code", "parameters": {}}}]

        events = []
        async for event in provider.chat_stream(messages, tools):
            events.append(event)

        # Should have received at least text events
        assert len(events) > 0

    @pytest.mark.asyncio
    async def test_chat_stream_with_tool_call(self, provider):
        """Simulate LLM returning a tool_call delta."""
        mock_chunk_1 = {
            "id": "chat-123",
            "object": "chat.completion.chunk",
            "choices": [{
                "index": 0,
                "delta": {
                    "tool_calls": [{
                        "index": 0,
                        "id": "call_abc",
                        "type": "function",
                        "function": {"name": "search_code", "arguments": ""}
                    }]
                },
                "finish_reason": None
            }]
        }
        mock_chunk_2 = {
            "id": "chat-123",
            "object": "chat.completion.chunk",
            "choices": [{
                "index": 0,
                "delta": {
                    "tool_calls": [{
                        "index": 0,
                        "function": {"arguments": '{"query":"sky atmosphere"}'}
                    }]
                },
                "finish_reason": "tool_calls"
            }]
        }

        events = []
        # Patch httpx.AsyncClient.stream to return our chunks
        with patch('httpx.AsyncClient') as mock_client:
            mock_client_instance = MagicMock()
            mock_client.return_value = mock_client_instance

            async def mock_aiter():
                for chunk in [mock_chunk_1, mock_chunk_2]:
                    data = json.dumps(chunk)
                    yield type('RespChunk', (), {
                        'text': f'data: {data}\n\n'
                    })()

            mock_response = MagicMock()
            mock_response.aiter_lines = MagicMock(return_value=mock_aiter())
            mock_response.raise_for_status = MagicMock()
            mock_response.__aenter__ = AsyncMock(return_value=mock_response)
            mock_response.__aexit__ = AsyncMock(return_value=None)

            mock_client_instance.stream = MagicMock(return_value=mock_response)

            messages = [{"role": "user", "content": "find sky atmosphere"}]
            tools = [{"type": "function", "function": {"name": "search_code", "parameters": {}}}]

            async for event in provider.chat_stream(messages, tools):
                events.append(event)

        # Should have tool_call events
        tool_calls = [e for e in events if e["type"] == "tool_call"]
        assert len(tool_calls) > 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/wangyan/Desktop/note && python3 -m pytest agent/tests/test_provider.py -v`
Expected: FAIL (import errors)

- [ ] **Step 3: Create `agent/requirements.txt`**

```
fastapi>=0.115.0
uvicorn>=0.30.0
httpx>=0.27.0
```

- [ ] **Step 3a: Create `agent/__init__.py`** (empty file)

- [ ] **Step 3b: Create `agent/conftest.py`**

```python
import sys
from pathlib import Path

# Make agent/ modules importable from tests/
sys.path.insert(0, str(Path(__file__).resolve().parent))
```

- [ ] **Step 4: Install deps**

Run: `pip3 install -r agent/requirements.txt`

- [ ] **Step 5: Create `agent/provider/__init__.py`**

```python
from .base import BaseProvider
from .openai_compat import OpenAICompatProvider

__all__ = ["BaseProvider", "OpenAICompatProvider"]
```

- [ ] **Step 6: Create `agent/provider/base.py`**

```python
from abc import ABC, abstractmethod
from typing import AsyncIterator


class BaseProvider(ABC):
    @abstractmethod
    async def chat_stream(
        self,
        messages: list[dict],
        tools: list[dict],
    ) -> AsyncIterator[dict]:
        """Yield SSE-style events: {type: 'text'|'tool_call'|'done', ...}"""
        ...
```

- [ ] **Step 7: Create `agent/provider/openai_compat.py`**

```python
import json
import httpx
from typing import AsyncIterator
from .base import BaseProvider


class OpenAICompatProvider(BaseProvider):
    def __init__(self, base_url: str, api_key: str, model: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model

    async def chat_stream(
        self,
        messages: list[dict],
        tools: list[dict],
    ) -> AsyncIterator[dict]:
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": self.model,
            "messages": messages,
            "tools": tools,
            "stream": True,
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream("POST", url, headers=headers, json=body) as response:
                response.raise_for_status()

                tool_call_buffers: dict[int, dict] = {}

                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data_str = line[6:]
                    if data_str == "[DONE]":
                        # Flush any remaining tool calls
                        for tc in tool_call_buffers.values():
                            tc["function"]["arguments"] = json.loads(
                                tc["function"]["arguments_str"]
                            )
                            del tc["function"]["arguments_str"]
                            yield {"type": "tool_call", "tool_call": tc}
                        yield {"type": "done"}
                        return

                    chunk = json.loads(data_str)
                    delta = chunk["choices"][0]["delta"]
                    finish = chunk["choices"][0].get("finish_reason")

                    if "content" in delta and delta["content"]:
                        yield {"type": "text", "content": delta["content"]}

                    if "tool_calls" in delta:
                        for tc_delta in delta["tool_calls"]:
                            idx = tc_delta["index"]
                            if idx not in tool_call_buffers:
                                tool_call_buffers[idx] = {
                                    "id": tc_delta.get("id", ""),
                                    "type": "function",
                                    "function": {
                                        "name": "",
                                        "arguments_str": "",
                                    },
                                }
                            buf = tool_call_buffers[idx]
                            if "id" in tc_delta:
                                buf["id"] = tc_delta["id"]
                            if tc_delta.get("function", {}).get("name"):
                                buf["function"]["name"] = tc_delta["function"]["name"]
                            if tc_delta.get("function", {}).get("arguments"):
                                buf["function"]["arguments_str"] += tc_delta["function"]["arguments"]

                            if finish == "tool_calls" and buf["function"]["name"] and buf["function"]["arguments_str"]:
                                try:
                                    buf["function"]["arguments"] = json.loads(
                                        buf["function"]["arguments_str"]
                                    )
                                except json.JSONDecodeError:
                                    continue
                                del buf["function"]["arguments_str"]
                                yield {"type": "tool_call", "tool_call": buf}
```

- [ ] **Step 8: Run tests**

Run: `cd /Users/wangyan/Desktop/note && python3 -m pytest agent/tests/test_provider.py -v`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add agent/__init__.py agent/conftest.py agent/requirements.txt agent/provider/ agent/tests/
git commit -m "feat(agent): add provider abstraction with openai_compat implementation"
```

---

### Task 2: Tool Registry

**Files:**
- Create: `agent/tools/__init__.py`
- Create: `agent/tools/registry.py`
- Create: `agent/tests/test_registry.py`

- [ ] **Step 1: Write tests for tool registry**

Create `agent/tests/test_registry.py`:

```python
import pytest
from tools.registry import ToolRegistry


def test_register_tool():
    registry = ToolRegistry()

    def my_tool(query: str) -> dict:
        """Search code for a query string."""
        return {"ok": True, "results": [query]}

    registry.register(
        name="search_code",
        description="Search code for a query string",
        parameters={
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"}
            },
            "required": ["query"],
        },
        handler=my_tool,
    )

    assert "search_code" in registry.tools
    assert registry.tools["search_code"]["handler"] is my_tool


def test_get_openai_schemas():
    registry = ToolRegistry()

    registry.register(
        name="search_code",
        description="Search code",
        parameters={
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
        handler=lambda query: {"ok": True},
    )

    registry.register(
        name="read_file",
        description="Read a file",
        parameters={
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "required": ["path"],
        },
        handler=lambda path: {"ok": True},
    )

    schemas = registry.get_openai_schemas()
    assert len(schemas) == 2
    assert schemas[0]["type"] == "function"
    assert schemas[0]["function"]["name"] == "search_code"


def test_execute_tool():
    registry = ToolRegistry()

    registry.register(
        name="add",
        description="Add two numbers",
        parameters={
            "type": "object",
            "properties": {
                "a": {"type": "integer"},
                "b": {"type": "integer"},
            },
            "required": ["a", "b"],
        },
        handler=lambda a, b: {"ok": True, "sum": a + b},
    )

    result = registry.execute("add", {"a": 3, "b": 4})
    assert result["ok"] is True
    assert result["sum"] == 7


def test_execute_unknown_tool_raises():
    registry = ToolRegistry()
    with pytest.raises(KeyError, match="unknown_tool"):
        registry.execute("unknown_tool", {})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/wangyan/Desktop/note && python3 -m pytest agent/tests/test_registry.py -v`
Expected: FAIL

- [ ] **Step 3: Create `agent/tools/__init__.py`**

```python
from .registry import ToolRegistry

__all__ = ["ToolRegistry"]
```

- [ ] **Step 4: Create `agent/tools/registry.py`**

```python
from typing import Callable


class ToolRegistry:
    def __init__(self):
        self.tools: dict[str, dict] = {}

    def register(
        self,
        name: str,
        description: str,
        parameters: dict,
        handler: Callable,
    ):
        self.tools[name] = {
            "name": name,
            "description": description,
            "parameters": parameters,
            "handler": handler,
        }

    def get_openai_schemas(self) -> list[dict]:
        return [
            {
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t["description"],
                    "parameters": t["parameters"],
                },
            }
            for t in self.tools.values()
        ]

    def execute(self, name: str, arguments: dict) -> dict:
        if name not in self.tools:
            raise KeyError(f"Tool '{name}' not registered")
        handler = self.tools[name]["handler"]
        return handler(**arguments)
```

- [ ] **Step 5: Run tests**

Run: `cd /Users/wangyan/Desktop/note && python3 -m pytest agent/tests/test_registry.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add agent/tools/__init__.py agent/tools/registry.py agent/tests/test_registry.py
git commit -m "feat(agent): add tool registry with openai function schema support"
```

---

### Task 3: File Ops Tools

**Files:**
- Create: `agent/tools/file_ops.py`
- Create: `agent/tests/test_file_ops.py`

- [ ] **Step 1: Write tests for file_ops tools**

Create `agent/tests/test_file_ops.py`:

```python
import os
import tempfile
import pytest
from tools.file_ops import read_file, list_files, search_in_files


class TestReadFile:
    def test_read_existing_file(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
            f.write("def hello():\n    print('world')\n")
            tmp_path = f.name

        try:
            result = read_file(tmp_path)
            assert result["ok"] is True
            assert "def hello()" in result["content"]
            assert result["path"] == tmp_path
        finally:
            os.unlink(tmp_path)

    def test_read_nonexistent_file(self):
        result = read_file("/nonexistent/path.txt")
        assert result["ok"] is False
        assert "error" in result


class TestListFiles:
    def test_list_directory(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            os.makedirs(os.path.join(tmpdir, "subdir"))
            with open(os.path.join(tmpdir, "a.py"), "w") as f:
                f.write("x=1")
            with open(os.path.join(tmpdir, "b.txt"), "w") as f:
                f.write("hello")

            result = list_files(tmpdir)
            assert result["ok"] is True
            names = [f["name"] for f in result["files"]]
            assert "a.py" in names
            assert "b.txt" in names
            assert any(f["is_directory"] for f in result["files"])


class TestSearchInFiles:
    def test_search_finds_match(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with open(os.path.join(tmpdir, "main.py"), "w") as f:
                f.write("def sky_atmosphere():\n    pass\n")

            result = search_in_files(tmpdir, "sky_atmosphere")
            assert result["ok"] is True
            assert len(result["matches"]) >= 1
            assert "sky_atmosphere" in result["matches"][0]["line"]

    def test_search_no_match(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with open(os.path.join(tmpdir, "main.py"), "w") as f:
                f.write("def hello():\n    pass\n")

            result = search_in_files(tmpdir, "nonexistent_xyz")
            assert result["ok"] is True
            assert len(result["matches"]) == 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/wangyan/Desktop/note && python3 -m pytest agent/tests/test_file_ops.py -v`
Expected: FAIL

- [ ] **Step 3: Create `agent/tools/file_ops.py`**

```python
import os


def read_file(path: str, start_line: int = 1, end_line: int = -1) -> dict:
    """Read a file from disk. Optionally specify line range."""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()

        if end_line == -1:
            end_line = len(lines)

        selected = lines[start_line - 1:end_line]
        content = "".join(selected)

        return {
            "ok": True,
            "path": path,
            "content": content,
            "total_lines": len(lines),
        }
    except FileNotFoundError:
        return {"ok": False, "error": f"File not found: {path}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def list_files(directory: str, pattern: str = "*") -> dict:
    """List files in a directory, recursively."""
    import fnmatch

    if not os.path.isdir(directory):
        return {"ok": False, "error": f"Not a directory: {directory}"}

    files = []
    for root, dirs, filenames in os.walk(directory):
        # Skip hidden dirs
        dirs[:] = [d for d in dirs if not d.startswith(".") and d != "__pycache__"]

        for d in dirs:
            files.append({
                "name": d,
                "path": os.path.join(root, d),
                "is_directory": True,
            })

        for fname in filenames:
            if fname.startswith("."):
                continue
            if pattern != "*" and not fnmatch.fnmatch(fname, pattern):
                continue
            files.append({
                "name": fname,
                "path": os.path.join(root, fname),
                "is_directory": False,
            })

    return {"ok": True, "files": files, "count": len(files)}


def search_in_files(directory: str, query: str, file_pattern: str = "*.py") -> dict:
    """Grep for a query string in files under a directory."""
    import fnmatch

    if not os.path.isdir(directory):
        return {"ok": False, "error": f"Not a directory: {directory}"}

    matches = []
    for root, dirs, filenames in os.walk(directory):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d != "__pycache__"]
        for fname in filenames:
            if not fnmatch.fnmatch(fname, file_pattern):
                continue
            fpath = os.path.join(root, fname)
            try:
                with open(fpath, "r", encoding="utf-8", errors="replace") as f:
                    for lineno, line in enumerate(f, 1):
                        if query.lower() in line.lower():
                            matches.append({
                                "file": fpath,
                                "line_number": lineno,
                                "line": line.strip(),
                            })
            except Exception:
                continue

    return {"ok": True, "matches": matches, "count": len(matches)}
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/wangyan/Desktop/note && python3 -m pytest agent/tests/test_file_ops.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agent/tools/file_ops.py agent/tests/test_file_ops.py
git commit -m "feat(agent): add file_ops tools (read_file, list_files, search_in_files)"
```

---

### Task 4: Context Template Builder

**Files:**
- Create: `agent/context.py`
- Create: `agent/tests/test_context.py`

- [ ] **Step 1: Write tests for context builder**

Create `agent/tests/test_context.py`:

```python
from context import build_system_message, build_context


def test_build_system_message_includes_workspace_and_repos():
    msg = build_system_message(
        workspace="/Users/test/workspace",
        repos=["/Users/test/repo1", "/Users/test/repo2"],
        output_dir="/Users/test/workspace/docs",
    )
    assert "/Users/test/workspace" in msg
    assert "/Users/test/repo1" in msg
    assert "/Users/test/repo2" in msg
    assert "/Users/test/workspace/docs" in msg


def test_build_system_message_with_no_repos():
    msg = build_system_message(
        workspace="/Users/test/workspace",
        repos=[],
        output_dir="/Users/test/workspace/docs",
    )
    assert "/Users/test/workspace" in msg


def test_build_context_returns_correct_dict():
    result = build_context(
        workspace="/ws",
        repos=["/repo"],
        output_dir="/ws/docs",
    )
    assert result["workspace"] == "/ws"
    assert result["repos"] == ["/repo"]
    assert result["output_dir"] == "/ws/docs"


def test_build_context_default_output_dir():
    result = build_context(workspace="/ws", repos=["/repo"])
    assert result["output_dir"] == "/ws/docs"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/wangyan/Desktop/note && python3 -m pytest agent/tests/test_context.py -v`
Expected: FAIL

- [ ] **Step 3: Create `agent/context.py`**

```python
SYSTEM_TEMPLATE = """You are a code analysis assistant. You help users understand code repositories by searching, reading files, and generating structured documentation.

## Current Context
- Workspace: {workspace}
- Code Repositories: {repos}
- Output directory for generated docs: {output_dir}

## Available Tools
You have access to tools for:
- **File operations**: read_file, list_files, search_in_files — read and search code in the repositories
- **Mind maps**: create_mindmap, add_node, update_node, delete_node — create .mind.json documents for hierarchical concept mapping
- **Derivation trees**: create_derive, add_step, update_step, delete_step, set_derives_from — create .derive.json documents for step-by-step derivations
- **Network graphs**: create_network, add_layer, add_block, add_connection, update_node, delete_node — create .net.json documents for neural network architecture diagrams
- **Markdown**: create_md, append_section, replace_section — create .md documents

## Guidelines
1. When asked to analyze code, first use search_in_files and read_file to understand the relevant source files.
2. Then choose the most appropriate document type(s) to present your findings.
3. Generate documents in the output directory using relative paths within the workspace.
4. Be thorough but concise. Focus on what the user asked about.
5. After generating documents, summarize what you created and where.
"""


def build_system_message(
    workspace: str,
    repos: list[str],
    output_dir: str,
) -> str:
    return SYSTEM_TEMPLATE.format(
        workspace=workspace,
        repos=", ".join(repos) if repos else "(none)",
        output_dir=output_dir,
    )


def build_context(
    workspace: str,
    repos: list[str],
    output_dir: str | None = None,
) -> dict:
    if output_dir is None:
        output_dir = f"{workspace}/docs"
    return {
        "workspace": workspace,
        "repos": repos,
        "output_dir": output_dir,
    }
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/wangyan/Desktop/note && python3 -m pytest agent/tests/test_context.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agent/context.py agent/tests/test_context.py
git commit -m "feat(agent): add context template builder for system prompts"
```

---

### Task 5: Conversation Memory

**Files:**
- Create: `agent/memory.py`
- Create: `agent/tests/test_memory.py`

- [ ] **Step 1: Write tests for memory**

Create `agent/tests/test_memory.py`:

```python
import os
import tempfile
import pytest
from memory import ConversationMemory


class TestConversationMemory:
    @pytest.fixture
    def memory(self):
        tmpdir = tempfile.mkdtemp()
        db_path = os.path.join(tmpdir, "test.db")
        mem = ConversationMemory(db_path)
        yield mem
        mem.close()
        os.unlink(db_path)
        os.rmdir(tmpdir)

    def test_init_creates_tables(self, memory):
        cursor = memory.conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )
        tables = [row[0] for row in cursor.fetchall()]
        assert "conversations" in tables
        assert "messages" in tables

    def test_get_or_create_conversation(self, memory):
        conv_id = memory.get_or_create_conversation()
        assert conv_id is not None
        # Second call returns same conversation
        conv_id2 = memory.get_or_create_conversation()
        assert conv_id2 == conv_id

    def test_add_and_get_messages(self, memory):
        memory.add_message("user", "hello world")
        memory.add_message("assistant", "hi there", tool_name=None)
        memory.add_message("tool", '{"ok": true}', tool_name="search_code")

        messages = memory.get_messages()
        assert len(messages) == 3
        assert messages[0]["role"] == "user"
        assert messages[0]["content"] == "hello world"
        assert messages[1]["role"] == "assistant"
        assert messages[2]["role"] == "tool"
        assert messages[2]["tool_name"] == "search_code"

    def test_clear_messages(self, memory):
        memory.add_message("user", "test")
        assert len(memory.get_messages()) == 1

        memory.clear()
        assert len(memory.get_messages()) == 0

    def test_get_openai_messages(self, memory):
        memory.add_message("user", "hello")
        memory.add_message("assistant", "hi", tool_name=None)
        memory.add_message("tool", '{"ok": true}', tool_name="search_code")

        msgs = memory.get_openai_messages()
        assert len(msgs) == 3
        assert msgs[0] == {"role": "user", "content": "hello"}
        assert msgs[1] == {"role": "assistant", "content": "hi"}
        assert msgs[2] == {
            "role": "tool",
            "content": '{"ok": true}',
            "tool_call_id": "search_code",
        }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/wangyan/Desktop/note && python3 -m pytest agent/tests/test_memory.py -v`
Expected: FAIL

- [ ] **Step 3: Create `agent/memory.py`**

```python
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
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/wangyan/Desktop/note && python3 -m pytest agent/tests/test_memory.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agent/memory.py agent/tests/test_memory.py
git commit -m "feat(agent): add conversation memory with sqlite storage"
```

---

### Task 6: Skill Tool Wrappers (mindmap, derive, network, markdown)

**Files:**
- Create: `agent/tools/mindmap_tools.py`
- Create: `agent/tools/derive_tools.py`
- Create: `agent/tools/network_tools.py`
- Create: `agent/tools/markdown_tools.py`
- Create: `agent/tests/test_skill_tools.py`

- [ ] **Step 1: Write integration-style tests for skill tool wrappers**

Create `agent/tests/test_skill_tools.py`:

```python
import os
import tempfile
import pytest
from tools.mindmap_tools import register_mindmap_tools
from tools.markdown_tools import register_markdown_tools
from tools.registry import ToolRegistry


class TestMindmapTools:
    @pytest.fixture
    def registry(self):
        reg = ToolRegistry()
        register_mindmap_tools(reg)
        return reg

    def test_create_mindmap(self, registry):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "test.mind.json")
            result = registry.execute("create_mindmap", {"path": path})
            assert result["ok"] is True
            assert "id" in result
            assert os.path.exists(path)

    def test_add_node(self, registry):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "test.mind.json")
            create_result = registry.execute("create_mindmap", {"path": path})
            parent_id = create_result["id"]

            result = registry.execute("add_node", {
                "path": path,
                "parent_id": parent_id,
                "title": "Child Node",
                "content": "Some content",
            })
            assert result["ok"] is True
            assert "id" in result


class TestMarkdownTools:
    @pytest.fixture
    def registry(self):
        reg = ToolRegistry()
        register_markdown_tools(reg)
        return reg

    def test_create_md(self, registry):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "test.md")
            result = registry.execute("create_md", {
                "path": path,
                "title": "My Doc",
            })
            assert result["ok"] is True
            assert os.path.exists(path)
            with open(path) as f:
                content = f.read()
            assert "# My Doc" in content

    def test_append_section(self, registry):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "test.md")
            registry.execute("create_md", {"path": path, "title": "Doc"})
            result = registry.execute("append_section", {
                "path": path,
                "heading": "Analysis",
                "content": "This is the analysis content.",
            })
            assert result["ok"] is True
            with open(path) as f:
                content = f.read()
            assert "## Analysis" in content
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/wangyan/Desktop/note && python3 -m pytest agent/tests/test_skill_tools.py -v`
Expected: FAIL

- [ ] **Step 3: Create `agent/tools/mindmap_tools.py`**

```python
import json
import subprocess
import sys
from pathlib import Path
from .registry import ToolRegistry

SKILLS_DIR = Path(__file__).resolve().parents[2] / "skills"


def register_mindmap_tools(registry: ToolRegistry):
    registry.register(
        name="create_mindmap",
        description="Create a new .mind.json mind map file with a root node",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .mind.json file to create"},
            },
            "required": ["path"],
        },
        handler=lambda path: _run_skill_script("mind-map/scripts/create_mindmap.py", path),
    )

    registry.register(
        name="add_node",
        description="Add a child node to a mind map node",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .mind.json file"},
                "parent_id": {"type": "string", "description": "ID of the parent node"},
                "title": {"type": "string", "description": "Title of the new node"},
                "content": {"type": "string", "description": "Content of the new node (optional)"},
            },
            "required": ["path", "parent_id", "title"],
        },
        handler=lambda path, parent_id, title, content="": _run_skill_script(
            "mind-map/scripts/add_node.py", path, parent_id, f"--title", title, f"--content", content
        ),
    )

    registry.register(
        name="update_node",
        description="Update a mind map node's title, content, or code mapping",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .mind.json file"},
                "node_id": {"type": "string", "description": "ID of the node to update"},
                "title": {"type": "string", "description": "New title (optional)"},
                "content": {"type": "string", "description": "New content (optional)"},
            },
            "required": ["path", "node_id"],
        },
        handler=lambda path, node_id, title=None, content=None: _update_node(path, node_id, title, content),
    )

    registry.register(
        name="delete_node",
        description="Delete a node from a mind map (and its subtree)",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .mind.json file"},
                "node_id": {"type": "string", "description": "ID of the node to delete"},
            },
            "required": ["path", "node_id"],
        },
        handler=lambda path, node_id: _run_skill_script(
            "mind-map/scripts/delete_node.py", path, node_id
        ),
    )


def _update_node(path, node_id, title=None, content=None):
    args = ["mind-map/scripts/update_node.py", path, node_id]
    if title is not None:
        args.extend(["--title", title])
    if content is not None:
        args.extend(["--content", content])
    return _run_skill_script(*args)


def _run_skill_script(*args: str) -> dict:
    script_path = SKILLS_DIR / args[0]
    cmd = [sys.executable, str(script_path)] + list(args[1:])
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        return {"ok": False, "error": result.stderr.strip() or result.stdout.strip()}
    try:
        return json.loads(result.stdout.strip())
    except json.JSONDecodeError:
        return {"ok": False, "error": result.stdout.strip()}
```

- [ ] **Step 4: Create `agent/tools/derive_tools.py`**

```python
from .registry import ToolRegistry
from .mindmap_tools import _run_skill_script


def register_derive_tools(registry: ToolRegistry):
    registry.register(
        name="create_derive",
        description="Create a new .derive.json derivation tree file",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .derive.json file to create"},
            },
            "required": ["path"],
        },
        handler=lambda path: _run_skill_script("derive-tree/scripts/create_derive.py", path),
    )

    registry.register(
        name="add_step",
        description="Add a step to a derivation tree",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .derive.json file"},
                "title": {"type": "string", "description": "Title of the step"},
                "content": {"type": "string", "description": "Content of the step (optional)"},
                "after_step": {"type": "integer", "description": "Step number to insert after (optional)"},
                "derives_from": {"type": "string", "description": "ID of the parent step (optional)"},
            },
            "required": ["path", "title"],
        },
        handler=lambda path, title, content="", after_step=None, derives_from=None: _add_step(
            path, title, content, after_step, derives_from
        ),
    )


def _add_step(path, title, content="", after_step=None, derives_from=None):
    args = ["derive-tree/scripts/add_step.py", path]
    if after_step is not None:
        args.extend(["--after-step", str(after_step)])
    if derives_from:
        args.extend(["--derives-from", derives_from])
    args.extend(["--title", title])
    args.extend(["--content", content])
    return _run_skill_script(*args)
```

- [ ] **Step 5: Create `agent/tools/network_tools.py`**

```python
from .registry import ToolRegistry
from .mindmap_tools import _run_skill_script


def register_network_tools(registry: ToolRegistry):
    registry.register(
        name="create_network",
        description="Create a new .net.json neural network graph file",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .net.json file to create"},
                "name": {"type": "string", "description": "Name of the network (optional)"},
            },
            "required": ["path"],
        },
        handler=lambda path, name="New Network": _run_skill_script(
            "network-graph/scripts/create_network.py", path, "--name", name
        ),
    )

    registry.register(
        name="add_layer",
        description="Add a layer to a network graph",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .net.json file"},
                "layer_type": {"type": "string", "description": "Type of layer (e.g., Linear, Conv2d)"},
                "name": {"type": "string", "description": "Name/label for the layer (optional)"},
            },
            "required": ["path", "layer_type"],
        },
        handler=lambda path, layer_type, name=None: _add_layer(path, layer_type, name),
    )


def _add_layer(path, layer_type, name=None):
    args = ["network-graph/scripts/add_layer.py", path, layer_type]
    if name:
        args.extend(["--name", name])
    return _run_skill_script(*args)
```

- [ ] **Step 6: Create `agent/tools/markdown_tools.py`**

```python
from .registry import ToolRegistry
from .mindmap_tools import _run_skill_script


def register_markdown_tools(registry: ToolRegistry):
    registry.register(
        name="create_md",
        description="Create a new .md markdown file",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .md file to create"},
                "title": {"type": "string", "description": "Title for the document (optional)"},
            },
            "required": ["path"],
        },
        handler=lambda path, title=None: _create_md(path, title),
    )

    registry.register(
        name="append_section",
        description="Append a section to a markdown file",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .md file"},
                "heading": {"type": "string", "description": "Section heading (without ##)"},
                "content": {"type": "string", "description": "Section content"},
            },
            "required": ["path", "heading", "content"],
        },
        handler=lambda path, heading, content: _run_skill_script(
            "markdown/scripts/append_section.py", path, heading, content
        ),
    )

    registry.register(
        name="replace_section",
        description="Replace a section in a markdown file",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .md file"},
                "heading": {"type": "string", "description": "Section heading to replace (without ##)"},
                "content": {"type": "string", "description": "New section content"},
            },
            "required": ["path", "heading", "content"],
        },
        handler=lambda path, heading, content: _run_skill_script(
            "markdown/scripts/replace_section.py", path, heading, content
        ),
    )


def _create_md(path, title=None):
    args = ["markdown/scripts/create_md.py", path]
    if title:
        args.extend(["--title", title])
    return _run_skill_script(*args)
```

- [ ] **Step 7: Run tests**

Run: `cd /Users/wangyan/Desktop/note && python3 -m pytest agent/tests/test_skill_tools.py -v`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add agent/tools/mindmap_tools.py agent/tools/derive_tools.py agent/tools/network_tools.py agent/tools/markdown_tools.py agent/tests/test_skill_tools.py
git commit -m "feat(agent): add skill tool wrappers for mindmap, derive, network, markdown"
```

---

### Task 7: ReAct Agent Loop

**Files:**
- Create: `agent/agent_loop.py`
- Create: `agent/tests/test_agent_loop.py`

- [ ] **Step 1: Write tests for agent loop**

Create `agent/tests/test_agent_loop.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from agent_loop import AgentLoop


class FakeProvider:
    """A fake provider that returns pre-scripted responses."""
    def __init__(self, responses: list[list[dict]]):
        self.responses = responses
        self.call_count = 0

    async def chat_stream(self, messages, tools):
        if self.call_count < len(self.responses):
            for event in self.responses[self.call_count]:
                yield event
        else:
            yield {"type": "text", "content": "I'm done."}
            yield {"type": "done"}
        self.call_count += 1


class TestAgentLoop:
    @pytest.fixture
    def registry_with_tools(self):
        from tools.registry import ToolRegistry
        reg = ToolRegistry()
        reg.register(
            name="echo",
            description="Echo back the input",
            parameters={
                "type": "object",
                "properties": {"message": {"type": "string"}},
                "required": ["message"],
            },
            handler=lambda message: {"ok": True, "echo": message},
        )
        return reg

    @pytest.mark.asyncio
    async def test_simple_text_response(self, registry_with_tools):
        """Agent responds with text only, no tool calls."""
        provider = FakeProvider([
            [{"type": "text", "content": "Hello!"}, {"type": "done"}],
        ])

        agent = AgentLoop(
            provider=provider,
            registry=registry_with_tools,
            workspace="/ws",
            repos=["/repo"],
            output_dir="/ws/docs",
            max_steps=5,
        )

        events = []
        async for event in agent.run("say hello"):
            events.append(event)

        # Should have text event and done
        texts = [e for e in events if e["type"] == "text"]
        assert len(texts) > 0
        assert texts[0]["content"] == "Hello!"
        assert events[-1]["type"] == "done"

    @pytest.mark.asyncio
    async def test_tool_call_and_continue(self, registry_with_tools):
        """Agent calls a tool, gets result, then responds."""
        provider = FakeProvider([
            # First turn: call echo tool
            [
                {
                    "type": "tool_call",
                    "tool_call": {
                        "id": "call_1",
                        "function": {
                            "name": "echo",
                            "arguments": {"message": "test message"},
                        },
                    },
                },
                {"type": "done"},
            ],
            # Second turn: text response after seeing tool result
            [
                {"type": "text", "content": "I echoed your message."},
                {"type": "done"},
            ],
        ])

        agent = AgentLoop(
            provider=provider,
            registry=registry_with_tools,
            workspace="/ws",
            repos=["/repo"],
            output_dir="/ws/docs",
            max_steps=5,
        )

        events = []
        async for event in agent.run("echo test"):
            events.append(event)

        # Should have tool_call, tool_result, text, done
        tool_calls = [e for e in events if e["type"] == "tool_call"]
        tool_results = [e for e in events if e["type"] == "tool_result"]
        assert len(tool_calls) == 1
        assert len(tool_results) == 1
        assert tool_results[0]["result"]["ok"] is True
        assert tool_results[0]["result"]["echo"] == "test message"

    @pytest.mark.asyncio
    async def test_max_steps_limit(self, registry_with_tools):
        """Agent stops after max_steps even if LLM keeps calling tools."""
        provider = FakeProvider([
            # Keep calling tool forever
            [
                {
                    "type": "tool_call",
                    "tool_call": {
                        "id": "call_1",
                        "function": {
                            "name": "echo",
                            "arguments": {"message": "loop"},
                        },
                    },
                },
                {"type": "done"},
            ],
            [
                {
                    "type": "tool_call",
                    "tool_call": {
                        "id": "call_2",
                        "function": {
                            "name": "echo",
                            "arguments": {"message": "loop"},
                        },
                    },
                },
                {"type": "done"},
            ],
            [
                {
                    "type": "tool_call",
                    "tool_call": {
                        "id": "call_3",
                        "function": {
                            "name": "echo",
                            "arguments": {"message": "loop"},
                        },
                    },
                },
                {"type": "done"},
            ],
        ])

        agent = AgentLoop(
            provider=provider,
            registry=registry_with_tools,
            workspace="/ws",
            repos=["/repo"],
            output_dir="/ws/docs",
            max_steps=2,
        )

        events = []
        async for event in agent.run("loop test"):
            events.append(event)

        # Should have been cut off by max_steps
        done_events = [e for e in events if e["type"] == "done"]
        assert len(done_events) == 1
        # Should have at most max_steps tool calls
        tool_calls = [e for e in events if e["type"] == "tool_call"]
        assert len(tool_calls) <= 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/wangyan/Desktop/note && python3 -m pytest agent/tests/test_agent_loop.py -v`
Expected: FAIL

- [ ] **Step 3: Create `agent/agent_loop.py`**

```python
import json
from typing import AsyncIterator
from provider.base import BaseProvider
from tools.registry import ToolRegistry
from context import build_system_message
from memory import ConversationMemory


class AgentLoop:
    def __init__(
        self,
        provider: BaseProvider,
        registry: ToolRegistry,
        memory: ConversationMemory,
        workspace: str,
        repos: list[str],
        output_dir: str,
        max_steps: int = 15,
    ):
        self.provider = provider
        self.registry = registry
        self.memory = memory
        self.workspace = workspace
        self.repos = repos
        self.output_dir = output_dir
        self.max_steps = max_steps

    async def run(self, user_message: str) -> AsyncIterator[dict]:
        # Build system message and add to memory on first message
        existing = self.memory.get_messages()
        if len(existing) == 0:
            system_msg = build_system_message(
                workspace=self.workspace,
                repos=self.repos,
                output_dir=self.output_dir,
            )
            self.memory.add_message("system", system_msg)

        # Add user message
        self.memory.add_message("user", user_message)
        yield {"type": "user", "content": user_message}

        tools = self.registry.get_openai_schemas()
        step = 0

        while step < self.max_steps:
            step += 1
            messages = self.memory.get_openai_messages()

            tool_calls_in_turn: list[dict] = []

            async for event in self.provider.chat_stream(messages, tools):
                if event["type"] == "text":
                    yield event

                elif event["type"] == "tool_call":
                    tc = event["tool_call"]
                    tool_calls_in_turn.append(tc)
                    yield {"type": "tool_call", "name": tc["function"]["name"], "arguments": tc["function"]["arguments"]}

                elif event["type"] == "done":
                    pass

            # Execute any tool calls from this turn
            if tool_calls_in_turn:
                for tc in tool_calls_in_turn:
                    name = tc["function"]["name"]
                    args = tc["function"]["arguments"]
                    try:
                        result = self.registry.execute(name, args)
                    except Exception as e:
                        result = {"ok": False, "error": str(e)}

                    result_str = json.dumps(result, ensure_ascii=False)
                    self.memory.add_message("tool", result_str, tool_name=tc["id"])
                    yield {"type": "tool_result", "tool_call_id": tc["id"], "name": name, "result": result}

                # Continue loop to let LLM process tool results
                continue

            # No tool calls — assistant finished
            # Store the assistant's text response
            assistant_text = "".join(
                e.get("content", "")
                for e in []  # text events were already yielded
            )
            yield {"type": "done"}
            return

        # Max steps reached
        yield {"type": "text", "content": "\n\n[Max steps reached. Stopping.]"}
        yield {"type": "done"}
```

Wait — I realize there's a bug in the above. The assistant text needs to be collected during streaming and stored in memory. Let me fix the agent_loop.py:

- [ ] **Step 3 (revised): Create `agent/agent_loop.py`**

```python
import json
from typing import AsyncIterator
from provider.base import BaseProvider
from tools.registry import ToolRegistry
from context import build_system_message
from memory import ConversationMemory


class AgentLoop:
    def __init__(
        self,
        provider: BaseProvider,
        registry: ToolRegistry,
        memory: ConversationMemory,
        workspace: str,
        repos: list[str],
        output_dir: str,
        max_steps: int = 15,
    ):
        self.provider = provider
        self.registry = registry
        self.memory = memory
        self.workspace = workspace
        self.repos = repos
        self.output_dir = output_dir
        self.max_steps = max_steps

    async def run(self, user_message: str) -> AsyncIterator[dict]:
        existing = self.memory.get_messages()
        if len(existing) == 0:
            system_msg = build_system_message(
                workspace=self.workspace,
                repos=self.repos,
                output_dir=self.output_dir,
            )
            self.memory.add_message("system", system_msg)

        self.memory.add_message("user", user_message)
        yield {"type": "user", "content": user_message}

        tools = self.registry.get_openai_schemas()
        step = 0

        while step < self.max_steps:
            step += 1
            messages = self.memory.get_openai_messages()

            tool_calls_in_turn: list[dict] = []
            assistant_text_parts: list[str] = []

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

            # Execute tool calls
            if tool_calls_in_turn:
                # Store assistant message with tool_calls for OpenAI format
                if assistant_text_parts:
                    self.memory.add_message("assistant", "".join(assistant_text_parts))

                for tc in tool_calls_in_turn:
                    name = tc["function"]["name"]
                    args = tc["function"]["arguments"]
                    try:
                        result = self.registry.execute(name, args)
                    except Exception as e:
                        result = {"ok": False, "error": str(e)}

                    result_str = json.dumps(result, ensure_ascii=False)
                    self.memory.add_message("tool", result_str, tool_name=tc["id"])
                    yield {
                        "type": "tool_result",
                        "tool_call_id": tc["id"],
                        "name": name,
                        "result": result,
                    }
                continue

            # No tool calls — conversation complete
            full_text = "".join(assistant_text_parts)
            if full_text:
                self.memory.add_message("assistant", full_text)
            yield {"type": "done"}
            return

        yield {"type": "text", "content": "\n\n[Max steps reached. Stopping.]"}
        yield {"type": "done"}
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/wangyan/Desktop/note && python3 -m pytest agent/tests/test_agent_loop.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agent/agent_loop.py agent/tests/test_agent_loop.py
git commit -m "feat(agent): add ReAct agent loop with tool use and max_steps limit"
```

---

### Task 8: FastAPI Server

**Files:**
- Create: `agent/server.py`
- Create: `agent/tests/test_server.py`

- [ ] **Step 1: Write tests for the server**

Create `agent/tests/test_server.py`:

```python
import pytest
from httpx import ASGITransport, AsyncClient
from server import create_app
from memory import ConversationMemory
from tools.registry import ToolRegistry
from agent_loop import AgentLoop


class FakeProvider:
    def __init__(self):
        pass

    async def chat_stream(self, messages, tools):
        yield {"type": "text", "content": "Fake response."}
        yield {"type": "done"}


@pytest.fixture
def app():
    import tempfile
    import os

    tmpdir = tempfile.mkdtemp()
    db_path = os.path.join(tmpdir, "test.db")

    memory = ConversationMemory(db_path)
    registry = ToolRegistry()

    def make_agent(provider, workspace, repos, output_dir):
        return AgentLoop(
            provider=provider,
            registry=registry,
            memory=memory,
            workspace=workspace or "/ws",
            repos=repos or [],
            output_dir=output_dir or "/ws/docs",
            max_steps=5,
        )

    return create_app(make_agent, memory)


@pytest.mark.asyncio
async def test_health_check(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_chat_endpoint_accepts_request(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/chat",
            json={
                "message": "hello",
                "provider_id": "fake",
                "workspace": "/ws",
                "repos": ["/repo"],
                "output_dir": "/ws/docs",
            },
        )
        # SSE should return 200
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_history_endpoints(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Get empty history
        resp = await client.get("/history")
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert len(data["messages"]) == 0

        # Clear history
        resp = await client.delete("/history")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/wangyan/Desktop/note && python3 -m pytest agent/tests/test_server.py -v`
Expected: FAIL

- [ ] **Step 3: Create `agent/server.py`**

```python
import json
import os
import sys
from pathlib import Path

# Ensure agent/ is on path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from memory import ConversationMemory
from tools.registry import ToolRegistry
from tools.file_ops import read_file, list_files, search_in_files
from tools.mindmap_tools import register_mindmap_tools
from tools.derive_tools import register_derive_tools
from tools.network_tools import register_network_tools
from tools.markdown_tools import register_markdown_tools
from agent_loop import AgentLoop
from provider.openai_compat import OpenAICompatProvider


def load_providers() -> list[dict]:
    config_path = os.path.expanduser("~/.code-note-studio/providers.json")
    if os.path.exists(config_path):
        with open(config_path) as f:
            return json.load(f)
    return []


def build_registry() -> ToolRegistry:
    registry = ToolRegistry()

    # File ops
    registry.register(
        name="read_file",
        description="Read a file from disk. Returns file contents with line numbers.",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Absolute path to the file"},
                "start_line": {"type": "integer", "description": "Start line (1-based, default 1)"},
                "end_line": {"type": "integer", "description": "End line (inclusive, default -1 for end of file)"},
            },
            "required": ["path"],
        },
        handler=read_file,
    )

    registry.register(
        name="list_files",
        description="List files in a directory recursively",
        parameters={
            "type": "object",
            "properties": {
                "directory": {"type": "string", "description": "Directory path to list"},
                "pattern": {"type": "string", "description": "Filename glob pattern (default *)"},
            },
            "required": ["directory"],
        },
        handler=list_files,
    )

    registry.register(
        name="search_in_files",
        description="Search for a string pattern in files under a directory (case-insensitive)",
        parameters={
            "type": "object",
            "properties": {
                "directory": {"type": "string", "description": "Directory to search in"},
                "query": {"type": "string", "description": "Search query string"},
                "file_pattern": {"type": "string", "description": "File glob pattern (default *.py)"},
            },
            "required": ["directory", "query"],
        },
        handler=search_in_files,
    )

    # Skill tools
    register_mindmap_tools(registry)
    register_derive_tools(registry)
    register_network_tools(registry)
    register_markdown_tools(registry)

    return registry


def create_app(agent_factory=None, memory=None):
    app = FastAPI(title="Code Note Agent")
    registry = build_registry()
    providers = load_providers()

    if memory is None:
        memory = ConversationMemory(":memory:")

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
        workspace = body.get("workspace", "")
        repos = body.get("repos", [])
        output_dir = body.get("output_dir", f"{workspace}/docs")

        # Resolve provider
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
            agent = agent_factory(provider, workspace, repos, output_dir)
        else:
            agent = AgentLoop(
                provider=provider,
                registry=registry,
                memory=memory,
                workspace=workspace,
                repos=repos,
                output_dir=output_dir,
            )

        async def event_stream():
            async for event in agent.run(message):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    @app.get("/history")
    async def get_history():
        messages = memory.get_messages()
        # Filter out system messages from client view
        user_visible = [m for m in messages if m["role"] != "system"]
        return {"ok": True, "messages": user_visible}

    @app.delete("/history")
    async def clear_history():
        memory.clear()
        return {"ok": True}

    return app


app = create_app()


def main():
    import argparse
    import uvicorn

    parser = argparse.ArgumentParser(description="Code Note Agent Server")
    parser.add_argument("--port", type=int, default=8765, help="Port to listen on")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host to bind to")
    args = parser.parse_args()

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/wangyan/Desktop/note && python3 -m pytest agent/tests/test_server.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agent/server.py agent/tests/test_server.py
git commit -m "feat(agent): add FastAPI server with /chat SSE, /history, /health endpoints"
```

---

### Task 9: Electron Agent Manager + IPC

**Files:**
- Create: `src/main/agent-manager.ts`
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/types/electron.d.ts`

- [ ] **Step 1: Create `src/main/agent-manager.ts`**

```typescript
import { spawn, ChildProcess } from 'child_process'
import net from 'net'
import path from 'path'
import { app } from 'electron'

let agentProcess: ChildProcess | null = null
let agentPort: number | null = null
let restartAttempts = 0
const MAX_RESTART_ATTEMPTS = 3

function getRandomPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address === 'object') {
        const port = address.port
        server.close(() => resolve(port))
      } else {
        reject(new Error('Failed to get random port'))
      }
    })
  })
}

async function waitForHealth(port: number, timeoutMs: number = 5000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/health`)
      if (resp.ok) return true
    } catch {
      // not ready yet
    }
    await new Promise(r => setTimeout(r, 200))
  }
  return false
}

export async function startAgent(): Promise<{ port: number }> {
  if (agentProcess && agentPort) {
    try {
      const resp = await fetch(`http://127.0.0.1:${agentPort}/health`)
      if (resp.ok) return { port: agentPort }
    } catch {
      // Process died, restart
      agentProcess = null
      agentPort = null
    }
  }

  const port = await getRandomPort()
  const serverScript = path.join(app.getAppPath(), 'agent', 'server.py')

  agentProcess = spawn('python3', [serverScript, '--port', String(port), '--host', '127.0.0.1'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  agentProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`[agent] ${data.toString().trim()}`)
  })

  agentProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[agent:err] ${data.toString().trim()}`)
  })

  agentProcess.on('exit', (code, signal) => {
    console.log(`[agent] Process exited (code=${code}, signal=${signal})`)
    agentProcess = null
    agentPort = null

    if (restartAttempts < MAX_RESTART_ATTEMPTS) {
      restartAttempts++
      console.log(`[agent] Auto-restart attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS}`)
      startAgent()
    }
  })

  const healthy = await waitForHealth(port, 5000)
  if (!healthy) {
    agentProcess.kill()
    agentProcess = null
    throw new Error('Agent server failed to start within timeout')
  }

  restartAttempts = 0
  agentPort = port
  return { port }
}

export function stopAgent(): void {
  if (agentProcess) {
    agentProcess.kill()
    agentProcess = null
    agentPort = null
    restartAttempts = MAX_RESTART_ATTEMPTS // prevent auto-restart
  }
}

export function getAgentPort(): number | null {
  return agentPort
}
```

- [ ] **Step 2: Modify `src/main/ipc-handlers.ts`**

Add after the existing `registerIpcHandlers` function's server section (around line 284):

```typescript
  // Agent
  ipcMain.handle('agent:start', async () => {
    const { startAgent } = await import('./agent-manager')
    return startAgent()
  })

  ipcMain.handle('agent:stop', async () => {
    const { stopAgent } = await import('./agent-manager')
    return stopAgent()
  })

  ipcMain.handle('agent:get-providers', async () => {
    const { getAgentPort } = await import('./agent-manager')
    const port = getAgentPort()
    if (!port) throw new Error('Agent not running')
    const resp = await fetch(`http://127.0.0.1:${port}/providers`)
    return resp.json()
  })

  // For streaming chat, we use a different pattern via a dedicated handle
  // The renderer will call agent:chat-stream which returns port info
  // and then the renderer connects directly to the SSE endpoint
```

Wait — Electron's IPC doesn't support streaming natively. A better approach: expose the agent port to the renderer and let the renderer connect directly to the SSE endpoint. Let me redesign this slightly.

Actually, the cleanest pattern for Electron: the renderer receives the port and calls the Python service directly via fetch. This avoids complex IPC streaming.

- [ ] **Step 2 (revised): Modify `src/main/ipc-handlers.ts`**

Add after `// Live server` section (around line 283):

```typescript
  // Agent
  ipcMain.handle('agent:start', async () => {
    const { startAgent } = await import('./agent-manager')
    return startAgent()
  })

  ipcMain.handle('agent:stop', async () => {
    const { stopAgent } = await import('./agent-manager')
    return stopAgent()
  })

  ipcMain.handle('agent:get-port', async () => {
    const { getAgentPort, startAgent } = await import('./agent-manager')
    let port = getAgentPort()
    if (!port) {
      const result = await startAgent()
      port = result.port
    }
    return port
  })
```

- [ ] **Step 3: Modify `src/preload/index.ts`**

Add before the closing `}` of the `api` object (after the `saveUiState` entry):

```typescript
  // Agent
  startAgent: () => ipcRenderer.invoke('agent:start'),
  stopAgent: () => ipcRenderer.invoke('agent:stop'),
  getAgentPort: () => ipcRenderer.invoke('agent:get-port'),
```

- [ ] **Step 4: Modify `src/renderer/src/types/electron.d.ts`**

Add to the `electronAPI` interface (before the closing `}`):

```typescript
      startAgent: () => Promise<{ port: number }>
      stopAgent: () => Promise<void>
      getAgentPort: () => Promise<number>
```

- [ ] **Step 5: Verify TypeScript compilation**

Run: `cd /Users/wangyan/Desktop/note && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 6: Commit**

```bash
git add src/main/agent-manager.ts src/main/ipc-handlers.ts src/preload/index.ts src/renderer/src/types/electron.d.ts
git commit -m "feat(agent): add Electron agent manager, IPC handlers, and preload API"
```

---

### Task 10: AgentDialog UI Component

**Files:**
- Create: `src/renderer/src/components/AgentDialog.tsx`
- Create: `src/renderer/src/components/AgentDialog.css`
- Modify: `src/renderer/src/components/ServerStatus.tsx`
- Modify: `src/renderer/src/components/ServerStatus.css`

- [ ] **Step 1: Create `src/renderer/src/components/AgentDialog.css`**

```css
.agent-dialog-overlay {
  position: fixed;
  bottom: 36px;
  right: 12px;
  z-index: 1000;
}

.agent-dialog {
  width: 420px;
  height: 520px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  resize: both;
  overflow: hidden;
  min-width: 320px;
  min-height: 300px;
}

.agent-dialog.minimized {
  height: 40px;
  resize: none;
}

.agent-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  cursor: move;
  user-select: none;
}

.agent-dialog-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.agent-dialog-header-actions {
  display: flex;
  gap: 4px;
}

.agent-dialog-header-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 3px;
}

.agent-dialog-header-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.agent-dialog-context {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  font-size: 11px;
  color: var(--text-muted);
}

.agent-dialog-context select {
  font-size: 11px;
  padding: 2px 4px;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.agent-dialog-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agent-message {
  font-size: 13px;
  line-height: 1.5;
  padding: 8px 12px;
  border-radius: 6px;
  max-width: 90%;
  word-break: break-word;
}

.agent-message.user {
  align-self: flex-end;
  background: #1a73e8;
  color: white;
}

.agent-message.assistant {
  align-self: flex-start;
  background: var(--bg-secondary);
  color: var(--text-primary);
  white-space: pre-wrap;
}

.agent-message.tool-call {
  align-self: flex-start;
  background: var(--bg-secondary);
  border-left: 3px solid #f0ad4e;
  color: var(--text-muted);
  font-size: 12px;
  font-family: monospace;
}

.agent-message.tool-result {
  align-self: flex-start;
  background: var(--bg-secondary);
  border-left: 3px solid #5cb85c;
  color: var(--text-muted);
  font-size: 12px;
}

.agent-message.error {
  align-self: flex-start;
  background: #fff0f0;
  border-left: 3px solid #d93025;
  color: #d93025;
}

.doc-link {
  color: #61afef;
  cursor: pointer;
  text-decoration: underline;
}

.doc-link:hover {
  color: #98c379;
}

.agent-dialog-input {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.agent-dialog-input input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 13px;
  background: var(--bg-primary);
  color: var(--text-primary);
  outline: none;
}

.agent-dialog-input input:focus {
  border-color: #1a73e8;
}

.agent-dialog-input button {
  padding: 6px 14px;
  background: #1a73e8;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.agent-dialog-input button:hover {
  background: #1557b0;
}

.agent-dialog-input button:disabled {
  background: #555;
  cursor: not-allowed;
}

.agent-btn {
  padding: 2px 8px;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  background: var(--bg-primary);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 11px;
}

.agent-btn:hover {
  background: var(--bg-hover);
}

.agent-btn-active {
  background: #1a73e8;
  color: white;
  border-color: #1a73e8;
}
```

- [ ] **Step 2: Create `src/renderer/src/components/AgentDialog.tsx`**

```tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppContext } from '../contexts/AppContext'
import './AgentDialog.css'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'error'
  content: string
  toolName?: string
}

interface Provider {
  id: string
  name: string
  model: string
}

export function AgentDialog() {
  const { state, dispatch } = useAppContext()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [providers, setProviders] = useState<Provider[]>([])
  const [selectedProvider, setSelectedProvider] = useState('')
  const [port, setPort] = useState<number | null>(null)
  const [visible, setVisible] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Initialize: get port and load providers
  useEffect(() => {
    if (!visible) return
    window.electronAPI.getAgentPort().then(async (p) => {
      setPort(p)
      try {
        const resp = await fetch(`http://127.0.0.1:${p}/providers`)
        const data = await resp.json()
        setProviders(data.providers || [])
        if (data.providers?.length > 0 && !selectedProvider) {
          setSelectedProvider(data.providers[0].id)
        }
      } catch (e) {
        console.error('Failed to load providers:', e)
      }

      // Load history
      try {
        const resp = await fetch(`http://127.0.0.1:${p}/history`)
        const data = await resp.json()
        if (data.ok && data.messages.length > 0) {
          const historyMsgs: Message[] = data.messages.map((m: any) => ({
            id: Math.random().toString(36),
            role: m.role === 'tool' ? 'tool_result' : m.role,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            toolName: m.tool_name,
          }))
          setMessages(historyMsgs)
        }
      } catch (e) {
        // No history yet, that's fine
      }
    })
  }, [visible])

  const handleSend = useCallback(async () => {
    if (!input.trim() || !port || loading) return

    const userMsg: Message = {
      id: Math.random().toString(36),
      role: 'user',
      content: input.trim(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const response = await fetch(`http://127.0.0.1:${port}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg.content,
          provider_id: selectedProvider,
          workspace: state.workspacePath || '',
          repos: state.codeRepoPath ? [state.codeRepoPath] : [],
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let assistantText = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const dataStr = line.slice(6)
          try {
            const event = JSON.parse(dataStr)

            switch (event.type) {
              case 'text':
                assistantText += event.content
                // Update or create assistant bubble
                setMessages(prev => {
                  const last = prev[prev.length - 1]
                  if (last?.role === 'assistant') {
                    return [
                      ...prev.slice(0, -1),
                      { ...last, content: assistantText },
                    ]
                  }
                  return [
                    ...prev,
                    { id: Math.random().toString(36), role: 'assistant', content: assistantText },
                  ]
                })
                break

              case 'tool_call':
                setMessages(prev => [
                  ...prev,
                  {
                    id: Math.random().toString(36),
                    role: 'tool_call',
                    content: `${event.name}(${JSON.stringify(event.arguments)})`,
                    toolName: event.name,
                  },
                ])
                break

              case 'tool_result':
                setMessages(prev => [
                  ...prev,
                  {
                    id: Math.random().toString(36),
                    role: 'tool_result',
                    content: JSON.stringify(event.result, null, 2),
                    toolName: event.name,
                  },
                ])
                break

              case 'done':
                break

              case 'error':
                setMessages(prev => [
                  ...prev,
                  { id: Math.random().toString(36), role: 'error', content: event.content },
                ])
                break
            }
          } catch {
            // skip malformed events
          }
        }
      }
    } catch (e: any) {
      setMessages(prev => [
        ...prev,
        { id: Math.random().toString(36), role: 'error', content: `Error: ${e.message}` },
      ])
    } finally {
      setLoading(false)
    }
  }, [input, port, loading, selectedProvider, state.workspacePath, state.codeRepoPath])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClearHistory = async () => {
    if (!port) return
    try {
      await fetch(`http://127.0.0.1:${port}/history`, { method: 'DELETE' })
      setMessages([])
    } catch (e) {
      console.error('Failed to clear history:', e)
    }
  }

  const handleDocClick = (docPath: string) => {
    dispatch({ type: 'SELECT_NOTE', noteId: docPath })
  }

  const renderMessageContent = (msg: Message) => {
    if (msg.role !== 'assistant') return msg.content

    // Render doc paths as clickable links
    const parts = msg.content.split(/(docs\/[\w./-]+\.(?:md|mind\.json|derive\.json|net\.json))/g)
    return parts.map((part, i) => {
      if (part.match(/^docs\/[\w./-]+\.(?:md|mind\.json|derive\.json|net\.json)$/)) {
        return (
          <span key={i} className="doc-link" onClick={() => handleDocClick(part)}>
            {part}
          </span>
        )
      }
      return part
    })
  }

  if (!visible) return null

  return (
    <div className="agent-dialog-overlay">
      <div className={`agent-dialog${minimized ? ' minimized' : ''}`}>
        <div className="agent-dialog-header">
          <span className="agent-dialog-title">Code Agent</span>
          <div className="agent-dialog-header-actions">
            <button className="agent-dialog-header-btn" onClick={() => setMinimized(!minimized)}>
              {minimized ? '□' : '−'}
            </button>
            <button className="agent-dialog-header-btn" onClick={handleClearHistory} title="Clear history">
              Clear
            </button>
            <button className="agent-dialog-header-btn" onClick={() => setVisible(false)}>
              ×
            </button>
          </div>
        </div>
        {!minimized && (
          <>
            <div className="agent-dialog-context">
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.model})</option>
                ))}
              </select>
              <span>Repo: {state.codeRepoPath?.split('/').pop() || 'none'}</span>
            </div>
            <div className="agent-dialog-messages">
              {messages.map((msg) => (
                <div key={msg.id} className={`agent-message ${msg.role}`}>
                  {renderMessageContent(msg)}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="agent-dialog-input">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                disabled={loading}
              />
              <button onClick={handleSend} disabled={loading || !input.trim()}>
                {loading ? '...' : 'Send'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )

  // Return both the dialog visibility state setter and the JSX
  // We need to lift setVisible up somehow...
}

// Wrapper that manages visibility state
export function useAgentDialog() {
  const [visible, setVisible] = useState(false)
  return { visible, setVisible, AgentDialog }
}
```

Hmm, that pattern is awkward. Let me restructure — the visibility should be managed in the component that renders AgentDialog. Let me redesign:

- [ ] **Step 2 (revised): Create `src/renderer/src/components/AgentDialog.tsx`**

```tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppContext } from '../contexts/AppContext'
import './AgentDialog.css'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'error'
  content: string
  toolName?: string
}

interface Provider {
  id: string
  name: string
  model: string
}

interface AgentDialogProps {
  visible: boolean
  onClose: () => void
}

export function AgentDialog({ visible, onClose }: AgentDialogProps) {
  const { state, dispatch } = useAppContext()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [providers, setProviders] = useState<Provider[]>([])
  const [selectedProvider, setSelectedProvider] = useState('')
  const [port, setPort] = useState<number | null>(null)
  const [minimized, setMinimized] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!visible) return
    window.electronAPI.getAgentPort().then(async (p) => {
      setPort(p)
      try {
        const resp = await fetch(`http://127.0.0.1:${p}/providers`)
        const data = await resp.json()
        setProviders(data.providers || [])
        if (data.providers?.length > 0 && !selectedProvider) {
          setSelectedProvider(data.providers[0].id)
        }
      } catch (e) {
        console.error('Failed to load providers:', e)
      }

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
    })
  }, [visible])

  const handleSend = useCallback(async () => {
    if (!input.trim() || !port || loading) return

    const userMsg: Message = {
      id: Math.random().toString(36),
      role: 'user',
      content: input.trim(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const response = await fetch(`http://127.0.0.1:${port}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg.content,
          provider_id: selectedProvider,
          workspace: state.workspacePath || '',
          repos: state.codeRepoPath ? [state.codeRepoPath] : [],
        }),
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let assistantText = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))

            switch (event.type) {
              case 'text':
                assistantText += event.content
                setMessages(prev => {
                  const last = prev[prev.length - 1]
                  if (last?.role === 'assistant') {
                    return [...prev.slice(0, -1), { ...last, content: assistantText }]
                  }
                  return [...prev, {
                    id: Math.random().toString(36),
                    role: 'assistant',
                    content: assistantText,
                  }]
                })
                break

              case 'tool_call':
                setMessages(prev => [...prev, {
                  id: Math.random().toString(36),
                  role: 'tool_call',
                  content: `${event.name}(${JSON.stringify(event.arguments)})`,
                  toolName: event.name,
                }])
                break

              case 'tool_result':
                setMessages(prev => [...prev, {
                  id: Math.random().toString(36),
                  role: 'tool_result',
                  content: JSON.stringify(event.result, null, 2),
                  toolName: event.name,
                }])
                break
            }
          } catch {}
        }
      }
    } catch (e: any) {
      setMessages(prev => [...prev, {
        id: Math.random().toString(36),
        role: 'error',
        content: `Error: ${e.message}`,
      }])
    } finally {
      setLoading(false)
    }
  }, [input, port, loading, selectedProvider, state.workspacePath, state.codeRepoPath])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClearHistory = async () => {
    if (!port) return
    try {
      await fetch(`http://127.0.0.1:${port}/history`, { method: 'DELETE' })
      setMessages([])
    } catch {}
  }

  const handleDocClick = (docPath: string) => {
    dispatch({ type: 'SELECT_NOTE', noteId: docPath })
    onClose()
  }

  const renderContent = (msg: Message) => {
    if (msg.role !== 'assistant') return msg.content

    const parts = msg.content.split(/(docs\/[\w./-]+\.(?:md|mind\.json|derive\.json|net\.json))/g)
    return parts.map((part, i) => {
      if (part.match(/^docs\/[\w./-]+\.(?:md|mind\.json|derive\.json|net\.json)$/)) {
        return (
          <span key={i} className="doc-link" onClick={() => handleDocClick(part)}>
            {part}
          </span>
        )
      }
      return part
    })
  }

  if (!visible) return null

  return (
    <div className="agent-dialog-overlay">
      <div className={`agent-dialog${minimized ? ' minimized' : ''}`}>
        <div className="agent-dialog-header">
          <span className="agent-dialog-title">Code Agent</span>
          <div className="agent-dialog-header-actions">
            <button className="agent-dialog-header-btn" onClick={() => setMinimized(!minimized)}>
              {minimized ? '□' : '−'}
            </button>
            <button className="agent-dialog-header-btn" onClick={handleClearHistory} title="Clear">
              Clear
            </button>
            <button className="agent-dialog-header-btn" onClick={onClose}>×</button>
          </div>
        </div>
        {!minimized && (
          <>
            <div className="agent-dialog-context">
              <select value={selectedProvider} onChange={(e) => setSelectedProvider(e.target.value)}>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.model})</option>
                ))}
              </select>
              <span>Repo: {state.codeRepoPath?.split('/').pop() || 'none'}</span>
            </div>
            <div className="agent-dialog-messages">
              {messages.map((msg) => (
                <div key={msg.id} className={`agent-message ${msg.role}`}>
                  {renderContent(msg)}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="agent-dialog-input">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                disabled={loading}
              />
              <button onClick={handleSend} disabled={loading || !input.trim()}>
                {loading ? '...' : 'Send'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Modify `ServerStatus.tsx` to add Agent button**

Add import:
```tsx
import { useState } from 'react'
import { AgentDialog } from './AgentDialog'
```

Add state and dialog before the return:
```tsx
const [agentVisible, setAgentVisible] = useState(false)
```

Add the Agent button inside the `.server-status-bar` div, before the closing `</div>`. It should be after the existing children but before `</div>`:

```tsx
<button
  className={`agent-btn${agentVisible ? ' agent-btn-active' : ''}`}
  onClick={() => setAgentVisible(!agentVisible)}
>
  Agent
</button>
<AgentDialog visible={agentVisible} onClose={() => setAgentVisible(false)} />
```

Wait, the AgentDialog needs to be rendered at a level where it's not constrained by the status bar's CSS. Let me put it at the Layout level instead.

Actually, the cleanest approach: put the AgentDialog inside `Layout.tsx` (since it's a floating overlay), and just put the toggle button in `ServerStatus.tsx`. But that requires context or prop drilling.

Simpler approach: keep AgentDialog in ServerStatus but use a React Portal or just `position: fixed` (which it already has via `.agent-dialog-overlay`). Since the overlay is position:fixed, it escapes the status bar's layout. This works fine.

Let me update the edit instructions:

- [ ] **Step 3: Modify `src/renderer/src/components/ServerStatus.tsx`**

In the import section, add:
```tsx
import { useState } from 'react'
import { AgentDialog } from './AgentDialog'
```

Inside the component, add state before the return:
```tsx
const [agentVisible, setAgentVisible] = useState(false)
```

In the JSX, add after the server controls (the last `</>` or `</button>`), before the closing `</div>`:
```tsx
        <button
          className={`agent-btn${agentVisible ? ' agent-btn-active' : ''}`}
          onClick={() => setAgentVisible(!agentVisible)}
        >
          Agent
        </button>
      </div>
      <AgentDialog visible={agentVisible} onClose={() => setAgentVisible(false)} />
    </>
```
Wait, this changes the structure. Let me re-read ServerStatus.tsx...

The current structure:
```tsx
return (
  <div className="server-status-bar">
    {running ? ( <>...</> ) : ( <>...</> )}
  </div>
)
```

I need to add the Agent button inside the status bar and the dialog outside (since it's a fixed overlay). But the component returns a single root element. Let me wrap in a fragment or just add the dialog as a sibling inside the fragment.

Actually the simplest: add a fragment wrapper:
```tsx
return (
  <>
    <div className="server-status-bar">
      {running ? (...) : (...)}
      <button className={`agent-btn${agentVisible ? ' agent-btn-active' : ''}`}
        onClick={() => setAgentVisible(!agentVisible)}>
        Agent
      </button>
    </div>
    <AgentDialog visible={agentVisible} onClose={() => setAgentVisible(false)} />
  </>
)
```

- [ ] **Step 4: Add agent button CSS to `ServerStatus.css`**

Append:
```css
.agent-btn {
  padding: 2px 8px;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  background: var(--bg-primary);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 11px;
}

.agent-btn:hover {
  background: var(--bg-hover);
}

.agent-btn-active {
  background: #1a73e8;
  color: white;
  border-color: #1a73e8;
}
```

- [ ] **Step 5: Verify TypeScript compilation**

Run: `cd /Users/wangyan/Desktop/note && npx tsc --noEmit`
Expected: No new errors (or only pre-existing errors)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/AgentDialog.tsx src/renderer/src/components/AgentDialog.css src/renderer/src/components/ServerStatus.tsx src/renderer/src/components/ServerStatus.css
git commit -m "feat(agent): add AgentDialog floating chat UI with streaming and Agent button in status bar"
```

---

### Task 11: Integration Test & Manual Verification

**Files:**
- Create: `agent/tests/test_integration.py`

- [ ] **Step 1: Create integration test**

Create `agent/tests/test_integration.py`:

```python
"""
Integration test: full agent run against a fixture repo.

Requires a configured provider in ~/.code-note-studio/providers.json.
Set SKIP_INTEGRATION_TESTS=1 to skip if no LLM available.
"""
import os
import tempfile
import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch


# Skip by default in CI; run manually with a real provider
pytestmark = pytest.mark.skipif(
    os.environ.get("SKIP_INTEGRATION_TESTS") == "1",
    reason="Integration tests require a configured LLM provider",
)


@pytest.mark.asyncio
async def test_full_agent_run_with_fake_provider():
    """End-to-end test with a fake provider that simulates a full analysis flow."""
    from tools.registry import ToolRegistry
    from tools.file_ops import read_file, list_files, search_in_files
    from tools.mindmap_tools import register_mindmap_tools
    from tools.markdown_tools import register_markdown_tools
    from agent_loop import AgentLoop
    from memory import ConversationMemory

    # Setup
    registry = ToolRegistry()
    registry.register("read_file", "Read file", {
        "type": "object",
        "properties": {"path": {"type": "string"}},
        "required": ["path"],
    }, handler=read_file)
    registry.register("list_files", "List files", {
        "type": "object",
        "properties": {"directory": {"type": "string"}},
        "required": ["directory"],
    }, handler=list_files)
    registry.register("search_in_files", "Search files", {
        "type": "object",
        "properties": {"directory": {"type": "string"}, "query": {"type": "string"}},
        "required": ["directory", "query"],
    }, handler=search_in_files)
    register_mindmap_tools(registry)
    register_markdown_tools(registry)

    # Create fixture repo
    tmpdir = tempfile.mkdtemp()
    with open(os.path.join(tmpdir, "atmosphere.py"), "w") as f:
        f.write('''
def sky_atmosphere():
    """Render the sky atmosphere effect."""
    pass

def volumetric_clouds():
    """Volumetric cloud rendering."""
    pass
''')

    # Create workspace with docs dir
    wsdir = tempfile.mkdtemp()
    docs_dir = os.path.join(wsdir, "docs")
    os.makedirs(docs_dir, exist_ok=True)

    # Fake provider: search → read → create docs
    class ScriptedProvider:
        def __init__(self):
            self.step = 0

        async def chat_stream(self, messages, tools):
            if self.step == 0:
                # Search for atmosphere code
                yield {
                    "type": "tool_call",
                    "tool_call": {
                        "id": "call_1",
                        "function": {
                            "name": "search_in_files",
                            "arguments": {"directory": tmpdir, "query": "atmosphere"},
                        },
                    },
                }
                yield {"type": "done"}
            elif self.step == 1:
                # Read the file
                yield {
                    "type": "tool_call",
                    "tool_call": {
                        "id": "call_2",
                        "function": {
                            "name": "read_file",
                            "arguments": {"path": os.path.join(tmpdir, "atmosphere.py")},
                        },
                    },
                }
                yield {"type": "done"}
            elif self.step == 2:
                # Create documentation
                yield {
                    "type": "tool_call",
                    "tool_call": {
                        "id": "call_3",
                        "function": {
                            "name": "create_md",
                            "arguments": {"path": os.path.join(docs_dir, "atmosphere_analysis.md"), "title": "Sky Atmosphere Analysis"},
                        },
                    },
                }
                yield {"type": "done"}
            elif self.step == 3:
                # Final response
                yield {"type": "text", "content": "Analysis complete. Generated atmosphere_analysis.md."}
                yield {"type": "done"}
            self.step += 1

    memory = ConversationMemory(":memory:")
    agent = AgentLoop(
        provider=ScriptedProvider(),
        registry=registry,
        memory=memory,
        workspace=wsdir,
        repos=[tmpdir],
        output_dir=docs_dir,
        max_steps=10,
    )

    events = []
    async for event in agent.run("analyze sky atmosphere"):
        events.append(event)

    # Verify the full flow
    tool_calls = [e for e in events if e["type"] == "tool_call"]
    tool_results = [e for e in events if e["type"] == "tool_result"]
    text_events = [e for e in events if e["type"] == "text"]
    done_events = [e for e in events if e["type"] == "done"]

    assert len(tool_calls) == 3
    assert all(tr["result"]["ok"] is True for tr in tool_results)
    assert len(text_events) >= 1
    assert len(done_events) == 1

    # Verify the generated file exists
    md_path = os.path.join(docs_dir, "atmosphere_analysis.md")
    assert os.path.exists(md_path)
    with open(md_path) as f:
        content = f.read()
    assert "Sky Atmosphere" in content

    # Verify memory persisted
    saved = memory.get_messages()
    assert len(saved) >= 4  # system + user + tool_results + assistant
```

- [ ] **Step 2: Run integration test**

Run: `cd /Users/wangyan/Desktop/note && python3 -m pytest agent/tests/test_integration.py -v`
Expected: PASS (uses fake provider, no real LLM needed)

- [ ] **Step 3: Manual smoke test**

Run the agent server:
```bash
cd /Users/wangyan/Desktop/note && python3 agent/server.py --port 8765 &
sleep 2
curl http://127.0.0.1:8765/health
```
Expected: `{"status":"ok"}`

Stop server: `kill %1`

- [ ] **Step 4: Commit**

```bash
git add agent/tests/test_integration.py
git commit -m "test(agent): add integration test with fake provider"
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - Provider abstraction → Task 1
   - Tool registry → Task 2
   - File ops tools → Task 3
   - Context template → Task 4
   - Memory → Task 5
   - Skill wrappers → Task 6
   - ReAct loop → Task 7
   - FastAPI server → Task 8
   - Agent manager + IPC → Task 9
   - UI dialog + button → Task 10
   - Testing → spread across all tasks + Task 11

2. **Placeholder scan:** No TBD or TODO in any step. All code shown inline.

3. **Type consistency:**
   - `ToolRegistry.register(name, description, parameters, handler)` — consistent across Tasks 2, 6, 7, 8
   - `AgentLoop(provider, registry, memory, workspace, repos, output_dir, max_steps)` — consistent across Tasks 7, 8, 11
   - `Message { id, role, content, toolName }` — consistent across Task 10
   - `AgentEvent { type: 'text'|'tool_call'|'tool_result'|'done' }` — consistent across provider, agent loop, server, and UI
   - IPC channel names — `agent:start`, `agent:stop`, `agent:get-port` — match across Task 9 preload, handlers, and electron.d.ts
