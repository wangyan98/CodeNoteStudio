from .registry import ToolRegistry
from .mindmap_tools import _run_skill_script


def register_derive_tools(registry: ToolRegistry):
    registry.register(
        name="create_derive",
        description="Create a new .derive.json derivation tree file",
        parameters={
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Name for the file (without extension, e.g. 'lighting' or 'subdir/lighting')"},
            },
            "required": ["name"],
        },
        handler=lambda name: _run_skill_script("derive-tree/scripts/create_derive.py", name),
    )

    registry.register(
        name="add_step",
        description="Add a step to a derivation tree. IMPORTANT: If this step has corresponding source code, call set_code_mapping immediately after with the returned step id.",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .derive.json file"},
                "title": {"type": "string", "description": "Title of the step"},
                "content": {"type": "string", "description": "Content of the step (optional)"},
                "after_step": {"type": "integer", "description": "Step number to insert after (optional)"},
                "derives_from": {"type": "string", "description": "ID of the parent step (optional)"},
            },
            "required": ["path", "title"],
        },
        handler=lambda path, title, content="", after_step=None, derives_from=None: _add_step(
            path, title, content, after_step, derives_from
        ),
    )


def _add_step(path, title, content="", after_step=None, derives_from=None):
    args = ["derive-tree/scripts/add_step.py", path]
    if after_step is not None:
        args.extend(["--after-step", str(after_step)])
    if derives_from:
        args.extend(["--derives-from", derives_from])
    args.extend(["--title", title])
    args.extend(["--content", content])
    return _run_skill_script(*args)
