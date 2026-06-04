"""
Integration test: full agent run against a fixture repo.

Requires a configured provider in ~/.code-note-studio/providers.json.
Set SKIP_INTEGRATION_TESTS=1 to skip if no LLM available.
"""
import os
import tempfile
import pytest
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

    # Setup registry with file ops and skill tools
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
        "properties": {
            "directory": {"type": "string"},
            "query": {"type": "string"},
        },
        "required": ["directory", "query"],
    }, handler=search_in_files)
    register_mindmap_tools(registry)
    register_markdown_tools(registry)

    # Create fixture repo with sample code
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

    # Scripted provider: search -> read -> create docs -> finish
    class ScriptedProvider:
        def __init__(self):
            self.step = 0

        async def chat_stream(self, messages, tools):
            if self.step == 0:
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
                yield {
                    "type": "tool_call",
                    "tool_call": {
                        "id": "call_3",
                        "function": {
                            "name": "create_md",
                            "arguments": {
                                "path": os.path.join(docs_dir, "atmosphere_analysis.md"),
                                "title": "Sky Atmosphere Analysis",
                            },
                        },
                    },
                }
                yield {"type": "done"}
            elif self.step == 3:
                yield {
                    "type": "text",
                    "content": "Analysis complete. Generated atmosphere_analysis.md.",
                }
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

    assert len(tool_calls) == 3, f"Expected 3 tool calls, got {len(tool_calls)}"
    assert all(tr["result"]["ok"] is True for tr in tool_results), \
        f"All tool results should be ok: {[tr['result'] for tr in tool_results]}"
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
