import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"

def run_script(*args):
    result = subprocess.run([sys.executable, str(SCRIPTS / "create_md.py"), *args], capture_output=True, text=True)
    return result.returncode, result.stdout.strip()

def test_creates_with_title():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        code, out = run_script(path, "--title", "My Doc")
        assert code == 0
        assert json.loads(out)["ok"] is True
        content = open(path).read()
        assert content == "# My Doc\n\n"

def test_creates_without_title():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        code, out = run_script(path)
        assert code == 0
        content = open(path).read()
        assert content.startswith("# Untitled\n")
