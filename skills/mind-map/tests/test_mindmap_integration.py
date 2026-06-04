import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import load_mindmap


def run(cmd, *args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / cmd), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip()


def test_full_workflow():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")

        # Create
        code, out = run("create_mindmap.py", path)
        assert code == 0
        result = json.loads(out)
        root_id = result["id"]

        # Add children
        code, out = run("add_node.py", path, root_id, "--title", "Functions")
        funcs_id = json.loads(out)["id"]
        code, out = run("add_node.py", path, root_id, "--title", "Classes")
        classes_id = json.loads(out)["id"]

        # Add leaf under Functions
        code, out = run("add_node.py", path, funcs_id, "--title", "main()")
        leaf_id = json.loads(out)["id"]

        # Update leaf
        run("update_node.py", path, leaf_id, "--content", "Entry point")

        # Verify structure
        doc = load_mindmap(path)
        assert len(doc.root.children) == 2
        assert doc.root.children[0].title == "Functions"
        assert len(doc.root.children[0].children) == 1
        assert doc.root.children[0].children[0].content == "Entry point"

        # Delete leaf
        run("delete_node.py", path, leaf_id)
        doc = load_mindmap(path)
        assert len(doc.root.children[0].children) == 0

        # Delete Functions branch
        run("delete_node.py", path, funcs_id)
        doc = load_mindmap(path)
        assert len(doc.root.children) == 1
        assert doc.root.children[0].title == "Classes"
