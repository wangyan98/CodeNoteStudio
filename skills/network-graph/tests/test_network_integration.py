import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import load_network

def run(cmd, *args):
    result = subprocess.run([sys.executable, str(SCRIPTS / cmd), *args], capture_output=True, text=True)
    return result.returncode, result.stdout.strip()

def test_three_layer_network():
    with tempfile.TemporaryDirectory() as tmp:
        name = os.path.join(tmp, "test")

        code, out = run("create_network.py", name, "--title", "ThreeLayer")
        result = json.loads(out)
        path = result["path"]

        run("add_layer.py", path, "Conv2d", "--name", "conv1", "--params", '{"in_channels":3,"out_channels":64,"kernel_size":3}')
        run("add_layer.py", path, "BatchNorm2d", "--name", "bn1")
        run("add_layer.py", path, "ReLU", "--name", "relu1")

        loaded = load_network(path)
        assert loaded.name == "ThreeLayer"
        assert len(loaded.nodes) == 5
        assert len(loaded.edges) == 4

        kinds = [n.kind for n in loaded.nodes]
        assert kinds == ["input", "layer", "layer", "layer", "output"]

        conv1 = next(n for n in loaded.nodes if n.label == "conv1")
        relu1 = next(n for n in loaded.nodes if n.label == "relu1")
        run("add_connection.py", path, conv1.id, relu1.id, "--style", "skip", "--label", "fast")

        loaded = load_network(path)
        skip_edges = [e for e in loaded.edges if e.style == "skip"]
        assert len(skip_edges) == 1
        assert skip_edges[0].label == "fast"

        bn1 = next(n for n in loaded.nodes if n.label == "bn1")
        run("delete_node.py", path, bn1.id)
        loaded = load_network(path)
        assert len(loaded.nodes) == 4


def test_scaffold_edit_execute_flow():
    """Full flow: scaffold a build script, edit it, execute → valid .net.json."""
    with tempfile.TemporaryDirectory() as tmp:
        # Step 1: Scaffold a build script
        script_path = os.path.join(tmp, "build_test.py")
        code, out = run("create_build_script.py", script_path)
        assert code == 0
        scaffold_result = json.loads(out)
        assert scaffold_result["ok"] is True
        actual_script_path = scaffold_result["path"]

        # Step 2: Rewrite the script with real network logic
        # The scaffold's sys.path won't work from a tempdir, so fix it
        # and replace the TODO block with direct GraphNode/GraphEdge construction
        project_root = str(Path(__file__).resolve().parents[2])
        new_content = f'''#!/usr/bin/env python3
"""Build script for integration test."""
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, {project_root!r})
from lib.file_utils import save_network, load_network
from lib.schemas import GraphNode, GraphEdge, NetworkDocument


def main():
    parser = argparse.ArgumentParser(description="Build a .net.json network graph")
    parser.add_argument("path", help="Output path for .net.json file")
    parser.add_argument("--name", default="MyNetwork", help="Network name")
    args = parser.parse_args()

    input_node = GraphNode(id="i1", kind="input", label="Input",
                           inputShape="3x640x640")
    conv1 = GraphNode(id="l1", kind="layer", label="conv1",
                      layerType="Conv2d",
                      params={{"in_channels": 3, "out_channels": 16, "kernel_size": 3}},
                      inputShape="3x640x640", outputShape="16x320x320")
    relu1 = GraphNode(id="l2", kind="layer", label="relu1",
                      layerType="ReLU",
                      inputShape="16x320x320", outputShape="16x320x320")
    output_node = GraphNode(id="o1", kind="output", label="Output")

    nodes = [input_node, conv1, relu1, output_node]
    edges = [
        GraphEdge(id="e1", source="i1", target="l1", style="forward"),
        GraphEdge(id="e2", source="l1", target="l2", style="forward"),
        GraphEdge(id="e3", source="l2", target="o1", style="forward"),
    ]

    doc = NetworkDocument(name=args.name, nodes=nodes, edges=edges)
    path = args.path
    if not path.endswith(".net.json"):
        path += ".net.json"
    save_network(path, doc)

    net = load_network(path)
    print(json.dumps({{
        "ok": True,
        "path": path,
        "nodeCount": len(net.nodes),
        "edgeCount": len(net.edges),
    }}, indent=2))


if __name__ == "__main__":
    main()
'''

        with open(actual_script_path, "w") as f:
            f.write(new_content)

        # Step 3: Execute the edited build script
        output_path = os.path.join(tmp, "output.net.json")
        result = subprocess.run(
            [sys.executable, actual_script_path, output_path, "--name", "TestNet"],
            capture_output=True, text=True,
        )
        assert result.returncode == 0
        exec_result = json.loads(result.stdout.strip())
        assert exec_result["ok"] is True
        assert exec_result["nodeCount"] == 4  # input + conv1 + relu1 + output
        assert exec_result["edgeCount"] == 3  # input→conv1, conv1→relu1, relu1→output


def test_nested_block_architecture():
    """Build ResNet-style: Backbone block containing ResBlock with layers inside."""
    with tempfile.TemporaryDirectory() as tmp:
        name = os.path.join(tmp, "nested_net")

        code, out = run("create_network.py", name, "--title", "NestedNet")
        result = json.loads(out)
        path = result["path"]

        # Create parent block (Backbone)
        code, out = run("add_block.py", path, "Backbone")
        result = json.loads(out)
        backbone_id = result["id"]

        # Create nested block (ResBlock) inside Backbone
        code, out = run("add_block.py", path, "ResBlock", "--repeat", "3", "--parent", backbone_id)
        result = json.loads(out)
        resblock_id = result["id"]

        # Add layers inside the nested ResBlock
        run("add_layer.py", path, "Conv2d", "--name", "conv_a", "--params",
            '{"in_channels":64,"out_channels":64,"kernel_size":3,"stride":1,"padding":1}')
        run("add_layer.py", path, "BatchNorm2d", "--name", "bn_a")
        run("add_layer.py", path, "ReLU", "--name", "relu_a")

        # Move layers into the ResBlock (they were added at top level by add_layer.py)
        loaded = load_network(path)
        conv_a = next(n for n in loaded.nodes if n.label == "conv_a")
        bn_a = next(n for n in loaded.nodes if n.label == "bn_a")
        relu_a = next(n for n in loaded.nodes if n.label == "relu_a")

        run("add_node_to_block.py", path, resblock_id, conv_a.id)
        run("add_node_to_block.py", path, resblock_id, bn_a.id)
        run("add_node_to_block.py", path, resblock_id, relu_a.id)

        # Verify
        loaded = load_network(path)
        backbone = next(n for n in loaded.nodes if n.id == backbone_id)
        assert len(backbone.children) == 1  # Only the ResBlock
        assert backbone.children[0].id == resblock_id

        resblock = backbone.children[0]
        assert resblock.label == "ResBlock"
        assert resblock.repeat == 3
        assert len(resblock.children) == 3  # conv_a, bn_a, relu_a
        layer_labels = [c.label for c in resblock.children]
        assert layer_labels == ["conv_a", "bn_a", "relu_a"]
