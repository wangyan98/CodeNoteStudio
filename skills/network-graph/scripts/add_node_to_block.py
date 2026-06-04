#!/usr/bin/env python3
"""Move a node into a block's children."""
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import load_network, save_network

def main():
    parser = argparse.ArgumentParser(description="Move a node into a block")
    parser.add_argument("path", help="Path to the .net.json file")
    parser.add_argument("block_id", help="ID of the block node")
    parser.add_argument("node_id", help="ID of the node to move")
    args = parser.parse_args()

    doc = load_network(args.path)
    block = next((n for n in doc.nodes if n.id == args.block_id), None)
    if block is None or block.kind != "block":
        print(json.dumps({"ok": False, "error": f"Block not found: {args.block_id}"}))
        sys.exit(1)

    target = next((n for n in doc.nodes if n.id == args.node_id), None)
    if target is None:
        print(json.dumps({"ok": False, "error": f"Node not found: {args.node_id}"}))
        sys.exit(1)

    doc.nodes = [n for n in doc.nodes if n.id != args.node_id]
    if block.children is None:
        block.children = []
    block.children.append(target)
    save_network(args.path, doc)
    print(json.dumps({"ok": True}))

if __name__ == "__main__":
    main()
