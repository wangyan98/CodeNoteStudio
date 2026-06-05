#!/usr/bin/env python3
"""Delete an @ref(...) code reference from a .md file."""
import argparse, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import resolve_path

def main():
    parser = argparse.ArgumentParser(description="Delete a code reference from a .md file")
    parser.add_argument("path", help="Path to the .md file")
    parser.add_argument("ref", help="The ref string to remove (without @ref() wrapper)")
    args = parser.parse_args()

    args.path = resolve_path(args.path, ".md")

    if not os.path.exists(args.path):
        print(json.dumps({"ok": False, "error": f"File not found: {args.path}"}))
        sys.exit(1)

    ref_pattern = f"@ref({args.ref})"

    with open(args.path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    new_lines = [line for line in lines if ref_pattern not in line]

    if len(new_lines) == len(lines):
        print(json.dumps({"ok": False, "error": f"Reference not found: {args.ref}"}))
        sys.exit(1)

    while new_lines and new_lines[-1].strip() == "":
        new_lines.pop()
    if new_lines:
        new_lines.append("\n")

    with open(args.path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)

    print(json.dumps({"ok": True}))

if __name__ == "__main__":
    main()
