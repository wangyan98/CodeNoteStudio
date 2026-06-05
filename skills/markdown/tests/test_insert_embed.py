import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"

def run_script(*args):
    result = subprocess.run([sys.executable, str(SCRIPTS / "insert_embed.py"), *args], capture_output=True, text=True)
    return result.returncode, result.stdout.strip()

def _make_md(path):
    with open(path, 'w') as f:
        f.write("# Doc\n\n## Section\n\ncontent\n")

def test_inserts_embed_at_end():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md(path)
        code, out = run_script(path, "diagrams/flow.seq.mermaid")
        assert code == 0, out
        content = open(path).read()
        assert "![[diagrams/flow.seq.mermaid]]\n" in content

def test_rejects_duplicate_embed():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md(path)
        run_script(path, "diagrams/flow.seq.mermaid")
        code, out = run_script(path, "diagrams/flow.seq.mermaid")
        assert code == 1, out
        assert "already exists" in json.loads(out)["error"].lower()

def test_preserves_existing_content():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md(path)
        run_script(path, "diagrams/flow.seq.mermaid")
        content = open(path).read()
        assert "## Section" in content
        assert "content" in content

def test_file_not_found():
    code, out = run_script("/nonexistent/path.md", "diagrams/flow.seq.mermaid")
    assert code == 1
    assert "not found" in json.loads(out)["error"].lower()
