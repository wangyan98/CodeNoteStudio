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


import os


class TestAgentLoopWithGuard:
    """Integration tests: AgentLoop with PermissionGuard."""

    @pytest.fixture
    def guard(self):
        from tools.permissions import PermissionGuard
        return PermissionGuard(
            workspace=os.path.realpath("/tmp/ws-grd"),
            repos=[os.path.realpath("/tmp/repo-grd")],
            output_dir=os.path.realpath("/tmp/out-grd"),
            skills_dir=os.path.realpath("/tmp/sk-grd"),
        )

    @pytest.fixture
    def registry_with_guard(self, guard):
        from tools.registry import ToolRegistry
        reg = ToolRegistry()
        reg._guard = guard
        reg.register(
            name="echo",
            description="Echo back",
            parameters={
                "type": "object",
                "properties": {"message": {"type": "string"}},
                "required": ["message"],
            },
            handler=lambda message: {"ok": True, "echo": message},
            # no path_params — echo is not a file tool
        )
        reg.register(
            name="create_zone_reader",
            description="A fake create_* tool for testing guard",
            parameters={
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["name"],
            },
            handler=lambda name, content="": {"ok": True, "path": name, "content": content},
            path_params=[{"param": "name", "write": True, "required": True}],
        )
        return reg

    @pytest.fixture
    def memory(self):
        from memory import ConversationMemory
        return ConversationMemory(":memory:")

    @pytest.mark.asyncio
    async def test_create_tool_in_workspace_succeeds(self, registry_with_guard, memory):
        """create_* tool targeting workspace should succeed."""
        provider = FakeProvider([
            [
                {
                    "type": "tool_call",
                    "tool_call": {
                        "id": "call_1",
                        "function": {
                            "name": "create_zone_reader",
                            "arguments": {
                                "name": "notes.md",
                                "content": "hello",
                            },
                        },
                    },
                },
                {"type": "done"},
            ],
            [
                {"type": "text", "content": "Done."},
                {"type": "done"},
            ],
        ])

        agent = AgentLoop(
            provider=provider,
            registry=registry_with_guard,
            memory=memory,
            workspace="/tmp/ws-grd",
            repos=["/tmp/repo-grd"],
            output_dir="/tmp/out-grd",
            max_steps=5,
        )

        events = []
        async for event in agent.run("create a note"):
            events.append(event)

        tool_results = [e for e in events if e["type"] == "tool_result"]
        assert len(tool_results) == 1
        assert tool_results[0]["result"]["ok"] is True
        # path should be resolved to an absolute path inside workspace
        assert tool_results[0]["result"]["path"].startswith(os.path.realpath("/tmp/ws-grd"))

    @pytest.mark.asyncio
    async def test_create_tool_outside_workspace_denied(self, registry_with_guard, memory):
        """create_* tool with ../ escape should be denied by AgentLoop guard."""
        provider = FakeProvider([
            [
                {
                    "type": "tool_call",
                    "tool_call": {
                        "id": "call_1",
                        "function": {
                            "name": "create_zone_reader",
                            "arguments": {
                                "name": "../../../etc/malicious.sh",
                                "content": "bad",
                            },
                        },
                    },
                },
                {"type": "done"},
            ],
            [
                {"type": "text", "content": "OK."},
                {"type": "done"},
            ],
        ])

        agent = AgentLoop(
            provider=provider,
            registry=registry_with_guard,
            memory=memory,
            workspace="/tmp/ws-grd",
            repos=["/tmp/repo-grd"],
            output_dir="/tmp/out-grd",
            max_steps=5,
        )

        events = []
        async for event in agent.run("create a note outside"):
            events.append(event)

        tool_results = [e for e in events if e["type"] == "tool_result"]
        # One tool_result event for the denied call
        denied = [tr for tr in tool_results if tr["result"].get("ok") is False]
        assert len(denied) == 1
        assert "Permission denied" in denied[0]["result"]["error"]

    @pytest.mark.asyncio
    async def test_no_guard_skips_checks(self, registry_with_guard, memory):
        """When registry._guard is None, create_* tools work unvalidated."""
        registry_with_guard._guard = None

        provider = FakeProvider([
            [
                {
                    "type": "tool_call",
                    "tool_call": {
                        "id": "call_1",
                        "function": {
                            "name": "create_zone_reader",
                            "arguments": {
                                "name": "../../../etc/somefile",
                                "content": "test",
                            },
                        },
                    },
                },
                {"type": "done"},
            ],
            [
                {"type": "text", "content": "Done."},
                {"type": "done"},
            ],
        ])

        agent = AgentLoop(
            provider=provider,
            registry=registry_with_guard,
            memory=memory,
            workspace="/tmp/ws-grd",
            repos=["/tmp/repo-grd"],
            output_dir="/tmp/out-grd",
            max_steps=5,
        )

        events = []
        async for event in agent.run("create anything"):
            events.append(event)

        tool_results = [e for e in events if e["type"] == "tool_result"]
        assert len(tool_results) == 1
        # Without guard, the tool executes (path will be resolved via realpath
        # but not checked — the handler just echoes it back)
        assert tool_results[0]["result"]["ok"] is True
