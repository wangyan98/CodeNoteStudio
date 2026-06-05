#!/usr/bin/env python3
"""Create a new .derive.json file."""
import argparse, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.schemas import create_derive_document
from lib.file_utils import save_derive

EXTENSION = ".derive.json"
KNOWN_EXTS = [".derive.json", ".json"]


def _build_path(name: str) -> str:
    """Strip any known extension from name and append the correct one."""
    for ext in KNOWN_EXTS:
        if name.endswith(ext):
            name = name[: -len(ext)]
            break
    return name + EXTENSION


def main():
    parser = argparse.ArgumentParser(description="Create a .derive.json file")
    parser.add_argument("name", help="Name for the file (without extension)")
    args = parser.parse_args()

    path = _build_path(args.name)

    if os.path.exists(path):
        print(json.dumps({"ok": True, "path": path}))
        return

    doc = create_derive_document()
    save_derive(path, doc)
    print(json.dumps({"ok": True, "path": path}))


if __name__ == "__main__":
    main()
