import pytest
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

    @pytest.fixture
    def memory(self):
        from memory import ConversationMemory
        return ConversationMemory(":memory:")

    @pytest.mark.asyncio
    async def test_simple_text_response(self, registry_with_tools, memory):
        """Agent responds with text only, no tool calls."""
        provider = FakeProvider([
            [{"type": "text", "content": "Hello!"}, {"type": "done"}],
        ])

        agent = AgentLoop(
            provider=provider,
            registry=registry_with_tools,
            memory=memory,
            workspace="/ws",
            repos=["/repo"],
            output_dir="/ws/docs",
            max_steps=5,
        )

        events = []
        async for event in agent.run("say hello"):
            events.append(event)

        texts = [e for e in events if e["type"] == "text"]
        assert len(texts) > 0
        assert texts[0]["content"] == "Hello!"
        assert events[-1]["type"] == "done"

    @pytest.mark.asyncio
    async def test_tool_call_and_continue(self, registry_with_tools, memory):
        """Agent calls a tool, gets result, then responds."""
        provider = FakeProvider([
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
            [
                {"type": "text", "content": "I echoed your message."},
                {"type": "done"},
            ],
        ])

        agent = AgentLoop(
            provider=provider,
            registry=registry_with_tools,
            memory=memory,
            workspace="/ws",
            repos=["/repo"],
            output_dir="/ws/docs",
            max_steps=5,
        )

        events = []
        async for event in agent.run("echo test"):
            events.append(event)

        tool_calls = [e for e in events if e["type"] == "tool_call"]
        tool_results = [e for e in events if e["type"] == "tool_result"]
        assert len(tool_calls) == 1
        assert len(tool_results) == 1
        assert tool_results[0]["result"]["ok"] is True
        assert tool_results[0]["result"]["echo"] == "test message"

    @pytest.mark.asyncio
    async def test_max_steps_limit(self, registry_with_tools, memory):
        """Agent stops after max_steps even if LLM keeps calling tools."""
        provider = FakeProvider([
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
            memory=memory,
            workspace="/ws",
            repos=["/repo"],
            output_dir="/ws/docs",
            max_steps=2,
        )

        events = []
        async for event in agent.run("loop test"):
            events.append(event)

        done_events = [e for e in events if e["type"] == "done"]
        assert len(done_events) == 1
        tool_calls = [e for e in events if e["type"] == "tool_call"]
        assert len(tool_calls) <= 2


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
