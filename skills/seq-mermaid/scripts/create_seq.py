#!/usr/bin/env python3
"""Create a .seq.mermaid file with a default template."""
import argparse
import json
import os
import sys


def main():
    parser = argparse.ArgumentParser(description="Create a .seq.mermaid file")
    parser.add_argument("path", help="Path to the .seq.mermaid file")
    parser.add_argument("--title", default="Sequence Diagram", help="Diagram title")
    args = parser.parse_args()

    if os.path.exists(args.path):
        print(json.dumps({"ok": True}))
        return

    os.makedirs(os.path.dirname(args.path) or ".", exist_ok=True)
    content = f"sequenceDiagram\n    participant A as {args.title}\n"
    with open(args.path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
