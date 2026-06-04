import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import save_derive, load_derive
from lib.schemas import create_derive_document, DerivationNode


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "update_step.py"), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip()


def _make_doc(path):
    doc = create_derive_document()
    doc.nodes = [
        DerivationNode(id="s1", title="Step 1", content="f(x) = x^2", stepNumber=1,
                       derivesFrom=None, derivesTo=[], embedRefs=[])
    ]
    save_derive(path, doc)
    return doc


def test_updates_title_and_content():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        _make_doc(path)
        code, out = run_script(path, "s1", "--title", "New Title", "--content", "\\frac{d}{dx}f(x) = 2x")
        assert code == 0
        loaded = load_derive(path)
        assert loaded.nodes[0].title == "New Title"
        assert loaded.nodes[0].content == "\\frac{d}{dx}f(x) = 2x"


def test_rejects_unknown_step():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        _make_doc(path)
        code, out = run_script(path, "nonexistent", "--title", "X")
        assert code == 1
