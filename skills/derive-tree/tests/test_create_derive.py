import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import read_json


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "create_derive.py"), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip()


def test_creates_empty_derive():
    with tempfile.TemporaryDirectory() as tmp:
        name = os.path.join(tmp, "test")
        code, out = run_script(name)
        assert code == 0
        result = json.loads(out)
        assert result["ok"] is True
        path = result["path"]
        data = read_json(path)
        assert data["type"] == "derive"
        assert data["version"] == 1
        assert data["nodes"] == []


def test_creates_parent_directory():
    with tempfile.TemporaryDirectory() as tmp:
        name = os.path.join(tmp, "a", "b", "test")
        code, out = run_script(name)
        assert code == 0
        result = json.loads(out)
        assert os.path.isfile(result["path"])
