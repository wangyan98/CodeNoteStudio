#!/usr/bin/env python3
"""Add an edge (connection) to a .net.json document."""
import argparse, json, sys, uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import load_network, save_network, resolve_path
from lib.schemas import GraphEdge

def main():
    parser = argparse.ArgumentParser(description="Add a connection to a network graph")
    parser.add_argument("path", help="Path to the .net.json file")
    parser.add_argument("from_id", help="Source node ID")
    parser.add_argument("to_id", help="Target node ID")
    parser.add_argument("--style", default="forward", choices=["forward", "skip"])
    parser.add_argument("--label", default=None)
    args = parser.parse_args()

    args.path = resolve_path(args.path, ".net.json")

    doc = load_network(args.path)
    node_ids = {n.id for n in doc.nodes}
    if args.from_id not in node_ids:
        print(json.dumps({"ok": False, "error": f"Source node not found: {args.from_id}"}))
        sys.exit(1)
    if args.to_id not in node_ids:
        print(json.dumps({"ok": False, "error": f"Target node not found: {args.to_id}"}))
        sys.exit(1)

    existing = next((e for e in doc.edges if e.source == args.from_id and e.target == args.to_id and e.style == args.style), None)
    if existing:
        print(json.dumps({"ok": True, "id": existing.id, "note": "edge already exists"}))
        return

    edge = GraphEdge(id=str(uuid.uuid4()), source=args.from_id, target=args.to_id, style=args.style, label=args.label)
    doc.edges.append(edge)
    save_network(args.path, doc)
    print(json.dumps({"ok": True, "id": edge.id}))

if __name__ == "__main__":
    main()
