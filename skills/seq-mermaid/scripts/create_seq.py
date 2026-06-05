#!/usr/bin/env python3
"""Create a .seq.mermaid file with a default template."""
import argparse
import json
import os
import sys

EXTENSION = ".seq.mermaid"


def _build_path(name: str) -> str:
    name = os.path.splitext(name)[0]
    return name + EXTENSION


def main():
    parser = argparse.ArgumentParser(description="Create a .seq.mermaid file")
    parser.add_argument("name", help="Name for the file (without extension)")
    parser.add_argument("--title", default="Sequence Diagram", help="Diagram title")
    args = parser.parse_args()

    path = os.path.abspath(_build_path(args.name))

    if os.path.exists(path):
        print(json.dumps({"ok": True, "path": path}))
        return

    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    content = f"sequenceDiagram\n    participant A as {args.title}\n"
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(json.dumps({"ok": True, "path": path}))


if __name__ == "__main__":
    main()
