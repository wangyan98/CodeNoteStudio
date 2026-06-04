import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import save_network, load_network
from lib.schemas import create_network_document

def run_script(*args):
    result = subprocess.run([sys.executable, str(SCRIPTS / "add_connection.py"), *args], capture_output=True, text=True)
    return result.returncode, result.stdout.strip()

def test_adds_skip_connection():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.net.json")
        doc = create_network_document("Test")
        save_network(path, doc)
        input_id = doc.nodes[0].id
        output_id = doc.nodes[1].id
        code, out = run_script(path, input_id, output_id, "--style", "skip", "--label", "residual")
        assert code == 0
        loaded = load_network(path)
        assert len(loaded.edges) == 2
        skip_edge = next(e for e in loaded.edges if e.style == "skip")
        assert skip_edge.label == "residual"

def test_rejects_unknown_nodes():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.net.json")
        doc = create_network_document()
        save_network(path, doc)
        code, out = run_script(path, "fake-id", doc.nodes[1].id)
        assert code == 1
