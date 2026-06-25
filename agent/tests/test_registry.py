import pytest
import asyncio
from tools.registry import ToolRegistry


class FakeHostLoop:
    is_subagent = False
    conv_id = "main-conv"
    memory = None


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


@pytest.mark.asyncio
async def test_execute_tool():
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

    result = await registry.execute("add", {"a": 3, "b": 4})
    assert result["ok"] is True
    assert result["sum"] == 7


@pytest.mark.asyncio
async def test_execute_unknown_tool_raises():
    registry = ToolRegistry()
    with pytest.raises(KeyError, match="unknown_tool"):
        await registry.execute("unknown_tool", {})


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


import os


class FakeMemory:
    """Minimal fake for system message injection."""
    def __init__(self):
        self.messages = []

    def add_message(self, role, content, conversation_id=None):
        self.messages.append({"role": role, "content": content})


class FakeHostLoopWithMemory:
    is_subagent = False
    conversation_id = "test-conv"

    def __init__(self):
        self.memory = FakeMemory()


class TestRegistryWithGuard:
    """Tests for ToolRegistry.execute() with PermissionGuard integration."""

    @pytest.fixture
    def guard(self):
        from tools.permissions import PermissionGuard
        return PermissionGuard(
            workspace=os.path.realpath("/tmp/test-ws"),
            repos=[os.path.realpath("/tmp/test-repo")],
            output_dir=os.path.realpath("/tmp/test-out"),
            skills_dir=os.path.realpath("/tmp/test-skills"),
        )

    @pytest.fixture
    def host(self):
        return FakeHostLoopWithMemory()

    @pytest.fixture
    def registry(self, guard, host):
        from tools.registry import ToolRegistry
        reg = ToolRegistry()
        reg._guard = guard
        reg._host_loop = host
        return reg

    @pytest.mark.asyncio
    async def test_read_allowed_in_repo(self, registry):
        """Reading a file inside a repo should succeed."""
        registry.register(
            name="safe_read",
            description="Read file",
            parameters={
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
            handler=lambda path: {"ok": True, "content": "data"},
            path_params=[{"param": "path", "write": False, "required": True}],
        )
        result = await registry.execute(
            "safe_read", {"path": "/tmp/test-repo/src/main.py"}
        )
        assert result["ok"] is True

    @pytest.mark.asyncio
    async def test_write_denied_in_repo(self, registry):
        """Writing a file inside a repo should be denied."""
        registry.register(
            name="bad_write",
            description="Write file",
            parameters={
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
            handler=lambda path: {"ok": True},
            path_params=[{"param": "path", "write": True, "required": True}],
        )
        result = await registry.execute(
            "bad_write", {"path": "/tmp/test-repo/src/main.py"}
        )
        assert result["ok"] is False
        assert "read-only repo" in result["error"]

    @pytest.mark.asyncio
    async def test_denied_injects_system_message(self, registry, host):
        """Permission denial should inject a system message via host_loop."""
        registry.register(
            name="outside_read",
            description="Read file",
            parameters={
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
            handler=lambda path: {"ok": True},
            path_params=[{"param": "path", "write": False, "required": True}],
        )
        await registry.execute("outside_read", {"path": "/etc/passwd"})
        assert len(host.memory.messages) == 1
        assert host.memory.messages[0]["role"] == "system"
        assert "Permission denied" in host.memory.messages[0]["content"]

    @pytest.mark.asyncio
    async def test_no_path_params_skips_guard(self, registry):
        """Tools without path_params should not be checked."""
        registry.register(
            name="no_path_tool",
            description="No path params",
            parameters={
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
            },
            handler=lambda query: {"ok": True, "query": query},
            # no path_params
        )
        result = await registry.execute("no_path_tool", {"query": "hello"})
        assert result["ok"] is True

    @pytest.mark.asyncio
    async def test_no_guard_passes_through(self, registry):
        """When _guard is None, execute() behaves like before."""
        registry._guard = None
        registry.register(
            name="unchecked",
            description="Any path",
            parameters={
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
            handler=lambda path: {"ok": True, "path": path},
            path_params=[{"param": "path", "write": True, "required": True}],
        )
        result = await registry.execute("unchecked", {"path": "/etc/passwd"})
        assert result["ok"] is True  # no guard → no check

    @pytest.mark.asyncio
    async def test_missing_required_path_skips_guard(self, registry):
        """When a required path param is None, skip guard → handler reports error."""
        registry.register(
            name="needs_path",
            description="Needs a path",
            parameters={
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
            handler=lambda path=None: (
                {"ok": True} if path else {"ok": False, "error": "path is required"}
            ),
            path_params=[{"param": "path", "write": False, "required": True}],
        )
        # Call without the 'path' argument → value is None → guard skipped
        # handler gets None and returns its own error
        result = await registry.execute("needs_path", {})
        assert result["ok"] is False
        assert result["error"] == "path is required"

    @pytest.mark.asyncio
    async def test_optional_path_param_none_skipped(self, registry):
        """Optional path params with value None are skipped."""
        registry.register(
            name="optional_path",
            description="Has optional path",
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "msg": {"type": "string"},
                },
                "required": ["msg"],
            },
            handler=lambda msg, path=None: {"ok": True, "msg": msg},
            path_params=[{"param": "path", "write": False, "required": False}],
        )
        result = await registry.execute("optional_path", {"msg": "hello"})
        assert result["ok"] is True

    @pytest.mark.asyncio
    async def test_write_allowed_in_workspace(self, registry):
        """Writing a file inside workspace should succeed."""
        registry.register(
            name="create_in_ws",
            description="Create file in workspace",
            parameters={
                "type": "object",
                "properties": {"name": {"type": "string"}},
                "required": ["name"],
            },
            handler=lambda name: {"ok": True, "path": name},
            path_params=[{"param": "name", "write": True, "required": True}],
        )
        result = await registry.execute(
            "create_in_ws", {"name": "/tmp/test-ws/notes/doc.md"}
        )
        assert result["ok"] is True

    @pytest.mark.asyncio
    async def test_write_allowed_in_output(self, registry):
        """Writing a file inside output_dir should succeed."""
        registry.register(
            name="create_in_out",
            description="Create file in output",
            parameters={
                "type": "object",
                "properties": {"name": {"type": "string"}},
                "required": ["name"],
            },
            handler=lambda name: {"ok": True, "path": name},
            path_params=[{"param": "name", "write": True, "required": True}],
        )
        result = await registry.execute(
            "create_in_out", {"name": "/tmp/test-out/report.md"}
        )
        assert result["ok"] is True
