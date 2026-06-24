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
