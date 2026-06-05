#!/usr/bin/env python3
"""Delete codeMapping from a node in any supported document type."""
import argparse, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import (
    load_mindmap, save_mindmap,
    load_derive, save_derive,
    load_network, save_network,
)

EXTENSION_LOADERS = {
    ".mind.json": ("mindmap", lambda p: load_mindmap(p)),
    ".derive.json": ("derive", lambda p: load_derive(p)),
    ".net.json": ("net", lambda p: load_network(p)),
}

EXTENSION_SAVERS = {
    "mindmap": lambda p, d: save_mindmap(p, d),
    "derive": lambda p, d: save_derive(p, d),
    "net": lambda p, d: save_network(p, d),
}


def _find_node_in_mindmap(root, node_id):
    if root.id == node_id:
        return root
    for child in root.children:
        found = _find_node_in_mindmap(child, node_id)
        if found:
            return found
    return None


def _find_node_in_derive(nodes, node_id):
    return next((n for n in nodes if n.id == node_id), None)


def _find_node_in_network(nodes, node_id):
    def search(ns):
        for n in ns:
            if n.id == node_id:
                return n
            if n.children:
                found = search(n.children)
                if found:
                    return found
        return None
    return search(nodes)


def main():
    parser = argparse.ArgumentParser(description="Delete codeMapping from a document node")
    parser.add_argument("path", help="Path to the document")
    parser.add_argument("node_id", help="ID of the target node")
    args = parser.parse_args()

    doc_type = None
    loader = None
    for ext, (dtype, fn) in EXTENSION_LOADERS.items():
        if args.path.endswith(ext):
            doc_type = dtype
            loader = fn
            break

    if doc_type is None:
        print(json.dumps({"ok": False, "error": f"Unsupported file type: {args.path}"}))
        sys.exit(1)

    if not os.path.exists(args.path):
        print(json.dumps({"ok": False, "error": f"File not found: {args.path}"}))
        sys.exit(1)

    doc = loader(args.path)

    if doc_type == "mindmap":
        node = _find_node_in_mindmap(doc.root, args.node_id)
    elif doc_type == "derive":
        node = _find_node_in_derive(doc.nodes, args.node_id)
    else:
        node = _find_node_in_network(doc.nodes, args.node_id)

    if node is None:
        print(json.dumps({"ok": False, "error": f"Node not found: {args.node_id}"}))
        sys.exit(1)

    if node.codeMapping is None:
        print(json.dumps({"ok": False, "error": "Node has no code mapping to delete"}))
        sys.exit(1)

    node.codeMapping = None
    EXTENSION_SAVERS[doc_type](args.path, doc)
    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
