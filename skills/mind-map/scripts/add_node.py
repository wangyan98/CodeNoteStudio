#!/usr/bin/env python3
"""Add a child node to a mind map tree."""
import argparse
import json
import os
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import load_mindmap, save_mindmap
from lib.schemas import MindMapNode


def find_node(node: MindMapNode, node_id: str) -> MindMapNode | None:
    if node.id == node_id:
        return node
    for child in node.children:
        found = find_node(child, node_id)
        if found:
            return found
    return None


def main():
    parser = argparse.ArgumentParser(description="Add a child node to a mind map")
    parser.add_argument("path", help="Path to the .mind.json file")
    parser.add_argument("parent_id", help="ID of the parent node")
    parser.add_argument("--title", default="New Node")
    parser.add_argument("--content", default="")
    args = parser.parse_args()

    if not os.path.exists(args.path):
        print(json.dumps({"ok": False, "error": f"File not found: {args.path}"}))
        sys.exit(1)

    doc = load_mindmap(args.path)
    parent = find_node(doc.root, args.parent_id)
    if parent is None:
        print(json.dumps({"ok": False, "error": f"Parent node not found: {args.parent_id}"}))
        sys.exit(1)

    new_node = MindMapNode(id=str(uuid.uuid4()), title=args.title, content=args.content)
    parent.children.append(new_node)
    save_mindmap(args.path, doc)
    print(json.dumps({"ok": True, "id": new_node.id}))


if __name__ == "__main__":
    main()
