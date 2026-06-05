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

    registry.register(
        name="insert_embed",
        description="Insert an ![[path]] embed reference into a .md file. Embeds another notebook note inline. Path is relative to workspace root. Supported targets: .seq.mermaid, .derive.json, .mind.json, .net.json, .md.",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .md file"},
                "embed_path": {"type": "string", "description": "Path to the note to embed (relative to workspace root, e.g. 'diagrams/flow.seq.mermaid')"},
            },
            "required": ["path", "embed_path"],
        },
        handler=lambda path, embed_path: _run_skill_script(
            "markdown/scripts/insert_embed.py", path, embed_path
        ),
    )

    registry.register(
        name="delete_embed",
        description="Delete an ![[path]] embed reference from a .md file",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .md file"},
                "embed_path": {"type": "string", "description": "The embed path to remove"},
            },
            "required": ["path", "embed_path"],
        },
        handler=lambda path, embed_path: _run_skill_script(
            "markdown/scripts/delete_embed.py", path, embed_path
        ),
    )

    registry.register(
        name="insert_ref",
        description="Insert an @ref() code reference into a .md file. Links to specific code locations with #-separated segments: @ref(repo#file#line#name). All segments are optional. Without repo prefix, scoped to current repo.",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .md file"},
                "ref": {"type": "string", "description": "Reference string (e.g. 'repo#file.h#287' or 'MyClass.getValue')"},
            },
            "required": ["path", "ref"],
        },
        handler=lambda path, ref: _run_skill_script(
            "markdown/scripts/insert_ref.py", path, ref
        ),
    )

    registry.register(
        name="delete_ref",
        description="Delete an @ref() code reference from a .md file",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .md file"},
                "ref": {"type": "string", "description": "The ref string to remove (without @ref() wrapper)"},
            },
            "required": ["path", "ref"],
        },
        handler=lambda path, ref: _run_skill_script(
            "markdown/scripts/delete_ref.py", path, ref
        ),
    )


def _create_md(name, title=None):
    args = ["markdown/scripts/create_md.py", name]
    if title:
        args.extend(["--title", title])
    return _run_skill_script(*args)
