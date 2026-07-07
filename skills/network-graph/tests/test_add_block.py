import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import save_network, load_network
from lib.schemas import create_network_document

def run_script(*args):
    result = subprocess.run([sys.executable, str(SCRIPTS / "add_block.py"), *args], capture_output=True, text=True)
    return result.returncode, result.stdout.strip()

def test_creates_block():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.net.json")
        doc = create_network_document()
        save_network(path, doc)
        code, out = run_script(path, "ResBlock", "--repeat", "3")
        assert code == 0
        result = json.loads(out)
        assert result["ok"] is True
        loaded = load_network(path)
        blocks = [n for n in loaded.nodes if n.kind == "block"]
        assert len(blocks) == 1
        assert blocks[0].label == "ResBlock"
        assert blocks[0].repeat == 3


def test_creates_nested_block_with_parent():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.net.json")
        doc = create_network_document()
        # Add a parent block with known ID
        parent_id = "parent-123"
        from lib.schemas import GraphNode
        parent = GraphNode(id=parent_id, kind="block", label="ParentBlock", children=[], direction="vertical")
        doc.nodes.append(parent)
        save_network(path, doc)

        code, out = run_script(path, "ChildBlock", "--parent", parent_id)
        assert code == 0
        result = json.loads(out)
        assert result["ok"] is True
        assert result["parentId"] == parent_id

        loaded = load_network(path)
        parent_loaded = None
        for n in loaded.nodes:
            if n.id == parent_id:
                parent_loaded = n
                break
        assert parent_loaded is not None
        assert parent_loaded.children is not None
        assert len(parent_loaded.children) == 1
        assert parent_loaded.children[0].label == "ChildBlock"


def test_parent_not_found_returns_error():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.net.json")
        doc = create_network_document()
        save_network(path, doc)
        code, out = run_script(path, "Orphan", "--parent", "nonexistent-id")
        assert code == 1
        result = json.loads(out)
        assert result["ok"] is False
        assert "Parent block not found" in result["error"]


def test_nested_parent_found_in_children():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.net.json")
        doc = create_network_document()
        from lib.schemas import GraphNode
        inner_id = "inner-parent"
        inner = GraphNode(id=inner_id, kind="block", label="Inner", children=[], direction="horizontal")
        outer = GraphNode(id="outer-parent", kind="block", label="Outer", children=[inner], direction="vertical")
        doc.nodes.append(outer)
        save_network(path, doc)

        code, out = run_script(path, "DeepChild", "--parent", inner_id)
        assert code == 0
        result = json.loads(out)
        assert result["ok"] is True
        assert result["parentId"] == inner_id

        loaded = load_network(path)
        outer_loaded = loaded.nodes[-1]
        assert len(outer_loaded.children) == 1
        inner_loaded = outer_loaded.children[0]
        assert len(inner_loaded.children) == 1
        assert inner_loaded.children[0].label == "DeepChild"
