import json, os, subprocess, sys, tempfile, uuid
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.schemas import create_mindmap_document, MindMapNode
from lib.file_utils import save_mindmap, load_mindmap


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "update_node.py"), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def _make_doc(path):
    doc = create_mindmap_document("Root")
    child = MindMapNode(id=str(uuid.uuid4()), title="Child", content="Old", children=[])
    doc.root.children.append(child)
    save_mindmap(path, doc)
    return doc


def test_updates_title():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        doc = _make_doc(path)
        child_id = doc.root.children[0].id
        code, out, err = run_script(path, child_id, "--title", "New Title")
        assert code == 0
        loaded = load_mindmap(path)
        assert loaded.root.children[0].title == "New Title"
        assert loaded.root.children[0].content == "Old"  # unchanged


def test_updates_content():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        doc = _make_doc(path)
        child_id = doc.root.children[0].id
        code, out, err = run_script(path, child_id, "--content", "New Content")
        assert code == 0
        loaded = load_mindmap(path)
        assert loaded.root.children[0].content == "New Content"


def test_sets_code_mapping():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        doc = _make_doc(path)
        child_id = doc.root.children[0].id
        cm = '{"raw":"def foo():","functionName":"foo","filePath":"a.py","startLine":1,"endLine":3}'
        code, out, err = run_script(path, child_id, "--code-mapping", cm)
        assert code == 0
        loaded = load_mindmap(path)
        assert loaded.root.children[0].codeMapping is not None
        assert loaded.root.children[0].codeMapping.functionName == "foo"


def test_rejects_unknown_node():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        _make_doc(path)
        code, out, err = run_script(path, "nonexistent", "--title", "X")
        assert code == 1
