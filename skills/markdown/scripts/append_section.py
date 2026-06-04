#!/usr/bin/env python3
"""Append a ## heading section to a .md file."""
import argparse, json, os, sys

def main():
    parser = argparse.ArgumentParser(description="Append a section to a .md file")
    parser.add_argument("path", help="Path to the .md file")
    parser.add_argument("heading", help="Section heading (without ##)")
    parser.add_argument("content", help="Section content (markdown)")
    args = parser.parse_args()

    if not os.path.exists(args.path):
        print(json.dumps({"ok": False, "error": f"File not found: {args.path}"}))
        sys.exit(1)

    with open(args.path, 'r', encoding='utf-8') as f:
        text = f.read()

    marker = f"## {args.heading}\n"
    if marker in text:
        print(json.dumps({"ok": False, "error": f"Heading already exists: {args.heading}"}))
        sys.exit(1)

    with open(args.path, 'a', encoding='utf-8') as f:
        f.write(f"## {args.heading}\n\n{args.content}\n\n")

    print(json.dumps({"ok": True}))

if __name__ == "__main__":
    main()
