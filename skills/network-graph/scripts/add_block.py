#!/usr/bin/env python3
"""Add a block node to a .net.json document."""
import argparse, json, sys, uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import load_network, save_network, resolve_path
from lib.schemas import GraphNode

def main():
    parser = argparse.ArgumentParser(description="Add a block to a network graph")
    parser.add_argument("path", help="Path to the .net.json file")
    parser.add_argument("name", help="Block name")
    parser.add_argument("--repeat", type=int, default=None, help="Repeat count")
    parser.add_argument("--direction", choices=["horizontal", "vertical"],
                        default=None, help="Block layout direction")
    args = parser.parse_args()

    args.path = resolve_path(args.path, ".net.json")

    doc = load_network(args.path)
    block = GraphNode(
        id=str(uuid.uuid4()), kind="block", label=args.name,
        repeat=args.repeat, children=[], direction=args.direction
    )
    doc.nodes.append(block)
    save_network(args.path, doc)
    print(json.dumps({"ok": True, "id": block.id}))

if __name__ == "__main__":
    main()
