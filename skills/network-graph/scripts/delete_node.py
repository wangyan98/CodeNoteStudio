#!/usr/bin/env python3
"""Delete a node and its incident edges from a .net.json document."""
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import load_network, save_network, resolve_path


def remove_from_children(children, node_id):
    """Remove a node from a children list and its descendant children. Returns True if removed."""
    for i, child in enumerate(children):
        if child.id == node_id:
            children.pop(i)
            return True
        if child.children:
            if remove_from_children(child.children, node_id):
                # Clean internalEdges referencing the removed node
                if child.internalEdges:
                    child.internalEdges = [
                        e for e in child.internalEdges
                        if e.source != node_id and e.target != node_id
                    ]
                return True
    return False


def main():
    parser = argparse.ArgumentParser(description="Delete a node from a network graph")
    parser.add_argument("path", help="Path to the .net.json file")
    parser.add_argument("node_id", help="ID of the node to delete")
    args = parser.parse_args()

    args.path = resolve_path(args.path, ".net.json")

    doc = load_network(args.path)

    # Try top-level removal
    removed = False
    for i, n in enumerate(doc.nodes):
        if n.id == args.node_id:
            doc.nodes.pop(i)
            removed = True
            break

    # Try nested removal
    if not removed:
        for node in doc.nodes:
            if node.children and remove_from_children(node.children, args.node_id):
                # Clean internalEdges on this node
                if node.internalEdges:
                    node.internalEdges = [
                        e for e in node.internalEdges
                        if e.source != args.node_id and e.target != args.node_id
                    ]
                removed = True
                break

    if not removed:
        print(json.dumps({"ok": False, "error": f"Node not found: {args.node_id}"}))
        sys.exit(1)

    # Also clean top-level edges
    doc.edges = [e for e in doc.edges if e.source != args.node_id and e.target != args.node_id]

    save_network(args.path, doc)
    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
