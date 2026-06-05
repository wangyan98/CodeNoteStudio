import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import read_json

def run_script(*args):
    result = subprocess.run([sys.executable, str(SCRIPTS / "create_network.py"), *args], capture_output=True, text=True)
    return result.returncode, result.stdout.strip()

def test_creates_default_network():
    with tempfile.TemporaryDirectory() as tmp:
        name = os.path.join(tmp, "test")
        code, out = run_script(name)
        assert code == 0
        result = json.loads(out)
        assert result["ok"] is True
        path = result["path"]
        data = read_json(path)
        assert data["type"] == "net"
        assert data["version"] == 2
        assert len(data["nodes"]) == 2
        kinds = [n["kind"] for n in data["nodes"]]
        assert "input" in kinds
        assert "output" in kinds
        assert len(data["edges"]) == 1

def test_creates_with_custom_name():
    with tempfile.TemporaryDirectory() as tmp:
        name = os.path.join(tmp, "test")
        code, out = run_script(name, "--title", "ResNet50")
        assert code == 0
        result = json.loads(out)
        path = result["path"]
        data = read_json(path)
        assert data["name"] == "ResNet50"
