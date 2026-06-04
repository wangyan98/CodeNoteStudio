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
