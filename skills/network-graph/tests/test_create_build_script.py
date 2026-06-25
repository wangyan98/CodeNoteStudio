import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "create_build_script.py"), *args],
        capture_output=True, text=True,
    )
    return result.returncode, result.stdout.strip()


def test_creates_skeleton_with_py_suffix():
    with tempfile.TemporaryDirectory() as tmp:
        target = os.path.join(tmp, "build_my_model")
        code, out = run_script(target)
        assert code == 0
        result = json.loads(out)
        assert result["ok"] is True
        # .py should have been appended
        assert result["path"].endswith(".py")
        assert os.path.exists(result["path"])
        # Verify skeleton content
        content = open(result["path"]).read()
        assert "#!/usr/bin/env python3" in content
        assert "from lib.file_utils import save_network" in content
        assert "from lib.schemas import GraphNode, GraphEdge, NetworkDocument" in content
        assert "def main():" in content
        assert "NetworkDocument" in content


def test_creates_with_explicit_py_extension():
    with tempfile.TemporaryDirectory() as tmp:
        target = os.path.join(tmp, "build_model.py")
        code, out = run_script(target)
        assert code == 0
        result = json.loads(out)
        assert result["ok"] is True
        assert result["path"].endswith("build_model.py")


def test_rejects_net_json_path():
    code, out = run_script("/tmp/foo.net.json")
    assert code == 1
    result = json.loads(out)
    assert result["ok"] is False
    assert ".net.json" in result["error"]


def test_rejects_duplicate_file():
    with tempfile.TemporaryDirectory() as tmp:
        target = os.path.join(tmp, "exists.py")
        # Pre-create the file
        open(target, "w").close()
        code, out = run_script(target)
        assert code == 1
        result = json.loads(out)
        assert result["ok"] is False
        assert "already exists" in result["error"]


def test_rejects_missing_parent_directory():
    with tempfile.TemporaryDirectory() as tmp:
        target = os.path.join(tmp, "nonexistent_subdir", "build.py")
        code, out = run_script(target)
        assert code == 1
        result = json.loads(out)
        assert result["ok"] is False
        assert "Parent directory does not exist" in result["error"]


def test_handles_unwritable_directory_gracefully():
    with tempfile.TemporaryDirectory() as tmp:
        target = os.path.join(tmp, "nope.py")
        # Make directory read-only
        os.chmod(tmp, 0o500)
        try:
            code, out = run_script(target)
            assert code == 1
            result = json.loads(out)
            assert result["ok"] is False
            assert "Cannot write" in result["error"] or "Permission" in result["error"]
        finally:
            os.chmod(tmp, 0o700)


def test_workspace_check_allows_in_workspace():
    with tempfile.TemporaryDirectory() as tmp:
        target = os.path.join(tmp, "allowed.py")
        code, out = run_script(target, "--workspace", tmp)
        assert code == 0
        result = json.loads(out)
        assert result["ok"] is True
        assert os.path.exists(result["path"])


def test_workspace_check_rejects_outside_workspace():
    with tempfile.TemporaryDirectory() as ws:
        # Target is outside the workspace
        target = "/tmp/should_be_rejected.py"
        code, out = run_script(target, "--workspace", ws)
        assert code == 1
        result = json.loads(out)
        assert result["ok"] is False
        assert "outside workspace" in result["error"]


def test_workspace_check_nullifies_traversal():
    """../ escapes should be neutralized by realpath."""
    with tempfile.TemporaryDirectory() as ws:
        # Attempt to escape the workspace via ../
        target = os.path.join(ws, "..", "escape.py")
        code, out = run_script(target, "--workspace", ws)
        assert code == 1
        result = json.loads(out)
        assert result["ok"] is False
        assert "outside workspace" in result["error"]


def test_skip_workspace_check_when_not_provided():
    """Without --workspace, any path should work (test env backwards compat)."""
    with tempfile.TemporaryDirectory() as tmp:
        target = os.path.join(tmp, "anywhere.py")
        code, out = run_script(target)
        assert code == 0
        result = json.loads(out)
        assert result["ok"] is True
