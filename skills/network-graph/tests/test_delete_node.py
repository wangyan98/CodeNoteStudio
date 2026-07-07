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


def test_deletes_node_from_nested_block():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.net.json")
        doc = create_network_document("Test")

        # Create a nested structure: block -> nested block -> layer
        layer_id = str(uuid.uuid4())
        nested_block = GraphNode(
            id=str(uuid.uuid4()), kind="block", label="NestedBlock",
            children=[
                GraphNode(id=layer_id, kind="layer", label="inner", layerType="ReLU")
            ],
            internalEdges=[]
        )
        parent_block = GraphNode(
            id=str(uuid.uuid4()), kind="block", label="ParentBlock",
            children=[nested_block],
            internalEdges=[]
        )
        doc.nodes.insert(1, parent_block)
        save_network(path, doc)

        # Delete the layer from inside the nested block
        code, out = run_script(path, layer_id)
        assert code == 0
        loaded = load_network(path)
        parent = next(n for n in loaded.nodes if n.id == parent_block.id)
        nested = parent.children[0]
        # children may be None after deserialization when empty
        assert not nested.children
