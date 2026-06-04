#!/usr/bin/env python3
"""Delete a node and all incident edges from a .net.json document."""
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import load_network, save_network

def main():
    parser = argparse.ArgumentParser(description="Delete a node from a network graph")
    parser.add_argument("path", help="Path to the .net.json file")
    parser.add_argument("node_id", help="ID of the node to delete")
    args = parser.parse_args()

    doc = load_network(args.path)
    if not any(n.id == args.node_id for n in doc.nodes):
        print(json.dumps({"ok": False, "error": f"Node not found: {args.node_id}"}))
        sys.exit(1)

    doc.nodes = [n for n in doc.nodes if n.id != args.node_id]
    doc.edges = [e for e in doc.edges if e.source != args.node_id and e.target != args.node_id]
    save_network(args.path, doc)
    print(json.dumps({"ok": True}))

if __name__ == "__main__":
    main()
