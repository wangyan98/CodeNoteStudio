# Create Build Script — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `create_build_script.py` scaffold tool to the network-graph skill that creates build-script skeletons in the workspace with inline path validation, and update SKILL.md with workspace constraints.

**Architecture:** One standalone CLI script (`create_build_script.py`) with no server imports — uses `os.path.realpath()` for inline workspace zone validation. SKILL.md gets updated critical-rules and script-table entries. Tests follow the existing `subprocess.run` / `tempfile` pattern.

**Tech Stack:** Python 3, argparse, os.path.realpath, subprocess (tests only)

## Global Constraints

- All build scripts MUST be created in the workspace directory
- Only Python scripts are allowed — no shell scripts or binaries
- Output `.net.json` files must land in workspace
- `create_build_script.py` must NOT import from the Agent server process (PermissionGuard etc.)
- Tests use `subprocess.run` + `tempfile.TemporaryDirectory` (matching existing test patterns in `skills/network-graph/tests/`)

---

## File Structure

| File | Responsibility |
|------|---------------|
| **Create** `skills/network-graph/scripts/create_build_script.py` | CLI scaffold tool: path validation, workspace check, skeleton generation |
| **Modify** `skills/network-graph/SKILL.md` | Update critical rules and script table with workspace constraints |
| **Create** `skills/network-graph/tests/test_create_build_script.py` | Unit tests for all scenarios: success, .net.json rejection, .py suffix, workspace zone check, duplicate rejection, missing parent |
| **Modify** `skills/network-graph/tests/test_network_integration.py` | Integration test: scaffold → edit → execute → valid .net.json |

---

### Task 1: Update SKILL.md with workspace constraints

**Files:**
- Modify: `skills/network-graph/SKILL.md:12-14` (critical rules bullet), `skills/network-graph/SKILL.md:112-123` (scripts table)

**Interfaces:**
- Consumes: nothing (doc-only)
- Produces: updated SKILL.md with workspace rules that later tasks reference

- [ ] **Step 1: Replace the build-scripts bullet in Critical Rules**

Replace lines 12-14 of `skills/network-graph/SKILL.md`:

**Before:**
```
- **Writing build scripts is allowed.** You MAY directly write generator scripts 
  like `scripts/build_*.py` that programmatically call the existing CRUD scripts 
  (create/add_layer/add_connection/...) to produce a .net.json. This is the 
  preferred approach for large architectures.
```

**After:**
```
- **Writing build scripts is allowed.** You MAY scaffold new generator scripts
  with `scripts/create_build_script.py <full-path> --workspace <workspace-path>`
  and then edit them. Build scripts programmatically call the existing CRUD
  scripts to produce a .net.json. This is the preferred approach for large
  architectures.
  → All build scripts MUST be created in the workspace directory (not inside
    skills/network-graph/scripts/).
  → Execute them with `python <script-path> <output-path>`. Only Python scripts
    are allowed — do NOT create or execute shell scripts, binaries, or other
    executable types.
  → Output `.net.json` files must also land in the workspace.
```

- [ ] **Step 1b: Add `create_build_script.py` row to Scripts table**

After the `build_yolov5n.py` row (line ~123), add:

```
| `scripts/create_build_script.py <path> --workspace <dir>` | Scaffold a new build script in workspace |
```

- [ ] **Step 2: Verify the change reads correctly**

```bash
grep -A 8 "Writing build scripts" skills/network-graph/SKILL.md
```

Expected output: the new bullet text including workspace constraints and `create_build_script.py` reference.

- [ ] **Step 3: Commit**

```bash
git add skills/network-graph/SKILL.md
git commit -m "docs: add create_build_script.py to network-graph SKILL.md with workspace constraints"
```

---

### Task 2: Create `create_build_script.py`

**Files:**
- Create: `skills/network-graph/scripts/create_build_script.py`

**Interfaces:**
- Consumes: nothing (standalone script, no server imports)
- Produces:
  - CLI: `python create_build_script.py <path> [--workspace <dir>]`
  - On success prints `{"ok": true, "path": "<absolute-path>"}` to stdout
  - On error prints `{"ok": false, "error": "<message>"}` to stdout and exits with code 1

- [ ] **Step 1: Write the script**

```python
#!/usr/bin/env python3
"""Scaffold a new network-graph build script in the workspace."""
import argparse, json, os, sys

SKELETON = """#!/usr/bin/env python3
"""
Build script — scaffolded by network-graph skill.
"""
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import save_network
from lib.schemas import GraphNode, GraphEdge, NetworkDocument


def main():
    parser = argparse.ArgumentParser(description="Build a .net.json network graph")
    parser.add_argument("path", help="Output path for .net.json file")
    parser.add_argument("--name", default="MyNetwork", help="Network name")
    args = parser.parse_args()

    # TODO: define nodes and edges here
    nodes = []
    edges = []

    doc = NetworkDocument(name=args.name, nodes=nodes, edges=edges)
    path = args.path
    if not path.endswith(".net.json"):
        path += ".net.json"
    save_network(path, doc)
    print(json.dumps({"ok": True, "path": path}, indent=2))


if __name__ == "__main__":
    main()
"""


def main():
    parser = argparse.ArgumentParser(
        description="Scaffold a new network-graph build script"
    )
    parser.add_argument(
        "path", help="Full absolute path for the new script"
    )
    parser.add_argument(
        "--workspace", default=None,
        help="Workspace root directory for path validation"
    )
    args = parser.parse_args()

    path = args.path

    # 1. Reject .net.json paths
    if path.endswith(".net.json"):
        print(json.dumps({
            "ok": False,
            "error": "Path must be a .py file, not .net.json",
        }))
        sys.exit(1)

    # 2. Suffix normalisation — append .py if missing
    if not path.endswith(".py"):
        path += ".py"

    # 3. Workspace zone check (when --workspace provided)
    if args.workspace:
        workspace = os.path.realpath(args.workspace)
        resolved = os.path.realpath(path)
        if resolved != workspace and not resolved.startswith(workspace + os.sep):
            print(json.dumps({
                "ok": False,
                "error": f"Permission denied: '{args.path}' is outside workspace",
            }))
            sys.exit(1)
        path = resolved
    else:
        path = os.path.realpath(path)

    # 4. Deduplication — reject if file already exists
    if os.path.exists(path):
        print(json.dumps({
            "ok": False,
            "error": f"File already exists: {path}",
        }))
        sys.exit(1)

    # 5. Parent directory check
    parent = os.path.dirname(path)
    if not os.path.isdir(parent):
        print(json.dumps({
            "ok": False,
            "error": f"Parent directory does not exist: {parent}",
        }))
        sys.exit(1)

    # 6. Write skeleton
    with open(path, "w") as f:
        f.write(SKELETON)

    # 7. Output JSON
    print(json.dumps({"ok": True, "path": path}))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Smoke test — scaffold a script without --workspace**

```bash
python skills/network-graph/scripts/create_build_script.py /tmp/test_build_script.py
```

Expected: `{"ok": true, "path": "/tmp/test_build_script.py"}`

- [ ] **Step 3: Smoke test — verify skeleton content**

```bash
head -5 /tmp/test_build_script.py
```

Expected: first 5 lines match the SKELETON template.

- [ ] **Step 4: Smoke test — .net.json rejection**

```bash
python skills/network-graph/scripts/create_build_script.py /tmp/test.net.json
```

Expected: `{"ok": false, "error": "Path must be a .py file, not .net.json"}`

- [ ] **Step 5: Clean up smoke test artifact**

```bash
rm /tmp/test_build_script.py
```

- [ ] **Step 6: Commit**

```bash
git add skills/network-graph/scripts/create_build_script.py
git commit -m "feat: add create_build_script.py scaffold tool with workspace validation"
```

---

### Task 3: Unit tests for `create_build_script.py`

**Files:**
- Create: `skills/network-graph/tests/test_create_build_script.py`

**Interfaces:**
- Consumes: `skills/network-graph/scripts/create_build_script.py` (via subprocess)
- Produces: test coverage for success path, .net.json rejection, .py suffix auto-append, workspace zone check, duplicate rejection, missing parent directory

- [ ] **Step 1: Write the test file**

```python
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
    code, out = run_script("/tmp/nonexistent_dir_xyz/build.py")
    assert code == 1
    result = json.loads(out)
    assert result["ok"] is False
    assert "Parent directory does not exist" in result["error"]


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
```

- [ ] **Step 2: Run tests to verify they fail (script exists but tests are new)**

```bash
python -m pytest skills/network-graph/tests/test_create_build_script.py -v
```

Expected: 9 tests collected, all PASS (the script already exists from Task 2, so tests should pass immediately).

- [ ] **Step 3: Commit**

```bash
git add skills/network-graph/tests/test_create_build_script.py
git commit -m "test: add unit tests for create_build_script.py"
```

---

### Task 4: Integration test — scaffold → edit → execute

**Files:**
- Modify: `skills/network-graph/tests/test_network_integration.py` (append new test function)

**Interfaces:**
- Consumes: `skills/network-graph/scripts/create_build_script.py`, `skills/network-graph/scripts/create_network.py`, `skills/network-graph/scripts/add_layer.py`
- Produces: end-to-end test verifying a scaffolded script can be edited and executed to produce a valid .net.json

- [ ] **Step 1: Add the integration test function**

Append to `skills/network-graph/tests/test_network_integration.py`:

```python
def test_scaffold_edit_execute_flow():
    """Full flow: scaffold a build script, edit it, execute → valid .net.json."""
    with tempfile.TemporaryDirectory() as tmp:
        # Step 1: Scaffold a build script
        script_path = os.path.join(tmp, "build_test.py")
        code, out = run("create_build_script.py", script_path)
        assert code == 0
        scaffold_result = json.loads(out)
        assert scaffold_result["ok"] is True
        actual_script_path = scaffold_result["path"]

        # Step 2: Rewrite the script with real network logic
        # The scaffold's sys.path won't work from a tempdir, so fix it
        # and replace the TODO block with direct GraphNode/GraphEdge construction
        project_root = str(Path(__file__).resolve().parents[2])
        new_content = f'''#!/usr/bin/env python3
"""Build script for integration test."""
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, {project_root!r})
from lib.file_utils import save_network, load_network
from lib.schemas import GraphNode, GraphEdge, NetworkDocument


def main():
    parser = argparse.ArgumentParser(description="Build a .net.json network graph")
    parser.add_argument("path", help="Output path for .net.json file")
    parser.add_argument("--name", default="MyNetwork", help="Network name")
    args = parser.parse_args()

    input_node = GraphNode(id="i1", kind="input", label="Input",
                           inputShape="3x640x640")
    conv1 = GraphNode(id="l1", kind="layer", label="conv1",
                      layerType="Conv2d",
                      params={{"in_channels": 3, "out_channels": 16, "kernel_size": 3}},
                      inputShape="3x640x640", outputShape="16x320x320")
    relu1 = GraphNode(id="l2", kind="layer", label="relu1",
                      layerType="ReLU",
                      inputShape="16x320x320", outputShape="16x320x320")
    output_node = GraphNode(id="o1", kind="output", label="Output")

    nodes = [input_node, conv1, relu1, output_node]
    edges = [
        GraphEdge(id="e1", source="i1", target="l1", style="forward"),
        GraphEdge(id="e2", source="l1", target="l2", style="forward"),
        GraphEdge(id="e3", source="l2", target="o1", style="forward"),
    ]

    doc = NetworkDocument(name=args.name, nodes=nodes, edges=edges)
    path = args.path
    if not path.endswith(".net.json"):
        path += ".net.json"
    save_network(path, doc)

    net = load_network(path)
    print(json.dumps({{
        "ok": True,
        "path": path,
        "nodeCount": len(net.nodes),
        "edgeCount": len(net.edges),
    }}, indent=2))


if __name__ == "__main__":
    main()
'''

        with open(actual_script_path, "w") as f:
            f.write(new_content)

        # Step 3: Execute the edited build script
        output_path = os.path.join(tmp, "output.net.json")
        result = subprocess.run(
            [sys.executable, actual_script_path, output_path, "--name", "TestNet"],
            capture_output=True, text=True,
        )
        assert result.returncode == 0
        exec_result = json.loads(result.stdout.strip())
        assert exec_result["ok"] is True
        assert exec_result["nodeCount"] == 4  # input + conv1 + relu1 + output
        assert exec_result["edgeCount"] == 3  # input→conv1, conv1→relu1, relu1→output
```

- [ ] **Step 2: Run the integration test**

```bash
python -m pytest skills/network-graph/tests/test_network_integration.py::test_scaffold_edit_execute_flow -v
```

Expected: 1 test collected, PASS. The scaffolded script is created, edited to delegate to CRUD scripts, executed, and produces a valid .net.json with 4 nodes and 3 edges.

- [ ] **Step 3: Run all network-graph tests to check for regressions**

```bash
python -m pytest skills/network-graph/tests/ -v
```

Expected: all existing tests still PASS, plus the new `test_scaffold_edit_execute_flow` and all `test_create_build_script` tests.

- [ ] **Step 4: Commit**

```bash
git add skills/network-graph/tests/test_network_integration.py
git commit -m "test: add scaffold→edit→execute integration test for create_build_script"
```
