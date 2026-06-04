from typing import Callable


class ToolRegistry:
    def __init__(self):
        self.tools: dict[str, dict] = {}

    def register(
        self,
        name: str,
        description: str,
        parameters: dict,
        handler: Callable,
    ):
        self.tools[name] = {
            "name": name,
            "description": description,
            "parameters": parameters,
            "handler": handler,
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

    def execute(self, name: str, arguments: dict) -> dict:
        if name not in self.tools:
            raise KeyError(f"Tool '{name}' not registered")
        handler = self.tools[name]["handler"]
        return handler(**arguments)
