#!/usr/bin/env python3
"""Delete a step from a .derive.json document."""
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import load_derive, save_derive, resolve_path


def recalc(nodes):
    for i, n in enumerate(nodes):
        n.stepNumber = i + 1


def sync_derives_to(nodes):
    for n in nodes:
        n.derivesTo = [other.id for other in nodes if other.derivesFrom == n.id]


def main():
    parser = argparse.ArgumentParser(description="Delete a step from a derivation tree")
    parser.add_argument("path", help="Path to the .derive.json file")
    parser.add_argument("step_id", help="ID of the step to delete")
    args = parser.parse_args()

    args.path = resolve_path(args.path, ".derive.json")

    doc = load_derive(args.path)
    target = next((n for n in doc.nodes if n.id == args.step_id), None)
    if target is None:
        print(json.dumps({"ok": False, "error": f"Step not found: {args.step_id}"}))
        sys.exit(1)

    doc.nodes = [n for n in doc.nodes if n.id != args.step_id]
    # orphan children
    for n in doc.nodes:
        if n.derivesFrom == args.step_id:
            n.derivesFrom = None

    recalc(doc.nodes)
    sync_derives_to(doc.nodes)
    save_derive(args.path, doc)
    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
