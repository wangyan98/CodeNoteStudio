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


def main():
    parser = argparse.ArgumentParser(description="Create a .mind.json file")
    parser.add_argument("path", help="Path to the .mind.json file")
    args = parser.parse_args()

    if os.path.exists(args.path):
        try:
            data = read_json(args.path)
            if is_valid_mindmap_document(data):
                print(json.dumps({"ok": True, "id": data["root"]["id"]}))
                return
        except Exception:
            pass

    doc = create_mindmap_document()
    save_mindmap(args.path, doc)
    print(json.dumps({"ok": True, "id": doc.root.id}))


if __name__ == "__main__":
    main()
