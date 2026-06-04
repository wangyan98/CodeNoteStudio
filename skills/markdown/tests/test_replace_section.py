import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"

def run_script(*args):
    result = subprocess.run([sys.executable, str(SCRIPTS / "replace_section.py"), *args], capture_output=True, text=True)
    return result.returncode, result.stdout.strip()

def _make_md(path):
    open(path, 'w').write("# Doc\n\n## Overview\n\nOld content.\n\n## Details\n\nMore stuff.\n\n")

def test_replaces_existing_section():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md(path)
        code, out = run_script(path, "Overview", "New content.")
        assert code == 0
        content = open(path).read()
        assert "## Overview\n\nNew content.\n\n" in content
        assert "Old content" not in content

def test_rejects_unknown_heading():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md(path)
        code, out = run_script(path, "Nonexistent", "x")
        assert code == 1

def test_preserves_other_sections():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md(path)
        run_script(path, "Overview", "New.")
        content = open(path).read()
        assert "## Details" in content
        assert "More stuff" in content
