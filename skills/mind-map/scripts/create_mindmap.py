#!/usr/bin/env python3
"""Create a new .mind.json file with a root node."""
import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.schemas import create_mindmap_document, is_valid_mindmap_document
from lib.file_utils import save_mindmap, load_mindmap, read_json

EXTENSION = ".mind.json"
# Compound extensions checked first, splitext fallback handles unknown extensions
_KNOWN_EXTS = [".mind.json"]


def _build_path(name: str) -> str:
    """Strip any extension from name and append the correct one."""
    for ext in _KNOWN_EXTS:
        if name.endswith(ext):
            name = name[: -len(ext)]
            break
    else:
        name = os.path.splitext(name)[0]
    return name + EXTENSION


def main():
    parser = argparse.ArgumentParser(description="Create a .mind.json file")
    parser.add_argument("name", help="Name for the file (without extension)")
    args = parser.parse_args()

    path = os.path.abspath(_build_path(args.name))

    if os.path.exists(path):
        try:
            data = read_json(path)
            if is_valid_mindmap_document(data):
                print(json.dumps({"ok": True, "path": path, "id": data["root"]["id"]}))
                return
        except Exception:
            pass

    doc = create_mindmap_document()
    save_mindmap(path, doc)
    print(json.dumps({"ok": True, "path": path, "id": doc.root.id}))


if __name__ == "__main__":
    main()
