#!/usr/bin/env python3
"""Delete a node (and its subtree) from a mind map."""
import argparse, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import load_mindmap, save_mindmap, resolve_path
from lib.schemas import MindMapNode, create_mindmap_document


def remove_from_parent(parent: MindMapNode, target_id: str) -> bool:
    for i, child in enumerate(parent.children):
        if child.id == target_id:
            parent.children.pop(i)
            return True
        if remove_from_parent(child, target_id):
            return True
    return False


def main():
    parser = argparse.ArgumentParser(description="Delete a node from a mind map")
    parser.add_argument("path", help="Path to the .mind.json file")
    parser.add_argument("node_id", help="ID of the node to delete")
    args = parser.parse_args()

    args.path = resolve_path(args.path, ".mind.json")

    doc = load_mindmap(args.path)

    if doc.root.id == args.node_id:
        new_doc = create_mindmap_document()
        save_mindmap(args.path, new_doc)
        print(json.dumps({"ok": True}))
        return

    removed = remove_from_parent(doc.root, args.node_id)
    if not removed:
        print(json.dumps({"ok": False, "error": f"Node not found: {args.node_id}"}))
        sys.exit(1)

    save_mindmap(args.path, doc)
    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
