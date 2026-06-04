import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"

def run_script(*args):
    result = subprocess.run([sys.executable, str(SCRIPTS / "append_section.py"), *args], capture_output=True, text=True)
    return result.returncode, result.stdout.strip()

def _make_md(path):
    open(path, 'w').write("# Doc\n\n")

def test_appends_section():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md(path)
        code, out = run_script(path, "Overview", "This is content.")
        assert code == 0
        content = open(path).read()
        assert "## Overview\n\nThis is content.\n\n" in content

def test_rejects_duplicate_heading():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md(path)
        run_script(path, "Overview", "First.")
        code, out = run_script(path, "Overview", "Second.")
        assert code == 1
        assert "already exists" in json.loads(out)["error"].lower()

def test_multiple_sections_accumulate():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md(path)
        run_script(path, "One", "1")
        run_script(path, "Two", "2")
        content = open(path).read()
        lines = content.split("\n")
        assert "## One" in lines
        assert "## Two" in lines
        assert lines.index("## One") < lines.index("## Two")
