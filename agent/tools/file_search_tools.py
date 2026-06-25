from .registry import ToolRegistry
from .mindmap_tools import _run_skill_script


def register_file_search_tools(registry):
    registry.register(
        name="search_files",
        description=(
            "Search for files by name pattern and/or content query. "
            "Returns matching file paths with optional content match preview. "
            "Limited to max_results (default 100)."
        ),
        parameters={
            "type": "object",
            "properties": {
                "directory": {
                    "type": "string",
                    "description": "Directory to search in (absolute path)",
                },
                "name": {
                    "type": "string",
                    "description": "Filename glob pattern (e.g., '*.py', 'atm*')",
                },
                "content": {
                    "type": "string",
                    "description": "Content search query (case-insensitive, optional)",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Max results to return (default 100)",
                },
            },
            "required": ["directory"],
        },
        path_params=[{"param": "directory", "write": False, "required": True}],
        handler=lambda directory, name="*", content="", max_results=100: _run_skill_script(
            "file-search/scripts/search_files.py",
            directory,
            "--name", name,
            "--content", content,
            "--max-results", str(max_results),
        ),
    )
