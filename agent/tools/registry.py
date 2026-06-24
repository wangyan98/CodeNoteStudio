import asyncio
from typing import Any, Callable


class ToolRegistry:
    def __init__(self):
        self.tools: dict[str, dict] = {}
        self._host_loop = None

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
    ):
        self.tools[name] = {
            "name": name,
            "description": description,
            "parameters": parameters,
            "handler": handler,
            "skill": skill,
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
        handler = self.tools[name]["handler"]
        result = handler(**arguments)
        if asyncio.iscoroutine(result):
            result = await result
        return result
