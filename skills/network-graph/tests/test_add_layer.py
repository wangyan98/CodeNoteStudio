import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import save_network, load_network
from lib.schemas import create_network_document

def run_script(*args):
    result = subprocess.run([sys.executable, str(SCRIPTS / "add_layer.py"), *args], capture_output=True, text=True)
    return result.returncode, result.stdout.strip()

def _make_doc(path):
    doc = create_network_document("Test")
    save_network(path, doc)
    return doc

def test_adds_layer_before_output():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.net.json")
        doc = _make_doc(path)
        code, out = run_script(path, "Conv2d", "--name", "conv1")
        assert code == 0
        result = json.loads(out)
        assert result["ok"] is True
        loaded = load_network(path)
        assert len(loaded.nodes) == 3
        assert loaded.nodes[0].kind == "input"
        assert loaded.nodes[1].kind == "layer"
        assert loaded.nodes[1].layerType == "Conv2d"
        assert loaded.nodes[1].label == "conv1"
        assert loaded.nodes[2].kind == "output"
        assert len(loaded.edges) == 2

def test_adds_layer_with_params():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.net.json")
        _make_doc(path)
        code, out = run_script(path, "Linear", "--params", '{"in_features": 512, "out_features": 256}')
        assert code == 0
        loaded = load_network(path)
        layer = loaded.nodes[1]
        assert layer.params == {"in_features": 512, "out_features": 256}

def test_adds_custom_layer_with_kv_params():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.net.json")
        _make_doc(path)
        code, out = run_script(path, "Custom", "--name", "my_custom_op", "--params", '{"activation": "silu", "groups": 16}')
        assert code == 0
        result = json.loads(out)
        assert result["ok"] is True
        loaded = load_network(path)
        layer = loaded.nodes[1]
        assert layer.kind == "layer"
        assert layer.layerType == "Custom"
        assert layer.label == "my_custom_op"
        assert layer.params == {"activation": "silu", "groups": 16}
