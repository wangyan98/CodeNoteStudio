#!/usr/bin/env python3
"""Create a .md markdown file."""
import argparse, json, os, sys

EXTENSION = ".md"


def _build_path(name: str) -> str:
    """Strip any extension from name and append the correct one."""
    name = os.path.splitext(name)[0]
    return name + EXTENSION


def main():
    parser = argparse.ArgumentParser(description="Create a .md file")
    parser.add_argument("name", help="Name for the file (without extension)")
    parser.add_argument("--title", default="Untitled")
    args = parser.parse_args()

    path = os.path.abspath(_build_path(args.name))

    if os.path.exists(path):
        print(json.dumps({"ok": True, "path": path}))
        return

    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(f"# {args.title}\n\n")
    print(json.dumps({"ok": True, "path": path}))

if __name__ == "__main__":
    main()
