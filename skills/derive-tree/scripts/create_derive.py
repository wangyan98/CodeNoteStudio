#!/usr/bin/env python3
"""Create a new .derive.json file."""
import argparse, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.schemas import create_derive_document
from lib.file_utils import save_derive


def main():
    parser = argparse.ArgumentParser(description="Create a .derive.json file")
    parser.add_argument("path", help="Path to the .derive.json file")
    args = parser.parse_args()

    if os.path.exists(args.path):
        print(json.dumps({"ok": True}))
        return

    doc = create_derive_document()
    save_derive(args.path, doc)
    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
