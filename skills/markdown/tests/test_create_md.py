import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"

def run_script(*args):
    result = subprocess.run([sys.executable, str(SCRIPTS / "create_md.py"), *args], capture_output=True, text=True)
    return result.returncode, result.stdout.strip()

def test_creates_with_title():
    with tempfile.TemporaryDirectory() as tmp:
        name = os.path.join(tmp, "test")
        code, out = run_script(name, "--title", "My Doc")
        assert code == 0
        result = json.loads(out)
        assert result["ok"] is True
        path = result["path"]
        content = open(path).read()
        assert content == "# My Doc\n\n"

def test_creates_without_title():
    with tempfile.TemporaryDirectory() as tmp:
        name = os.path.join(tmp, "test")
        code, out = run_script(name)
        assert code == 0
        result = json.loads(out)
        path = result["path"]
        content = open(path).read()
        assert content.startswith("# Untitled\n")
