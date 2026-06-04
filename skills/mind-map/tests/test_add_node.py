import json
import os
import subprocess
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.schemas import create_mindmap_document
from lib.file_utils import save_mindmap, load_mindmap
import tempfile
import uuid


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "add_node.py"), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def _make_doc(path):
    doc = create_mindmap_document("Root")
    save_mindmap(path, doc)
    return doc


def test_adds_child_to_root():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        doc = _make_doc(path)
        root_id = doc.root.id
        code, out, err = run_script(path, root_id, "--title", "Child1", "--content", "Hello")
        assert code == 0, f"stderr: {err}"
        result = json.loads(out)
        assert result["ok"] is True
        new_id = result["id"]
        loaded = load_mindmap(path)
        assert len(loaded.root.children) == 1
        child = loaded.root.children[0]
        assert child.id == new_id
        assert child.title == "Child1"
        assert child.content == "Hello"


def test_adds_child_to_nested_node():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        doc = create_mindmap_document("Root")
        from lib.schemas import MindMapNode
        mid = MindMapNode(id=str(uuid.uuid4()), title="Mid", content="", children=[])
        doc.root.children.append(mid)
        save_mindmap(path, doc)

        code, out, err = run_script(path, mid.id, "--title", "Leaf")
        assert code == 0
        loaded = load_mindmap(path)
        assert len(loaded.root.children[0].children) == 1
        assert loaded.root.children[0].children[0].title == "Leaf"


def test_rejects_unknown_parent():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        _make_doc(path)
        code, out, err = run_script(path, "nonexistent-id", "--title", "X")
        assert code == 1
        result = json.loads(out)
        assert result["ok"] is False
