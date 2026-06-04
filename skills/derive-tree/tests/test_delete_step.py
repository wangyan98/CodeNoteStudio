import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import save_derive, load_derive
from lib.schemas import create_derive_document, DerivationNode


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "delete_step.py"), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip()


def _make_chain(path):
    doc = create_derive_document()
    doc.nodes = [
        DerivationNode(id="s1", title="A", content="", stepNumber=1, derivesFrom=None, derivesTo=["s2"], embedRefs=[]),
        DerivationNode(id="s2", title="B", content="", stepNumber=2, derivesFrom="s1", derivesTo=["s3"], embedRefs=[]),
        DerivationNode(id="s3", title="C", content="", stepNumber=3, derivesFrom="s2", derivesTo=[], embedRefs=[]),
    ]
    save_derive(path, doc)
    return doc


def test_deletes_step():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        _make_chain(path)
        code, out = run_script(path, "s2")
        assert code == 0
        loaded = load_derive(path)
        assert len(loaded.nodes) == 2
        assert [n.title for n in loaded.nodes] == ["A", "C"]


def test_orphans_children():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        _make_chain(path)
        code, out = run_script(path, "s2")
        assert code == 0
        loaded = load_derive(path)
        s3 = next(n for n in loaded.nodes if n.id == "s3")
        assert s3.derivesFrom is None


def test_renumbers_after_delete():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        _make_chain(path)
        code, out = run_script(path, "s1")
        assert code == 0
        loaded = load_derive(path)
        assert loaded.nodes[0].stepNumber == 1
        assert loaded.nodes[1].stepNumber == 2
