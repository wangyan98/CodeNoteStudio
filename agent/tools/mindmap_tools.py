import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from .registry import ToolRegistry

SKILLS_DIR = Path(__file__).resolve().parents[2] / "skills"

SANDBOX_PROFILE_TEMPLATE = Path(__file__).resolve().parents[1] / "sandbox" / "profile.sb"

_guard = None  # type: ignore  # PermissionGuard | None


def set_skill_guard(guard) -> None:
    """Set the global PermissionGuard for sandboxed skill execution.

    Called once during server startup. When None (default), skill scripts
    execute directly without sandboxing (backward compatible for tests).
    """
    global _guard
    _guard = guard


def _build_sandbox_profile(workspace: str, repos: list[str], output_dir: str) -> str:
    """Fill the sandbox template with concrete paths for the current guard config."""
    template = SANDBOX_PROFILE_TEMPLATE.read_text()
    repos_rules = "\n".join(
        f'(allow file-read* (subpath "{r}"))' for r in repos
    )
    return (template
        .replace("<PARAM_SKILLS_DIR>", str(SKILLS_DIR))
        .replace("<PARAM_PYTHON_HOME>", str(Path(sys.executable).parent.parent))
        .replace("<PARAM_WORKSPACE>", workspace)
        .replace("<PARAM_OUTPUT_DIR>", output_dir)
        .replace("<PARAM_REPOS_RULES>", repos_rules))


def register_mindmap_tools(registry: ToolRegistry):
    registry.register(
        name="create_mindmap",
        description="Create a new .mind.json mind map file with a root node",
        skill="mind-map",
        parameters={
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Name for the file (without extension, e.g. 'concepts' or 'subdir/concepts')"},
            },
            "required": ["name"],
        },
        path_params=[{"param": "name", "write": True, "required": True}],
        handler=lambda name: _run_skill_script("mind-map/scripts/create_mindmap.py", name),
    )

    registry.register(
        name="add_node",
        description="Add a child node to a mind map node. IMPORTANT: If this node represents specific code (a function, class, or file location), call set_code_mapping immediately after with the returned node id.",
        skill="mind-map",
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
        path_params=[{"param": "path", "write": True, "required": True}],
        handler=lambda path, parent_id, title, content="": _run_skill_script(
            "mind-map/scripts/add_node.py", path, parent_id, "--title", title, "--content", content
        ),
    )

    registry.register(
        name="update_node",
        description="Update a mind map node's title, content, or code mapping",
        skill="mind-map",
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
        path_params=[{"param": "path", "write": True, "required": True}],
        handler=lambda path, node_id, title=None, content=None: _update_node(path, node_id, title, content),
    )

    registry.register(
        name="delete_node",
        description="Delete a node from a mind map (and its subtree)",
        skill="mind-map",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .mind.json file"},
                "node_id": {"type": "string", "description": "ID of the node to delete"},
            },
            "required": ["path", "node_id"],
        },
        path_params=[{"param": "path", "write": True, "required": True}],
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

    if _guard:
        profile = _build_sandbox_profile(
            _guard.workspace,
            [os.path.realpath(r) for r in _guard.repos],
            _guard.output_dir,
        )
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".sb", delete=False
        ) as f:
            f.write(profile)
            profile_path = f.name
        cmd = [
            "/usr/bin/sandbox-exec", "-f", profile_path,
            sys.executable, str(script_path), *list(args[1:]),
        ]
    else:
        cmd = [sys.executable, str(script_path)] + list(args[1:])
        profile_path = None

    result = None
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    finally:
        if profile_path:
            os.unlink(profile_path)

    if result is None:
        return {"ok": False, "error": "subprocess execution failed before producing a result"}
    if result.returncode != 0:
        return {"ok": False, "error": result.stderr.strip() or result.stdout.strip()}
    try:
        return json.loads(result.stdout.strip())
    except json.JSONDecodeError:
        return {"ok": False, "error": result.stdout.strip()}
