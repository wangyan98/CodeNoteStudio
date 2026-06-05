#!/usr/bin/env python3
"""Insert an ![[embed_path]] reference into a .md file."""
import argparse, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import resolve_path

EMBED_PREFIX = "![["
EMBED_SUFFIX = "]]"

def main():
    parser = argparse.ArgumentParser(description="Insert an embed reference into a .md file")
    parser.add_argument("path", help="Path to the .md file")
    parser.add_argument("embed_path", help="Path to the note to embed (relative to workspace root)")
    args = parser.parse_args()

    args.path = resolve_path(args.path, ".md")

    if not os.path.exists(args.path):
        print(json.dumps({"ok": False, "error": f"File not found: {args.path}"}))
        sys.exit(1)

    embed_line = f"{EMBED_PREFIX}{args.embed_path}{EMBED_SUFFIX}\n"

    with open(args.path, 'r', encoding='utf-8') as f:
        content = f.read()

    if embed_line.strip() in content:
        print(json.dumps({"ok": False, "error": f"Embed already exists: {args.embed_path}"}))
        sys.exit(1)

    with open(args.path, 'a', encoding='utf-8') as f:
        if not content.endswith('\n'):
            f.write('\n')
        f.write(embed_line)

    print(json.dumps({"ok": True}))

if __name__ == "__main__":
    main()
