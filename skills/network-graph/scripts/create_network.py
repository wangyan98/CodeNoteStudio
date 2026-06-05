#!/usr/bin/env python3
"""Create a new .net.json file."""
import argparse, json, os, re, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.schemas import create_network_document
from lib.file_utils import save_network

EXTENSION = ".net.json"
# Extensions to strip if the LLM accidentally includes them
KNOWN_EXTS = [".net.json", ".json", ".net"]


def _build_path(name: str) -> str:
    """Strip any known extension from name and append the correct one."""
    for ext in KNOWN_EXTS:
        if name.endswith(ext):
            name = name[: -len(ext)]
            break
    return name + EXTENSION


def main():
    parser = argparse.ArgumentParser(description="Create a .net.json file")
    parser.add_argument("name", help="Name for the file (without extension)")
    parser.add_argument("--title", default="New Network", help="Title for the network")
    args = parser.parse_args()

    path = _build_path(args.name)

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
