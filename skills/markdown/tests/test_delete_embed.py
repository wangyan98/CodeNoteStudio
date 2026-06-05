import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"

def run_script(*args):
    result = subprocess.run([sys.executable, str(SCRIPTS / "delete_embed.py"), *args], capture_output=True, text=True)
    return result.returncode, result.stdout.strip()

def _make_md_with_embeds(path):
    with open(path, 'w') as f:
        f.write("# Doc\n\n![[one.seq.mermaid]]\n![[two.mind.json]]\n\ncontent\n")

def test_deletes_embed():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md_with_embeds(path)
        code, out = run_script(path, "one.seq.mermaid")
        assert code == 0, out
        content = open(path).read()
        assert "![[one.seq.mermaid]]" not in content
        assert "![[two.mind.json]]" in content

def test_embed_not_found():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md_with_embeds(path)
        code, out = run_script(path, "nonexistent.seq.mermaid")
        assert code == 1
        error = json.loads(out)["error"].lower()
        assert "not found" in error or "no matching" in error

def test_deletes_last_embed():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        with open(path, 'w') as f:
            f.write("# Doc\n\n![[only.seq.mermaid]]\n")
        code, out = run_script(path, "only.seq.mermaid")
        assert code == 0, out
        content = open(path).read()
        assert "![[only.seq.mermaid]]" not in content
