import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"

def run(cmd, *args):
    result = subprocess.run([sys.executable, str(SCRIPTS / cmd), *args], capture_output=True, text=True)
    return result.returncode, result.stdout.strip()

def test_full_workflow():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")

        run("create_md.py", path, "--title", "Network Architecture")

        run("append_section.py", path, "Layers", "- Conv2d: 3x64x7x7\n- BatchNorm\n- ReLU")
        run("append_section.py", path, "Training", "- Optimizer: Adam\n- LR: 0.001")
        run("append_section.py", path, "Results", "- Top-1: 76.2%")

        content = open(path).read()
        assert "## Layers" in content
        assert "## Training" in content
        assert "## Results" in content

        run("replace_section.py", path, "Results", "- Top-1: 78.1%\n- Top-5: 93.4%")
        content = open(path).read()
        assert "78.1%" in content
        assert "76.2%" not in content

        assert "## Training" in content
        assert "Adam" in content
