#!/usr/bin/env python3
"""Update a mind map node's title, content, or codeMapping."""
import argparse, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import load_mindmap, save_mindmap
from lib.schemas import MindMapNode, CodeMapping


def find_node(node: MindMapNode, node_id: str) -> MindMapNode | None:
    if node.id == node_id:
        return node
    for child in node.children:
        found = find_node(child, node_id)
        if found:
            return found
    return None


def main():
    parser = argparse.ArgumentParser(description="Update a mind map node")
    parser.add_argument("path", help="Path to the .mind.json file")
    parser.add_argument("node_id", help="ID of the node to update")
    parser.add_argument("--title")
    parser.add_argument("--content")
    parser.add_argument("--code-mapping", help='JSON: {"raw":"...","functionName":"...",...}')
    args = parser.parse_args()

    doc = load_mindmap(args.path)
    node = find_node(doc.root, args.node_id)
    if node is None:
        print(json.dumps({"ok": False, "error": f"Node not found: {args.node_id}"}))
        sys.exit(1)

    if args.title is not None:
        node.title = args.title
    if args.content is not None:
        node.content = args.content
    if args.code_mapping is not None:
        data = json.loads(args.code_mapping)
        node.codeMapping = CodeMapping(**data)

    save_mindmap(args.path, doc)
    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
