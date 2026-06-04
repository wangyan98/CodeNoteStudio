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
        path = os.path.join(tmp, "test.net.json")
        code, out = run_script(path)
        assert code == 0
        result = json.loads(out)
        assert result["ok"] is True
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
        path = os.path.join(tmp, "test.net.json")
        code, out = run_script(path, "--name", "ResNet50")
        assert code == 0
        data = read_json(path)
        assert data["name"] == "ResNet50"
