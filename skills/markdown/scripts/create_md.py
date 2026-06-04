#!/usr/bin/env python3
"""Create a .md markdown file."""
import argparse, json, os, sys

def main():
    parser = argparse.ArgumentParser(description="Create a .md file")
    parser.add_argument("path", help="Path to the .md file")
    parser.add_argument("--title", default="Untitled")
    args = parser.parse_args()

    if os.path.exists(args.path):
        print(json.dumps({"ok": True}))
        return

    os.makedirs(os.path.dirname(args.path) or ".", exist_ok=True)
    with open(args.path, 'w', encoding='utf-8') as f:
        f.write(f"# {args.title}\n\n")
    print(json.dumps({"ok": True}))

if __name__ == "__main__":
    main()
