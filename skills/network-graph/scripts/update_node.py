#!/usr/bin/env python3
"""Update a network node's label, params, or codeMapping."""
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import load_network, save_network, resolve_path
from lib.schemas import parse_code_mapping

def main():
    parser = argparse.ArgumentParser(description="Update a network graph node")
    parser.add_argument("path", help="Path to the .net.json file")
    parser.add_argument("node_id", help="ID of the node to update")
    parser.add_argument("--label")
    parser.add_argument("--params", help="JSON params object")
    parser.add_argument("--input-shape", help="Input tensor shape (e.g. 3×640×640)")
    parser.add_argument("--output-shape", help="Output tensor shape (e.g. 16×320×320)")
    parser.add_argument("--code-mapping", help="JSON code mapping object")
    parser.add_argument("--direction", choices=["horizontal", "vertical"],
                        default=None, help="Block layout direction")
    args = parser.parse_args()

    args.path = resolve_path(args.path, ".net.json")

    doc = load_network(args.path)
    node = next((n for n in doc.nodes if n.id == args.node_id), None)
    if node is None:
        print(json.dumps({"ok": False, "error": f"Node not found: {args.node_id}"}))
        sys.exit(1)

    if args.label is not None:
        node.label = args.label
    if args.params is not None:
        node.params = json.loads(args.params)
    if args.input_shape is not None:
        node.inputShape = args.input_shape
    if args.output_shape is not None:
        node.outputShape = args.output_shape
    if args.code_mapping is not None:
        try:
            node.codeMapping = parse_code_mapping(args.code_mapping)
        except ValueError as e:
            print(json.dumps({"ok": False, "error": str(e)}))
            sys.exit(1)
    if args.direction is not None:
        if isinstance(node, dict):
            node["direction"] = args.direction
        else:
            node.direction = args.direction

    save_network(args.path, doc)
    print(json.dumps({"ok": True}))

if __name__ == "__main__":
    main()
