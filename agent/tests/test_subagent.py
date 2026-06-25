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
        import uuid as _uuid
        from agent_loop import AgentLoop
        from tools.subagent_tool import register_subagent_tools, _build_subagent, _run_one

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
        main = AgentLoop(
            provider=FakeProvider(), registry=registry, memory=memory,
            workspace="/ws", repos=["/repo"], output_dir="/ws/docs",
            max_steps=10, conversation_id=main_conv_id,
        )
        registry.set_host_loop(main)

        # Instead of calling run() (which would add another user message),
        # directly invoke the handler to test sub-agent flow.
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
        from context import build_subagent_system_message

        main_conv_id = memory.get_or_create_conversation()
        cid = str(uuid.uuid4())
        memory.create_conversation(cid, parent_id=main_conv_id)

        # Write a tagged system — simulating a sub-agent context.
        tools_summary = [{"name": "echo", "description": "echo"}]
        sys_msg = build_subagent_system_message("/ws", [], "/ws/docs", tools_summary)
        memory.add_message("system", sys_msg, conversation_id=cid)

        class SubHost:
            is_subagent = True
            conv_id = cid

        host = SubHost()
        host.memory = memory  # Attach after construction to avoid scoping issue.
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
