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
            conversation_id = "c1"
            memory = None
        host = Host()

        result = _check_gates(host, host.memory, host.conversation_id)
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
        """Gate (2): main agent history has no <subagent_root/> -> passes."""
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
