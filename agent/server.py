import json
import os
import sys
from pathlib import Path

# Ensure agent/ is on path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from memory import ConversationMemory
from tools.registry import ToolRegistry
from tools.file_ops import read_file, list_files, search_in_files
from tools.mindmap_tools import register_mindmap_tools
from tools.derive_tools import register_derive_tools
from tools.network_tools import register_network_tools
from tools.markdown_tools import register_markdown_tools
from tools.file_search_tools import register_file_search_tools
from agent_loop import AgentLoop
from provider.openai_compat import OpenAICompatProvider


def load_providers() -> list[dict]:
    config_path = os.path.expanduser("~/.code-note-studio/providers.json")
    if os.path.exists(config_path):
        with open(config_path) as f:
            return json.load(f)
    return []


def build_registry() -> ToolRegistry:
    registry = ToolRegistry()

    # File ops
    registry.register(
        name="read_file",
        description="Read a file from disk. Returns up to max_lines (default 500). Use start_line/end_line to read specific ranges.",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Absolute path to the file"},
                "start_line": {"type": "integer", "description": "Start line (1-based, default 1)"},
                "end_line": {"type": "integer", "description": "End line (inclusive, default auto-capped at start_line+max_lines)"},
                "max_lines": {"type": "integer", "description": "Max lines to return (default 500)"},
            },
            "required": ["path"],
        },
        handler=read_file,
    )

    registry.register(
        name="list_files",
        description="List files in a directory recursively. Limited to max_results (default 200).",
        parameters={
            "type": "object",
            "properties": {
                "directory": {"type": "string", "description": "Directory path to list"},
                "pattern": {"type": "string", "description": "Filename glob pattern (default *)"},
                "max_results": {"type": "integer", "description": "Max entries to return (default 200)"},
            },
            "required": ["directory"],
        },
        handler=list_files,
    )

    registry.register(
        name="search_in_files",
        description="Search for a string pattern in files under a directory (case-insensitive). Limited to max_results (default 50).",
        parameters={
            "type": "object",
            "properties": {
                "directory": {"type": "string", "description": "Directory to search in"},
                "query": {"type": "string", "description": "Search query string"},
                "file_pattern": {"type": "string", "description": "File glob pattern (default *.py)"},
                "max_results": {"type": "integer", "description": "Max matches to return (default 50)"},
            },
            "required": ["directory", "query"],
        },
        handler=search_in_files,
    )

    # Skill tools
    register_mindmap_tools(registry)
    register_derive_tools(registry)
    register_network_tools(registry)
    register_markdown_tools(registry)
    register_file_search_tools(registry)

    return registry


def create_app(agent_factory=None, memory=None):
    app = FastAPI(title="Code Note Agent")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    registry = build_registry()
    providers = load_providers()

    if memory is None:
        memory = ConversationMemory(":memory:")

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/providers")
    async def get_providers():
        return {
            "ok": True,
            "providers": [
                {"id": p["id"], "name": p["name"], "model": p["model"]}
                for p in providers
            ],
        }

    @app.post("/chat")
    async def chat(request: Request):
        body = await request.json()
        message = body["message"]
        provider_id = body.get("provider_id")
        workspace = body.get("workspace", "") or os.getcwd()
        repos = body.get("repos", [])
        default_output = f"{workspace}/docs" if workspace else f"{os.getcwd()}/docs"
        output_dir = body.get("output_dir", default_output)

        # Resolve provider
        provider_config = next(
            (p for p in providers if p["id"] == provider_id),
            providers[0] if providers else None,
        )
        if not provider_config:
            async def error_stream():
                yield f"data: {json.dumps({'type': 'error', 'content': 'No provider configured'})}\n\n"
            return StreamingResponse(error_stream(), media_type="text/event-stream")

        api_key = provider_config.get("api_key") or os.environ.get("MODEL_API_KEY", "")
        provider = OpenAICompatProvider(
            base_url=provider_config["base_url"],
            api_key=api_key,
            model=provider_config["model"],
        )

        if agent_factory:
            agent = agent_factory(provider, workspace, repos, output_dir)
        else:
            agent = AgentLoop(
                provider=provider,
                registry=registry,
                memory=memory,
                workspace=workspace,
                repos=repos,
                output_dir=output_dir,
            )

        async def event_stream():
            async for event in agent.run(message):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    @app.get("/history")
    async def get_history():
        messages = memory.get_messages()
        user_visible = [m for m in messages if m["role"] != "system"]
        return {"ok": True, "messages": user_visible}

    @app.delete("/history")
    async def clear_history():
        memory.clear()
        return {"ok": True}

    return app


app = create_app()


def main():
    import argparse
    import uvicorn

    parser = argparse.ArgumentParser(description="Code Note Agent Server")
    parser.add_argument("--port", type=int, default=8765, help="Port to listen on")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host to bind to")
    args = parser.parse_args()

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
