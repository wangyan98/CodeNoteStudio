from .registry import ToolRegistry
from .mindmap_tools import _run_skill_script


def register_code_mapping_tools(registry: ToolRegistry):
    registry.register(
        name="set_code_mapping",
        description="Set a codeMapping on a node in any document (.mind.json, .derive.json, .net.json). Links the node to specific source code. Use this after creating a node with add_node/add_step/add_layer when the node corresponds to specific code.",
        skill="code-mapping",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the document"},
                "node_id": {"type": "string", "description": "ID of the target node"},
                "raw": {"type": "string", "description": "Raw reference text, e.g. @ref(Repo#file.h#287)"},
                "function_name": {"type": "string", "description": "Function or class name in the code"},
                "file_path": {"type": "string", "description": "File path from repo root"},
                "start_line": {"type": "integer", "description": "Start line number"},
                "end_line": {"type": "integer", "description": "End line number"},
            },
            "required": ["path", "node_id", "raw", "function_name", "file_path", "start_line", "end_line"],
        },
        handler=lambda path, node_id, raw, function_name, file_path, start_line, end_line: _run_skill_script(
            "code-mapping/scripts/set_code_mapping.py",
            path, node_id,
            "--raw", raw,
            "--function-name", function_name,
            "--file-path", file_path,
            "--start-line", str(start_line),
            "--end-line", str(end_line),
        ),
    )

    registry.register(
        name="delete_code_mapping",
        description="Remove the codeMapping from a node in any document",
        skill="code-mapping",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the document"},
                "node_id": {"type": "string", "description": "ID of the target node"},
            },
            "required": ["path", "node_id"],
        },
        handler=lambda path, node_id: _run_skill_script(
            "code-mapping/scripts/delete_code_mapping.py", path, node_id
        ),
    )
