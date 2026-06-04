import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import save_network, load_network
from lib.schemas import create_network_document

def run_script(*args):
    result = subprocess.run([sys.executable, str(SCRIPTS / "add_block.py"), *args], capture_output=True, text=True)
    return result.returncode, result.stdout.strip()

def test_creates_block():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.net.json")
        doc = create_network_document()
        save_network(path, doc)
        code, out = run_script(path, "ResBlock", "--repeat", "3")
        assert code == 0
        result = json.loads(out)
        assert result["ok"] is True
        loaded = load_network(path)
        blocks = [n for n in loaded.nodes if n.kind == "block"]
        assert len(blocks) == 1
        assert blocks[0].label == "ResBlock"
        assert blocks[0].repeat == 3
