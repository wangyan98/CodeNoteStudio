import json
import subprocess
import sys
from pathlib import Path
from .registry import ToolRegistry

SKILLS_DIR = Path(__file__).resolve().parents[2] / "skills"


def register_mindmap_tools(registry: ToolRegistry):
    registry.register(
        name="create_mindmap",
        description="Create a new .mind.json mind map file with a root node",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .mind.json file to create"},
            },
            "required": ["path"],
        },
        handler=lambda path: _run_skill_script("mind-map/scripts/create_mindmap.py", path),
    )

    registry.register(
        name="add_node",
        description="Add a child node to a mind map node",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .mind.json file"},
                "parent_id": {"type": "string", "description": "ID of the parent node"},
                "title": {"type": "string", "description": "Title of the new node"},
                "content": {"type": "string", "description": "Content of the new node (optional)"},
            },
            "required": ["path", "parent_id", "title"],
        },
        handler=lambda path, parent_id, title, content="": _run_skill_script(
            "mind-map/scripts/add_node.py", path, parent_id, "--title", title, "--content", content
        ),
    )

    registry.register(
        name="update_node",
        description="Update a mind map node's title, content, or code mapping",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .mind.json file"},
                "node_id": {"type": "string", "description": "ID of the node to update"},
                "title": {"type": "string", "description": "New title (optional)"},
                "content": {"type": "string", "description": "New content (optional)"},
            },
            "required": ["path", "node_id"],
        },
        handler=lambda path, node_id, title=None, content=None: _update_node(path, node_id, title, content),
    )

    registry.register(
        name="delete_node",
        description="Delete a node from a mind map (and its subtree)",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .mind.json file"},
                "node_id": {"type": "string", "description": "ID of the node to delete"},
            },
            "required": ["path", "node_id"],
        },
        handler=lambda path, node_id: _run_skill_script(
            "mind-map/scripts/delete_node.py", path, node_id
        ),
    )


def _update_node(path, node_id, title=None, content=None):
    args = ["mind-map/scripts/update_node.py", path, node_id]
    if title is not None:
        args.extend(["--title", title])
    if content is not None:
        args.extend(["--content", content])
    return _run_skill_script(*args)


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
