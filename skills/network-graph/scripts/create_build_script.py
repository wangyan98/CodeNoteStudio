#!/usr/bin/env python3
"""Scaffold a new network-graph build script in the workspace."""
import argparse, json, os, sys

SKELETON = """#!/usr/bin/env python3
\"\"\"
Build script — scaffolded by network-graph skill.
\"\"\"
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
