import json, os, subprocess, sys, tempfile, uuid
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import save_mindmap, write_json
from lib.schemas import (
    create_mindmap_document, create_derive_document, DerivationNode,
    create_network_document,
)

def run_script(*args):
    result = subprocess.run([sys.executable, str(SCRIPTS / "set_code_mapping.py"), *args], capture_output=True, text=True)
    return result.returncode, result.stdout.strip()

def test_sets_mindmap_node_code_mapping():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        doc = create_mindmap_document("Test")
        node_id = doc.root.id
        save_mindmap(path, doc)

        code, out = run_script(
            path, node_id,
            "--raw", "@ref(Repo#file.h#10)",
            "--function-name", "main",
            "--file-path", "file.h",
            "--start-line", "10",
            "--end-line", "20",
        )
        assert code == 0, out
        result = json.loads(out)
        assert result["ok"] is True

        # Verify on disk
        with open(path) as f:
            data = json.load(f)
        assert data["root"]["codeMapping"]["raw"] == "@ref(Repo#file.h#10)"
        assert data["root"]["codeMapping"]["functionName"] == "main"

def test_sets_derive_node_code_mapping():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        doc = create_derive_document()
        node = DerivationNode(
            id=str(uuid.uuid4()), title="Step 1", content="x = 1",
            stepNumber=1, derivesFrom=None, derivesTo=[], embedRefs=[]
        )
        doc.nodes.append(node)
        write_json(path, {"type": "derive", "version": 1, "nodes": [
            {"id": node.id, "title": node.title, "content": node.content,
             "stepNumber": node.stepNumber, "derivesFrom": None, "derivesTo": [], "embedRefs": []}
        ]})

        code, out = run_script(
            path, node.id,
            "--raw", "@ref(Repo#src.py#5)",
            "--function-name", "calc",
            "--file-path", "src.py",
            "--start-line", "5",
            "--end-line", "10",
        )
        assert code == 0, out

        with open(path) as f:
            data = json.load(f)
        assert data["nodes"][0]["codeMapping"]["functionName"] == "calc"

def test_sets_network_node_code_mapping():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.net.json")
        doc = create_network_document("Net")
        # Use the input node
        node_id = doc.nodes[0].id
        write_json(path, {"type": "net", "version": 2, "name": "Net",
            "nodes": [{"id": node_id, "kind": "input", "label": "Input"}],
            "edges": []})

        code, out = run_script(
            path, node_id,
            "--raw", "@ref(Repo#model.py#42)",
            "--function-name", "forward",
            "--file-path", "model.py",
            "--start-line", "42",
            "--end-line", "60",
        )
        assert code == 0, out

        with open(path) as f:
            data = json.load(f)
        assert data["nodes"][0]["codeMapping"]["functionName"] == "forward"

def test_node_not_found():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        doc = create_mindmap_document("Test")
        save_mindmap(path, doc)

        code, out = run_script(
            path, "nonexistent-id",
            "--raw", "@ref(Repo#file.h#10)",
            "--function-name", "main",
            "--file-path", "file.h",
            "--start-line", "10",
            "--end-line", "20",
        )
        assert code == 1
        assert "not found" in json.loads(out)["error"].lower()
