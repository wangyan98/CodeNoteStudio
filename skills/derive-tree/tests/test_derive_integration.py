import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import load_derive


def run(cmd, *args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / cmd), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip()


def test_full_workflow():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")

        # Create
        run("create_derive.py", path)

        # Add steps
        run("add_step.py", path, "--title", "Problem Setup")
        run("add_step.py", path, "--title", "Derivation")
        run("add_step.py", path, "--title", "Result")
        code, out = run("add_step.py", path, "--after-step", "1", "--title", "Assumptions")

        # Link chain: Assumptions -> Problem -> Derivation -> Result
        loaded = load_derive(path)
        s_ids = {n.title: n.id for n in loaded.nodes}
        run("set_derives_from.py", path, s_ids["Problem Setup"], s_ids["Assumptions"])
        run("set_derives_from.py", path, s_ids["Derivation"], s_ids["Problem Setup"])
        run("set_derives_from.py", path, s_ids["Result"], s_ids["Derivation"])

        # Verify chain
        loaded = load_derive(path)
        result_node = next(n for n in loaded.nodes if n.title == "Result")
        deriv_node = next(n for n in loaded.nodes if n.title == "Derivation")
        assert result_node.derivesFrom == deriv_node.id

        # Update content
        run("update_step.py", path, s_ids["Derivation"], "--content", "## Proof\n\n...")

        # Delete middle step
        run("delete_step.py", path, s_ids["Problem Setup"])
        loaded = load_derive(path)
        assert len(loaded.nodes) == 3
        # Verify Derivation was orphaned
        deriv_node = next(n for n in loaded.nodes if n.title == "Derivation")
        assert deriv_node.derivesFrom is None
