from pathlib import Path
import json
import subprocess
import sys

SKILLS_DIR = Path(__file__).resolve().parents[2] / "skills"


def _run_skill_script(*args: str) -> dict:
    script_path = SKILLS_DIR / args[0]
    cmd = [sys.executable, str(script_path)] + list(args[1:])
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        return {"ok": False, "error": result.stderr.strip() or result.stdout.strip()}
    try:
        return json.loads(result.stdout.strip())
    except json.JSONDecodeError:
        return {"ok": False, "error": result.stdout.strip()}


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
        handler=lambda directory, name="*", content="", max_results=100: _run_skill_script(
            "file-search/scripts/search_files.py",
            directory,
            "--name", name,
            "--content", content,
            "--max-results", str(max_results),
        ),
    )
