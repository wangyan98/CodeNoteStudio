import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import save_derive, load_derive
from lib.schemas import create_derive_document, DerivationNode


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "set_derives_from.py"), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip()


def _make_doc(path):
    doc = create_derive_document()
    doc.nodes = [
        DerivationNode(id="s1", title="A", content="", stepNumber=1, derivesFrom=None, derivesTo=[], embedRefs=[]),
        DerivationNode(id="s2", title="B", content="", stepNumber=2, derivesFrom=None, derivesTo=[], embedRefs=[]),
        DerivationNode(id="s3", title="C", content="", stepNumber=3, derivesFrom=None, derivesTo=[], embedRefs=[]),
    ]
    save_derive(path, doc)
    return doc


def test_sets_parent():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        _make_doc(path)
        code, out = run_script(path, "s2", "s1")
        assert code == 0
        loaded = load_derive(path)
        s2 = next(n for n in loaded.nodes if n.id == "s2")
        assert s2.derivesFrom == "s1"
        s1 = next(n for n in loaded.nodes if n.id == "s1")
        assert "s2" in s1.derivesTo


def test_sets_root():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        doc = _make_doc(path)
        doc.nodes[1].derivesFrom = "s1"
        doc.nodes[0].derivesTo = ["s2"]
        save_derive(path, doc)
        code, out = run_script(path, "s2", "null")
        assert code == 0
        loaded = load_derive(path)
        s2 = next(n for n in loaded.nodes if n.id == "s2")
        assert s2.derivesFrom is None


def test_rejects_self_link():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        _make_doc(path)
        code, out = run_script(path, "s1", "s1")
        assert code == 1
        result = json.loads(out)
        assert "self" in result["error"].lower()


def test_rejects_cycle():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        doc = _make_doc(path)
        doc.nodes[0].derivesFrom = "s2"
        doc.nodes[1].derivesTo = ["s1"]
        save_derive(path, doc)
        code, out = run_script(path, "s2", "s1")
        assert code == 1
        result = json.loads(out)
        assert "cycle" in result["error"].lower()
