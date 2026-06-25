import json, os
from datetime import datetime, timezone
from typing import AsyncIterator
from provider.base import BaseProvider
from tools.registry import ToolRegistry
from context import build_system_message, load_full_skill, SKILLS_DIR
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
        max_steps: int = 80,
        active_file: str = "",
        provider_id: str = "",
        conversation_id: str | None = None,
        is_subagent: bool = False,
        parent_conv_id: str | None = None,
    ):
        self.provider = provider
        self.registry = registry
        self.memory = memory
        self.workspace = workspace
        self.repos = repos
        self.output_dir = output_dir
        self.max_steps = max_steps
        self.active_file = active_file
        self.provider_id = provider_id
        self.is_subagent = is_subagent
        self.parent_conv_id = parent_conv_id
        self.conversation_id = conversation_id or memory.get_or_create_conversation()
        self._activated_skills: set[str] = set()

    async def run(self, user_message: str) -> AsyncIterator[dict]:
        try:
            existing = self.memory.get_messages(conversation_id=self.conversation_id)
            is_pending_first_turn = len(existing) == 0
            if is_pending_first_turn:
                if not self.is_subagent:
                    tools_summary = [
                        {"name": t["name"], "description": t["description"]}
                        for t in self.registry.tools.values()
                    ]
                    system_msg = build_system_message(
                        workspace=self.workspace,
                        repos=self.repos,
                        output_dir=self.output_dir,
                        tools_summary=tools_summary,
                        active_file=self.active_file,
                    )
                    self.memory.add_message("system", system_msg, conversation_id=self.conversation_id)
                    self.memory.set_current_workspace({
                        "workspace": self.workspace,
                        "repos": self.repos,
                        "active_file": self.active_file,
                        "provider_id": self.provider_id,
                        "output_dir": self.output_dir,
                        "frozen_at": datetime.now(timezone.utc).isoformat(),
                    }, conversation_id=self.conversation_id)

            self.memory.add_message("user", user_message, conversation_id=self.conversation_id)
            yield {"type": "user", "content": user_message}

            async for event in self._run_loop():
                yield event

        except Exception as e:
            yield {
                "type": "error",
                "content": f"Agent error: {e}",
            }
            yield {"type": "done"}

    async def _run_loop(self) -> AsyncIterator[dict]:
        """Internal: run the tool loop from the existing conversation history.

        Like run() but does NOT add a user message — the messages are already
        in the DB (used for sub-agent replay). Yields the same events as run().
        """
        try:
            yield {"type": "resume", "content": "(resuming)"}

            tools = self.registry.get_openai_schemas()
            step = 0

            while step < self.max_steps:
                step += 1
                messages = self.memory.get_openai_messages(conversation_id=self.conversation_id)

                tool_calls_in_turn: list[dict] = []
                assistant_text_parts: list[str] = []

                try:
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
                except Exception as e:
                    yield {
                        "type": "error",
                        "content": f"LLM call failed: {e}",
                    }
                    yield {"type": "done"}
                    return

                if tool_calls_in_turn:
                    text = "".join(assistant_text_parts) if assistant_text_parts else ""
                    self.memory.add_message(
                        "assistant",
                        text,
                        tool_calls=[
                            {
                                "id": tc["id"],
                                "type": "function",
                                "function": {
                                    "name": tc["function"]["name"],
                                    "arguments": json.dumps(tc["function"]["arguments"], ensure_ascii=False),
                                },
                            }
                            for tc in tool_calls_in_turn
                        ],
                        conversation_id=self.conversation_id,
                    )

                    for tc in tool_calls_in_turn:
                        tool_name = tc["function"]["name"]
                        args = tc["function"]["arguments"]
                        if tool_name.startswith("create_") and "name" in args and self.workspace:
                            resolved = os.path.realpath(os.path.join(self.workspace, args["name"]))
                            # Secondary check: resolved path must be in a writable zone
                            if self.registry._guard:
                                check = self.registry._guard.check(resolved, needs_write=True)
                                if not check["ok"]:
                                    result_str = json.dumps(check, ensure_ascii=False)
                                    self.memory.add_message(
                                        "system",
                                        f"[Permission denied] {check['error']}",
                                        conversation_id=self.conversation_id,
                                    )
                                    self.memory.add_message(
                                        "tool",
                                        result_str,
                                        tool_name=tc["id"],
                                        conversation_id=self.conversation_id,
                                    )
                                    yield {
                                        "type": "tool_result",
                                        "tool_call_id": tc["id"],
                                        "name": tool_name,
                                        "result": check,
                                    }
                                    continue  # skip this tool_call, process the next one

                            args = {**args, "name": resolved}
                        try:
                            result = await self.registry.execute(tool_name, args)
                        except Exception as e:
                            result = {"ok": False, "error": str(e)}

                        result_str = json.dumps(result, ensure_ascii=False)
                        MAX_TOOL_RESULT_CHARS = 8000
                        if len(result_str) > MAX_TOOL_RESULT_CHARS:
                            truncated = {"ok": result.get("ok"), "truncated": True}
                            if "count" in result:
                                truncated["count"] = result["count"]
                            if "total_lines" in result:
                                truncated["total_lines"] = result["total_lines"]
                            if "hint" in result:
                                truncated["hint"] = result["hint"]
                            truncated["preview"] = result_str[:MAX_TOOL_RESULT_CHARS]
                            truncated["error"] = result.get("error", "")[:200] if not result.get("ok") else ""
                            result_str = json.dumps(truncated, ensure_ascii=False)
                        self.memory.add_message("tool", result_str, tool_name=tc["id"], conversation_id=self.conversation_id)
                        yield {
                            "type": "tool_result",
                            "tool_call_id": tc["id"],
                            "name": tool_name,
                            "result": result,
                        }

                    self._activate_skills(tool_calls_in_turn)
                    continue

                full_text = "".join(assistant_text_parts)
                if full_text:
                    self.memory.add_message("assistant", full_text, conversation_id=self.conversation_id)
                yield {"type": "done"}
                return

            yield {"type": "text", "content": "\n\n[Max steps reached. Stopping.]"}
            yield {"type": "done"}

        except Exception as e:
            yield {
                "type": "error",
                "content": f"Agent error: {e}",
            }
            yield {"type": "done"}

    def _activate_skills(self, tool_calls_in_turn: list[dict]) -> None:
        """Inject full SKILL.md content for any newly-activated skills."""
        for tc in tool_calls_in_turn:
            tool_name = tc["function"]["name"]
            tool_info = self.registry.tools.get(tool_name)
            if not tool_info:
                continue
            skill_name = tool_info.get("skill")
            if not skill_name or skill_name in self._activated_skills:
                continue
            full_skill = load_full_skill(skill_name, SKILLS_DIR)
            if full_skill:
                self._activated_skills.add(skill_name)
                self.memory.add_message(
                    "system",
                    f"[Activated skill: {skill_name}]\n\n{full_skill}",
                    conversation_id=self.conversation_id,
                )
