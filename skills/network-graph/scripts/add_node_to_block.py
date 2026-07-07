#!/usr/bin/env python3
"""Move a node into a block's children."""
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import load_network, save_network


def find_block_in_tree(nodes, block_id):
    """Recursively find a block node by id."""
    for n in nodes:
        if n.id == block_id and n.kind == "block":
            return n
        if n.children:
            found = find_block_in_tree(n.children, block_id)
            if found:
                return found
    return None


def find_node_in_tree(nodes, node_id):
    """Recursively find any node by id anywhere in the tree."""
    for n in nodes:
        if n.id == node_id:
            return n
        if n.children:
            found = find_node_in_tree(n.children, node_id)
            if found:
                return found
    return None


def remove_node_from_tree(nodes, node_id):
    """Recursively remove a node by id. Returns True if removed."""
    for i, n in enumerate(nodes):
        if n.id == node_id:
            nodes.pop(i)
            return True
        if n.children:
            if remove_node_from_tree(n.children, node_id):
                return True
    return False


def main():
    parser = argparse.ArgumentParser(description="Move a node into a block")
    parser.add_argument("path", help="Path to the .net.json file")
    parser.add_argument("block_id", help="ID of the block node")
    parser.add_argument("node_id", help="ID of the node to move")
    args = parser.parse_args()

    doc = load_network(args.path)
    block = find_block_in_tree(doc.nodes, args.block_id)
    if block is None:
        print(json.dumps({"ok": False, "error": f"Block not found: {args.block_id}"}))
        sys.exit(1)

    target = find_node_in_tree(doc.nodes, args.node_id)
    if target is None:
        print(json.dumps({"ok": False, "error": f"Node not found: {args.node_id}"}))
        sys.exit(1)

    # Remove from current position
    remove_node_from_tree(doc.nodes, args.node_id)

    if block.children is None:
        block.children = []
    block.children.append(target)
    save_network(args.path, doc)
    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
