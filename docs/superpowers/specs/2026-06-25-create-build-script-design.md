# Create Build Script — Network Graph Skill Extension

Date: 2026-06-25
Status: Design — approved

## Goal

When an Agent reads `scripts/build_yolov5n.py` (or similar build scripts) and wants to write a new network-graph build script, provide a tool to scaffold the script **and** constrain Agent behavior so scripts are created, executed, and produce output exclusively within the workspace directory.

## Problem

`skills/network-graph/SKILL.md` tells the Agent it may write generator scripts like `scripts/build_*.py`, but:

1. **No create-file tool** — the existing CRUD scripts (create_network, add_layer, delete_node, etc.) don't include a "scaffold a new build script" operation. The Agent has no guided way to create one.
2. **No workspace constraint** — nothing tells the Agent that new scripts must live in workspace, execute in workspace, and output in workspace. PermissionGuard enforces this at the filesystem level, but the Agent needs behavioral guidance too.

## Decisions

| Concern | Decision |
|---------|----------|
| Approach | Both: update SKILL.md instructions + add `create_build_script.py` |
| Script execution | Agent runs `python <script>` manually in workspace (Bash tool). Python-only — no shell scripts or binaries. |
| Template content | Empty skeleton with standard imports, argparse, and `main()` structure |
| Path specification | Agent passes full absolute path + `--workspace <path>`. Script does inline `realpath` check against workspace. |
| PermissionGuard integration | Not imported — script runs as a subprocess. Inline `os.path.realpath` prefix check is self-contained. |
| New run tool | None — no `run_build_script.py`. Agent uses Bash directly. |

## §1 SKILL.md changes

In `skills/network-graph/SKILL.md`, under "Critical rules", replace the current build-script bullet:

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
  with `scripts/create_build_script.py <full-path>` and then edit them. Build
  scripts programmatically call the existing CRUD scripts to produce a .net.json.
  This is the preferred approach for large architectures.
  → All build scripts MUST be created in the workspace directory (not inside
    skills/network-graph/scripts/).
  → Execute them with `python <script-path> <output-path>`. Only Python scripts
    are allowed — do NOT create or execute shell scripts, binaries, or other
    executable types.
  → Output `.net.json` files must also land in the workspace.
  → PermissionGuard enforces these boundaries; violations return an error.
```

Add a row to the Scripts table:

```
| `scripts/create_build_script.py <path>` | Scaffold a new build script in workspace |
```

## §2 `create_build_script.py`

### §2.1 CLI interface

```bash
python skills/network-graph/scripts/create_build_script.py /absolute/path/to/workspace/build_my_model.py --workspace /absolute/path/to/workspace
```

- `path` (positional, required): full absolute path for the new script.
- `--workspace` (required): workspace root directory — used to validate that `path` falls within it.

### §2.2 Behavior

1. **Path suffix normalisation** — if `path` doesn't end with `.py`, append `.py` automatically.
2. **Reject `.net.json` paths** — if the path ends with `.net.json`, reject with an error (this is a script scaffold tool, not a network file creator).
3. **Workspace zone check** — resolve both `path` and `--workspace` via `os.path.realpath()`. If `path` does not start with `workspace + os.sep` (and is not equal to workspace itself), reject with `{"ok": false, "error": "Permission denied: '<path>' is outside workspace"}`.
4. **Deduplication** — if the target file already exists, return `{"ok": false, "error": "File already exists: <path>"}`. Never overwrite.
5. **Parent directory check** — if the parent directory doesn't exist, return `{"ok": false, "error": "Parent directory does not exist: <dir>"}`. Do not auto-create directories.
6. **Write skeleton** — write the template (see §2.3) to the target path.
7. **Output JSON** — print `{"ok": true, "path": "<resolved-absolute-path>"}` on success.

### §2.3 Skeleton template

```python
#!/usr/bin/env python3
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
```

Design decisions:
- `--name` defaults to `"MyNetwork"` (a readable generic, not the script filename — avoids coupling to path).
- `argparse` mirrors `build_yolov5n.py`'s convention so generated scripts feel familiar.
- The `sys.path.insert` line assumes the script lives in workspace (two levels up from `lib/`). This holds because `lib/` is at the project root and workspace is typically a subdirectory — but if workspace is deeper, the Agent adjusts this line after scaffolding.

### §2.4 Workspace path validation

The script runs as a standalone subprocess — it does NOT import `PermissionGuard` from the server. Instead, it performs a lightweight inline check:

```python
workspace = os.path.realpath(args.workspace)
target = os.path.realpath(args.path)
if target != workspace and not target.startswith(workspace + os.sep):
    print(json.dumps({
        "ok": False,
        "error": f"Permission denied: '{args.path}' is outside workspace",
    }))
    sys.exit(1)
```

This follows the same `realpath` → prefix-match pattern as PermissionGuard (see `2026-06-25-agent-permission-system-design.md §2.2`), but self-contained within the script. No import dependency on the server process.

When `--workspace` is not provided (test environments, manual invocation):
- Skip the check — allow creation. This preserves backward compatibility for tests.

### §2.5 Error handling summary

| Scenario | Result |
|----------|--------|
| Path outside workspace | `{"ok": false, "error": "Permission denied: ..."}` |
| File already exists | `{"ok": false, "error": "File already exists: <path>"}` |
| Path ends with `.net.json` | `{"ok": false, "error": "Path must be a .py file, not .net.json"}` |
| Parent directory missing | `{"ok": false, "error": "Parent directory does not exist: <dir>"}` |
| `--workspace` not provided (test) | Skip check, proceed normally |
| Success | `{"ok": true, "path": "<absolute-path>"}` |

## §3 What this does NOT cover

- **No `run_build_script.py`** — execution is manual via `python <script>`. The Agent uses Bash.
- **No template variants** — one skeleton only. If the Agent wants a different structure, it edits the scaffolded file.
- **No changes to existing CRUD scripts** — `create_network.py`, `add_layer.py`, etc. are untouched.
- **No changes to PermissionGuard** — path validation is inline within the script (see §2.4). No import or dependency on the server-side PermissionGuard class.
- **No auto-creation of parent directories** — the Agent must create the directory structure first if needed (via `create_folder` or equivalent).

## §4 Execution flow (Agent perspective)

```
Agent reads build_yolov5n.py
       │
       ▼
Agent calls: create_build_script.py /workspace/build_new_model.py --workspace /workspace
       │
       ▼ (inline realpath check validates workspace zone)
Script returns: {"ok": true, "path": "/workspace/build_new_model.py"}
       │
       ▼
Agent edits the scaffolded file (fill in nodes/edges)
       │
       ▼
Agent runs: python /workspace/build_new_model.py /workspace/output.net.json
       │
       ▼ (output.net.json lands in workspace)
Done
```

## §5 Testing strategy

| Test type | What | File |
|-----------|------|------|
| Unit: skeleton generation | Skeleton file written with expected content, correct permissions | `skills/network-graph/tests/test_create_build_script.py` (new) |
| Unit: path normalisation | Input without `.py` → `.py` appended; `.net.json` rejected; already-exists rejected | Same file |
| Unit: workspace zone check | In-workspace path → allowed; outside-workspace path → denied; `--workspace` missing → skip check | Same file |
| Integration | Full flow: scaffold → edit → execute → produces valid .net.json | `skills/network-graph/tests/test_network_integration.py` (modified) |
