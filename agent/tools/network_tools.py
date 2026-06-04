from .registry import ToolRegistry
from .mindmap_tools import _run_skill_script


def register_network_tools(registry: ToolRegistry):
    registry.register(
        name="create_network",
        description="Create a new .net.json neural network graph file",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .net.json file to create"},
                "name": {"type": "string", "description": "Name of the network (optional)"},
            },
            "required": ["path"],
        },
        handler=lambda path, name="New Network": _run_skill_script(
            "network-graph/scripts/create_network.py", path, "--name", name
        ),
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


def _add_layer(path, layer_type, name=None):
    args = ["network-graph/scripts/add_layer.py", path, layer_type]
    if name:
        args.extend(["--name", name])
    return _run_skill_script(*args)
