#!/usr/bin/env python3
"""Delete an edge from a .net.json document."""
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import load_network, save_network

def main():
    parser = argparse.ArgumentParser(description="Delete a connection from a network graph")
    parser.add_argument("path", help="Path to the .net.json file")
    parser.add_argument("edge_id", help="ID of the edge to delete")
    args = parser.parse_args()

    doc = load_network(args.path)
    if not any(e.id == args.edge_id for e in doc.edges):
        print(json.dumps({"ok": False, "error": f"Edge not found: {args.edge_id}"}))
        sys.exit(1)

    doc.edges = [e for e in doc.edges if e.id != args.edge_id]
    save_network(args.path, doc)
    print(json.dumps({"ok": True}))

if __name__ == "__main__":
    main()
