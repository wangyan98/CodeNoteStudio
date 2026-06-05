import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"

def run_script(*args):
    result = subprocess.run([sys.executable, str(SCRIPTS / "delete_ref.py"), *args], capture_output=True, text=True)
    return result.returncode, result.stdout.strip()

def _make_md_with_refs(path):
    with open(path, 'w') as f:
        f.write("# Doc\n\n@ref(RepoA#file.h#10)\n@ref(RepoB#file.cpp#50)\n\ncontent\n")

def test_deletes_ref():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md_with_refs(path)
        code, out = run_script(path, "RepoA#file.h#10")
        assert code == 0, out
        content = open(path).read()
        assert "@ref(RepoA#file.h#10)" not in content
        assert "@ref(RepoB#file.cpp#50)" in content

def test_ref_not_found():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md_with_refs(path)
        code, out = run_script(path, "Nonexistent#file.h")
        assert code == 1
        assert "not found" in json.loads(out)["error"].lower()

def test_ref_partial_match_not_deleted():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        with open(path, 'w') as f:
            f.write("@ref(RepoA#file.h#10)\n@ref(RepoA#file.h#100)\n")
        code, out = run_script(path, "RepoA#file.h#10")
        assert code == 0, out
        content = open(path).read()
        assert "@ref(RepoA#file.h#100)" in content
        assert "@ref(RepoA#file.h#10)" not in content
