#!/usr/bin/env python3
"""Add a block node to a .net.json document."""
import argparse, json, sys, uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import load_network, save_network, resolve_path
from lib.schemas import GraphNode


def find_block_in_tree(nodes, block_id):
    """Recursively find a block node by id."""
    for n in nodes:
        if n.id == block_id:
            return n
        if n.children:
            found = find_block_in_tree(n.children, block_id)
            if found:
                return found
    return None


def main():
    parser = argparse.ArgumentParser(description="Add a block to a network graph")
    parser.add_argument("path", help="Path to the .net.json file")
    parser.add_argument("name", help="Block name")
    parser.add_argument("--repeat", type=int, default=None, help="Repeat count")
    parser.add_argument("--direction", choices=["horizontal", "vertical"],
                        default=None, help="Block layout direction")
    parser.add_argument("--parent", default=None, help="Parent block ID (for nested blocks)")
    args = parser.parse_args()

    args.path = resolve_path(args.path, ".net.json")

    doc = load_network(args.path)
    block = GraphNode(
        id=str(uuid.uuid4()), kind="block", label=args.name,
        repeat=args.repeat, children=[], direction=args.direction
    )

    if args.parent:
        parent = find_block_in_tree(doc.nodes, args.parent)
        if parent is None:
            print(json.dumps({"ok": False, "error": f"Parent block not found: {args.parent}"}))
            sys.exit(1)
        if parent.children is None:
            parent.children = []
        parent.children.append(block)
    else:
        doc.nodes.append(block)

    save_network(args.path, doc)
    print(json.dumps({"ok": True, "id": block.id, "parentId": args.parent}))


if __name__ == "__main__":
    main()
