#!/usr/bin/env python3
"""Update a step in a .derive.json document."""
import argparse, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import load_derive, save_derive
from lib.schemas import parse_code_mapping


def main():
    parser = argparse.ArgumentParser(description="Update a derivation step")
    parser.add_argument("path", help="Path to the .derive.json file")
    parser.add_argument("step_id", help="ID of the step to update")
    parser.add_argument("--title")
    parser.add_argument("--content", help="LaTeX formula content for this step")
    parser.add_argument("--code-mapping", help='JSON code mapping object')
    args = parser.parse_args()

    doc = load_derive(args.path)
    node = next((n for n in doc.nodes if n.id == args.step_id), None)
    if node is None:
        print(json.dumps({"ok": False, "error": f"Step not found: {args.step_id}"}))
        sys.exit(1)

    if args.title is not None:
        node.title = args.title
    if args.content is not None:
        node.content = args.content
    if args.code_mapping is not None:
        try:
            node.codeMapping = parse_code_mapping(args.code_mapping)
        except ValueError as e:
            print(json.dumps({"ok": False, "error": str(e)}))
            sys.exit(1)

    save_derive(args.path, doc)
    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
