from .registry import ToolRegistry
from .mindmap_tools import _run_skill_script


def register_markdown_tools(registry: ToolRegistry):
    registry.register(
        name="create_md",
        description="Create a new .md markdown file",
        parameters={
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Name for the file (without extension, e.g. 'readme' or 'subdir/readme')"},
                "title": {"type": "string", "description": "Title for the document (optional)"},
            },
            "required": ["name"],
        },
        handler=lambda name, title=None: _create_md(name, title),
    )

    registry.register(
        name="append_section",
        description="Append a section to a markdown file",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .md file"},
                "heading": {"type": "string", "description": "Section heading (without ##)"},
                "content": {"type": "string", "description": "Section content"},
            },
            "required": ["path", "heading", "content"],
        },
        handler=lambda path, heading, content: _run_skill_script(
            "markdown/scripts/append_section.py", path, heading, content
        ),
    )

    registry.register(
        name="replace_section",
        description="Replace a section in a markdown file",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .md file"},
                "heading": {"type": "string", "description": "Section heading to replace (without ##)"},
                "content": {"type": "string", "description": "New section content"},
            },
            "required": ["path", "heading", "content"],
        },
        handler=lambda path, heading, content: _run_skill_script(
            "markdown/scripts/replace_section.py", path, heading, content
        ),
    )


def _create_md(name, title=None):
    args = ["markdown/scripts/create_md.py", name]
    if title:
        args.extend(["--title", title])
    return _run_skill_script(*args)
