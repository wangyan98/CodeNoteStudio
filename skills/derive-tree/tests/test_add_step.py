import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import save_derive, load_derive
from lib.schemas import create_derive_document, DerivationNode


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "add_step.py"), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip()


def _make_doc(path):
    doc = create_derive_document()
    save_derive(path, doc)
    return doc


def test_adds_first_step():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        _make_doc(path)
        code, out = run_script(path, "--title", "Step 1", "--content", "\\frac{d}{dx}x^2 = 2x")
        assert code == 0
        result = json.loads(out)
        assert result["ok"] is True
        assert result["stepNumber"] == 1
        loaded = load_derive(path)
        assert len(loaded.nodes) == 1
        assert loaded.nodes[0].title == "Step 1"
        assert loaded.nodes[0].stepNumber == 1


def test_inserts_at_position():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        doc = create_derive_document()
        doc.nodes = [
            DerivationNode(id="a", title="A", content="", stepNumber=1, derivesFrom=None, derivesTo=[], embedRefs=[]),
            DerivationNode(id="b", title="B", content="", stepNumber=2, derivesFrom=None, derivesTo=[], embedRefs=[]),
        ]
        save_derive(path, doc)
        code, out = run_script(path, "--after-step", "1", "--title", "Inserted")
        assert code == 0
        loaded = load_derive(path)
        assert len(loaded.nodes) == 3
        assert loaded.nodes[1].title == "Inserted"
        assert loaded.nodes[1].stepNumber == 2
        assert loaded.nodes[2].stepNumber == 3


def test_adds_with_derives_from():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        doc = create_derive_document()
        doc.nodes.append(DerivationNode(
            id="parent", title="Parent", content="", stepNumber=1,
            derivesFrom=None, derivesTo=[], embedRefs=[]
        ))
        save_derive(path, doc)
        code, out = run_script(path, "--derives-from", "parent", "--title", "Child")
        assert code == 0
        result = json.loads(out)
        new_id = result["id"]
        loaded = load_derive(path)
        child = next(n for n in loaded.nodes if n.id == new_id)
        assert child.derivesFrom == "parent"
        parent = next(n for n in loaded.nodes if n.id == "parent")
        assert new_id in parent.derivesTo


def test_renumbers_after_insert():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        doc = create_derive_document()
        for i, ch in enumerate(["A", "B", "C"]):
            doc.nodes.append(DerivationNode(
                id=ch, title=ch, content="", stepNumber=i+1,
                derivesFrom=None, derivesTo=[], embedRefs=[]
            ))
        save_derive(path, doc)
        code, out = run_script(path, "--after-step", "1", "--title", "Inserted")
        assert code == 0
        loaded = load_derive(path)
        assert [n.stepNumber for n in loaded.nodes] == [1, 2, 3, 4]
        assert [n.title for n in loaded.nodes] == ["A", "Inserted", "B", "C"]
