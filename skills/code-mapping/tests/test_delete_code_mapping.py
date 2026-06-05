import json, os, subprocess, sys, tempfile, uuid
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import save_mindmap, write_json
from lib.schemas import CodeMapping, create_mindmap_document


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "delete_code_mapping.py"), *args],
        capture_output=True, text=True,
    )
    return result.returncode, result.stdout.strip()


def test_deletes_mindmap_code_mapping():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        doc = create_mindmap_document("Test")
        doc.root.codeMapping = CodeMapping(
            raw="@ref(Repo#file.h#10)", functionName="main",
            filePath="file.h", startLine=10, endLine=20,
        )
        save_mindmap(path, doc)

        code, out = run_script(path, doc.root.id)
        assert code == 0, out

        with open(path) as f:
            data = json.load(f)
        assert data["root"].get("codeMapping") is None


def test_deletes_derive_code_mapping():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        node_id = str(uuid.uuid4())
        write_json(path, {
            "type": "derive", "version": 1, "nodes": [{
                "id": node_id, "title": "S1", "content": "x",
                "stepNumber": 1, "derivesFrom": None, "derivesTo": [], "embedRefs": [],
                "codeMapping": {
                    "raw": "@ref(Repo#a.py#1)", "functionName": "f",
                    "filePath": "a.py", "startLine": 1, "endLine": 3,
                },
            }],
        })

        code, out = run_script(path, node_id)
        assert code == 0, out

        with open(path) as f:
            data = json.load(f)
        assert data["nodes"][0].get("codeMapping") is None


def test_no_code_mapping_to_delete():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        doc = create_mindmap_document("Test")
        save_mindmap(path, doc)

        code, out = run_script(path, doc.root.id)
        assert code == 1
        assert "no code mapping" in json.loads(out)["error"].lower()
