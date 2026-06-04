import json, os, subprocess, sys, tempfile, uuid
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import save_network, load_network
from lib.schemas import create_network_document, GraphNode, GraphEdge

def run_script(*args):
    result = subprocess.run([sys.executable, str(SCRIPTS / "delete_node.py"), *args], capture_output=True, text=True)
    return result.returncode, result.stdout.strip()

def test_deletes_node_and_incident_edges():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.net.json")
        doc = create_network_document("Test")
        mid = GraphNode(id=str(uuid.uuid4()), kind="layer", label="Mid", layerType="ReLU")
        doc.nodes.insert(1, mid)
        doc.edges = [
            GraphEdge(id=str(uuid.uuid4()), source=doc.nodes[0].id, target=mid.id),
            GraphEdge(id=str(uuid.uuid4()), source=mid.id, target=doc.nodes[2].id),
        ]
        save_network(path, doc)

        code, out = run_script(path, mid.id)
        assert code == 0
        loaded = load_network(path)
        assert len(loaded.nodes) == 2
        mid_refs = [e for e in loaded.edges if e.source == mid.id or e.target == mid.id]
        assert len(mid_refs) == 0
