#!/usr/bin/env python3
"""Insert an @ref(...) code reference into a .md file."""
import argparse, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import resolve_path

def main():
    parser = argparse.ArgumentParser(description="Insert a code reference into a .md file")
    parser.add_argument("path", help="Path to the .md file")
    parser.add_argument("ref", help="Reference string (e.g. repo#file#line#name)")
    args = parser.parse_args()

    args.path = resolve_path(args.path, ".md")

    if not os.path.exists(args.path):
        print(json.dumps({"ok": False, "error": f"File not found: {args.path}"}))
        sys.exit(1)

    ref_line = f"@ref({args.ref})\n"

    with open(args.path, 'r', encoding='utf-8') as f:
        content = f.read()

    if ref_line.strip() in content:
        print(json.dumps({"ok": False, "error": f"Reference already exists: {args.ref}"}))
        sys.exit(1)

    with open(args.path, 'a', encoding='utf-8') as f:
        if not content.endswith('\n'):
            f.write('\n')
        f.write(ref_line)

    print(json.dumps({"ok": True}))

if __name__ == "__main__":
    main()
