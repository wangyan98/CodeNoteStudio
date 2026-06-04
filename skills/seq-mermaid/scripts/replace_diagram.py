#!/usr/bin/env python3
"""Replace the entire content of a .seq.mermaid file."""
import argparse
import json
import os
import sys


def main():
    parser = argparse.ArgumentParser(description="Replace a sequence diagram's content")
    parser.add_argument("path", help="Path to the .seq.mermaid file")
    parser.add_argument("content", help="New diagram content (full text)")
    args = parser.parse_args()

    if not os.path.exists(args.path):
        print(json.dumps({"ok": False, "error": f"File not found: {args.path}"}))
        sys.exit(1)

    content = args.content.strip()
    if not content.startswith("sequenceDiagram"):
        print(json.dumps({"ok": False, "error": "Content must start with 'sequenceDiagram'"}))
        sys.exit(1)

    with open(args.path, 'w', encoding='utf-8') as f:
        f.write(content + "\n")

    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
