import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"

def run_script(*args):
    result = subprocess.run([sys.executable, str(SCRIPTS / "insert_ref.py"), *args], capture_output=True, text=True)
    return result.returncode, result.stdout.strip()

def _make_md(path):
    with open(path, 'w') as f:
        f.write("# Doc\n\n## Section\n\ncontent\n")

def test_inserts_ref_at_end():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md(path)
        code, out = run_script(path, "Nilou-main#Engine/Source/Runtime/Core/Public/Containers/Array.h#287")
        assert code == 0, out
        content = open(path).read()
        assert "@ref(Nilou-main#Engine/Source/Runtime/Core/Public/Containers/Array.h#287)" in content

def test_rejects_duplicate_ref():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md(path)
        run_script(path, "MyClass.getValue")
        code, out = run_script(path, "MyClass.getValue")
        assert code == 1, out
        assert "already exists" in json.loads(out)["error"].lower()

def test_ref_with_all_segments():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md(path)
        code, out = run_script(path, "Nilou-main#Engine/Source/Runtime/Core/Public/Math/Vector.h#32#FVector")
        assert code == 0, out
        content = open(path).read()
        assert "@ref(Nilou-main#Engine/Source/Runtime/Core/Public/Math/Vector.h#32#FVector)" in content

def test_file_not_found():
    code, out = run_script("/nonexistent/path.md", "SomeClass.method")
    assert code == 1
    assert "not found" in json.loads(out)["error"].lower()
