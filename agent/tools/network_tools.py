from .registry import ToolRegistry
from .mindmap_tools import _run_skill_script


def register_network_tools(registry: ToolRegistry):
    registry.register(
        name="create_network",
        description="Create a new .net.json neural network graph file",
        skill="network-graph",
        parameters={
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Name for the file (without extension, e.g. 'my_network' or 'subdir/my_network')"},
                "title": {"type": "string", "description": "Display title of the network (optional)"},
            },
            "required": ["name"],
        },
        path_params=[{"param": "name", "write": True, "required": True}],
        handler=lambda name, title=None: _create_network(name, title),
    )

    registry.register(
        name="add_layer",
        description="Add a layer to a network graph. IMPORTANT: If this layer maps to specific code, call set_code_mapping immediately after with the returned node id.",
        skill="network-graph",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .net.json file"},
                "layer_type": {"type": "string", "description": "Type of layer (e.g., Linear, Conv2d)"},
                "name": {"type": "string", "description": "Name/label for the layer (optional)"},
            },
            "required": ["path", "layer_type"],
        },
        path_params=[{"param": "path", "write": True, "required": True}],
        handler=lambda path, layer_type, name=None: _add_layer(path, layer_type, name),
    )

    registry.register(
        name="add_block",
        description="Add a block node (container for sub-layers) to a network graph. IMPORTANT: If this block maps to specific code, call set_code_mapping immediately after with the returned node id.",
        skill="network-graph",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .net.json file"},
                "name": {"type": "string", "description": "Block name"},
                "repeat": {"type": "integer", "description": "Repeat count (optional)"},
            },
            "required": ["path", "name"],
        },
        path_params=[{"param": "path", "write": True, "required": True}],
        handler=lambda path, name, repeat=None: _add_block(path, name, repeat),
    )

    registry.register(
        name="list_preset_layers",
        description="List all available preset layer types and their parameter definitions for neural network graphs",
        skill="network-graph",
        parameters={
            "type": "object",
            "properties": {},
            "required": [],
        },
        handler=lambda: _run_skill_script("network-graph/scripts/list_preset_layers.py"),
    )


def _add_block(path, name, repeat=None):
    args = ["network-graph/scripts/add_block.py", path, name]
    if repeat is not None:
        args.extend(["--repeat", str(repeat)])
    return _run_skill_script(*args)


def _add_layer(path, layer_type, name=None):
    args = ["network-graph/scripts/add_layer.py", path, layer_type]
    if name:
        args.extend(["--name", name])
    return _run_skill_script(*args)


def _create_network(name, title=None):
    args = ["network-graph/scripts/create_network.py", name]
    if title:
        args.extend(["--title", title])
    return _run_skill_script(*args)
