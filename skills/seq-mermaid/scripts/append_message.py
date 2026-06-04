#!/usr/bin/env python3
"""Append a message arrow to a .seq.mermaid file."""
import argparse
import json
import os
import sys

ARROW_MAP = {
    "solid": "->>",
    "dashed": "-->>",
    "x": "--x",
    "async": "-)",
}


def main():
    parser = argparse.ArgumentParser(description="Append a message to a sequence diagram")
    parser.add_argument("path", help="Path to the .seq.mermaid file")
    parser.add_argument("from_participant", help="Source participant name")
    parser.add_argument("to_participant", help="Target participant name")
    parser.add_argument("message", help="Message label")
    parser.add_argument("--type", default="solid", choices=sorted(ARROW_MAP.keys()),
                        help="Arrow type (default: solid)")
    args = parser.parse_args()

    arrow = ARROW_MAP[args.type]

    if not os.path.exists(args.path):
        print(json.dumps({"ok": False, "error": f"File not found: {args.path}"}))
        sys.exit(1)

    with open(args.path, 'r', encoding='utf-8') as f:
        content = f.read()

    if not content.startswith("sequenceDiagram"):
        print(json.dumps({"ok": False, "error": "Not a valid sequence diagram file"}))
        sys.exit(1)

    message_line = f"    {args.from_participant}{arrow}{args.to_participant}: {args.message}\n"

    with open(args.path, 'a', encoding='utf-8') as f:
        f.write(message_line)

    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
