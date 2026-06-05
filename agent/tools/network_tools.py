from .registry import ToolRegistry
from .mindmap_tools import _run_skill_script


def register_network_tools(registry: ToolRegistry):
    registry.register(
        name="create_network",
        description="Create a new .net.json neural network graph file",
        parameters={
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Name for the file (without extension, e.g. 'my_network' or 'subdir/my_network')"},
                "title": {"type": "string", "description": "Display title of the network (optional)"},
            },
            "required": ["name"],
        },
        handler=lambda name, title=None: _create_network(name, title),
    )

    registry.register(
        name="add_layer",
        description="Add a layer to a network graph",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .net.json file"},
                "layer_type": {"type": "string", "description": "Type of layer (e.g., Linear, Conv2d)"},
                "name": {"type": "string", "description": "Name/label for the layer (optional)"},
            },
            "required": ["path", "layer_type"],
        },
        handler=lambda path, layer_type, name=None: _add_layer(path, layer_type, name),
    )

    registry.register(
        name="list_preset_layers",
        description="List all available preset layer types and their parameter definitions for neural network graphs",
        parameters={
            "type": "object",
            "properties": {},
            "required": [],
        },
        handler=lambda: _run_skill_script("network-graph/scripts/list_preset_layers.py"),
    )


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
