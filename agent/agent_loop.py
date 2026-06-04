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
