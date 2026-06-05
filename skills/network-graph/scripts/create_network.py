#!/usr/bin/env python3
"""Create a new .net.json file."""
import argparse, json, os, re, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.schemas import create_network_document
from lib.file_utils import save_network

EXTENSION = ".net.json"
# Compound extensions checked first, splitext fallback handles unknown extensions
_KNOWN_EXTS = [".net.json"]


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
    parser = argparse.ArgumentParser(description="Create a .net.json file")
    parser.add_argument("name", help="Name for the file (without extension)")
    parser.add_argument("--title", default="New Network", help="Title for the network")
    args = parser.parse_args()

    path = os.path.abspath(_build_path(args.name))

    if os.path.exists(path):
        print(json.dumps({"ok": True, "path": path}))
        return

    doc = create_network_document(args.title)
    save_network(path, doc)
    input_id = doc.nodes[0].id
    output_id = doc.nodes[1].id
    print(json.dumps({"ok": True, "path": path, "inputId": input_id, "outputId": output_id}))

if __name__ == "__main__":
    main()
