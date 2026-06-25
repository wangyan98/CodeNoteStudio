import asyncio
from typing import Any, Callable


class ToolRegistry:
    def __init__(self):
        self.tools: dict[str, dict] = {}
        self._host_loop = None
        self._guard = None

    def set_host_loop(self, loop):
        """Store the current host AgentLoop (set before each run)."""
        self._host_loop = loop

    def register(
        self,
        name: str,
        description: str,
        parameters: dict,
        handler: Callable,
        skill: str | None = None,
        path_params: list[dict] | None = None,
    ):
        self.tools[name] = {
            "name": name,
            "description": description,
            "parameters": parameters,
            "handler": handler,
            "skill": skill,
            "path_params": path_params,
        }

    def get_openai_schemas(self) -> list[dict]:
        return [
            {
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t["description"],
                    "parameters": t["parameters"],
                },
            }
            for t in self.tools.values()
        ]

    async def execute(self, name: str, arguments: dict) -> dict:
        if name not in self.tools:
            raise KeyError(f"Tool '{name}' not registered")

        tool_info = self.tools[name]
        path_params = tool_info.get("path_params")

        # Pre-flight permission check
        if self._guard and path_params:
            for pp in path_params:
                value = arguments.get(pp["param"])
                if value is None:
                    # Skip guard check. If required=True, the handler will
                    # report the missing argument — that's the right UX
                    # (missing arg error, not a permission error).
                    continue
                result = self._guard.check(
                    value, needs_write=pp.get("write", False)
                )
                if not result["ok"]:
                    # Attach a system note for the caller to inject AFTER the
                    # tool result message. This keeps the tool message directly
                    # after assistant(tool_calls), which DeepSeek's API requires.
                    result["_system_note"] = f"[Permission denied] {result['error']}"
                    return result

        handler = tool_info["handler"]
        result = handler(**arguments)
        if asyncio.iscoroutine(result):
            result = await result
        return result
