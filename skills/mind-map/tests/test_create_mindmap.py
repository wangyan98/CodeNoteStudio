import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import read_json


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "create_mindmap.py"), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def test_creates_valid_mindmap():
    with tempfile.TemporaryDirectory() as tmp:
        name = os.path.join(tmp, "test")
        code, out, err = run_script(name)
        assert code == 0, f"stderr: {err}"
        result = json.loads(out)
        assert result["ok"] is True
        assert "id" in result
        path = result["path"]
        data = read_json(path)
        assert data["type"] == "mind"
        assert data["version"] == 1
        assert data["root"]["title"] == "New Mind Map"


def test_idempotent_on_existing():
    with tempfile.TemporaryDirectory() as tmp:
        name = os.path.join(tmp, "test")
        run_script(name)
        code, out, err = run_script(name)
        assert code == 0
        result = json.loads(out)
        assert result["ok"] is True


def test_creates_parent_directory():
    with tempfile.TemporaryDirectory() as tmp:
        name = os.path.join(tmp, "sub", "nested", "test")
        code, out, err = run_script(name)
        assert code == 0
        result = json.loads(out)
        assert os.path.isfile(result["path"])
