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
