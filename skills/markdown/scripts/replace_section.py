#!/usr/bin/env python3
"""Replace content under a ## heading in a .md file."""
import argparse, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import resolve_path

def main():
    parser = argparse.ArgumentParser(description="Replace a section in a .md file")
    parser.add_argument("path", help="Path to the .md file")
    parser.add_argument("heading", help="Section heading to replace (without ##)")
    parser.add_argument("content", help="New section content (markdown)")
    args = parser.parse_args()

    args.path = resolve_path(args.path, ".md")

    if not os.path.exists(args.path):
        print(json.dumps({"ok": False, "error": f"File not found: {args.path}"}))
        sys.exit(1)

    with open(args.path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    marker = f"## {args.heading}\n"
    start_idx = None
    for i, line in enumerate(lines):
        if line == marker:
            start_idx = i
            break

    if start_idx is None:
        print(json.dumps({"ok": False, "error": f"Heading not found: {args.heading}"}))
        sys.exit(1)

    # Find next ## or EOF
    end_idx = len(lines)
    for i in range(start_idx + 1, len(lines)):
        if lines[i].startswith("## "):
            end_idx = i
            break

    # Replace the section
    new_lines = lines[:start_idx] + [marker, "\n", args.content, "\n"]
    if end_idx < len(lines):
        new_lines.append("\n")
    new_lines.extend(lines[end_idx:])

    with open(args.path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)

    print(json.dumps({"ok": True}))

if __name__ == "__main__":
    main()
