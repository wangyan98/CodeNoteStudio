#!/usr/bin/env python3
"""Set (or clear) the derivesFrom parent of a step, with cycle detection."""
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import load_derive, save_derive, resolve_path


def get_descendants(nodes, node_id):
    """Collect all descendant IDs of node_id."""
    children_of = {}
    for n in nodes:
        key = n.derivesFrom if n.derivesFrom else '__root__'
        children_of.setdefault(key, []).append(n)

    desc = set()
    stack = [node_id]
    while stack:
        cur = stack.pop()
        for child in children_of.get(cur, []):
            if child.id not in desc:
                desc.add(child.id)
                stack.append(child.id)
    return desc


def sync_derives_to(nodes):
    for n in nodes:
        n.derivesTo = [other.id for other in nodes if other.derivesFrom == n.id]


def main():
    parser = argparse.ArgumentParser(description="Set or clear a step's derivesFrom parent")
    parser.add_argument("path", help="Path to the .derive.json file")
    parser.add_argument("step_id", help="ID of the step")
    parser.add_argument("parent_id", help="ID of the parent step, or 'null' to make it a root")
    args = parser.parse_args()

    args.path = resolve_path(args.path, ".derive.json")
    parent_id = None if args.parent_id == "null" else args.parent_id

    doc = load_derive(args.path)
    node = next((n for n in doc.nodes if n.id == args.step_id), None)
    if node is None:
        print(json.dumps({"ok": False, "error": f"Step not found: {args.step_id}"}))
        sys.exit(1)

    if parent_id is not None:
        if args.step_id == parent_id:
            print(json.dumps({"ok": False, "error": "Cannot set self as parent (self-link)"}))
            sys.exit(1)

        if not any(n.id == parent_id for n in doc.nodes):
            print(json.dumps({"ok": False, "error": f"Parent step not found: {parent_id}"}))
            sys.exit(1)

        descendants = get_descendants(doc.nodes, args.step_id)
        if parent_id in descendants:
            print(json.dumps({"ok": False, "error": "Cycle detected: parent is a descendant of this step"}))
            sys.exit(1)

    node.derivesFrom = parent_id
    sync_derives_to(doc.nodes)
    save_derive(args.path, doc)
    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
