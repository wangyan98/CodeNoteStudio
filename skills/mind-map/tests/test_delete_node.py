import json, os, subprocess, sys, tempfile, uuid
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.schemas import create_mindmap_document, MindMapNode
from lib.file_utils import save_mindmap, load_mindmap


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "delete_node.py"), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip()


def _make_doc_with_child(path):
    doc = create_mindmap_document("Root")
    child = MindMapNode(id=str(uuid.uuid4()), title="Child", content="x", children=[])
    doc.root.children.append(child)
    save_mindmap(path, doc)
    return doc


def test_deletes_leaf_node():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        doc = _make_doc_with_child(path)
        child_id = doc.root.children[0].id
        code, out = run_script(path, child_id)
        assert code == 0
        loaded = load_mindmap(path)
        assert len(loaded.root.children) == 0


def test_deletes_subtree():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        doc = create_mindmap_document("Root")
        mid = MindMapNode(id=str(uuid.uuid4()), title="Mid", content="", children=[])
        leaf = MindMapNode(id=str(uuid.uuid4()), title="Leaf", content="", children=[])
        mid.children.append(leaf)
        doc.root.children.append(mid)
        save_mindmap(path, doc)

        code, out = run_script(path, mid.id)
        assert code == 0
        loaded = load_mindmap(path)
        assert len(loaded.root.children) == 0


def test_replaces_root_when_deleted():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        doc = create_mindmap_document("Root")
        save_mindmap(path, doc)
        code, out = run_script(path, doc.root.id)
        assert code == 0
        loaded = load_mindmap(path)
        assert loaded.root.title == "New Mind Map"
