#!/usr/bin/env python3
"""Create a new .net.json file."""
import argparse, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.schemas import create_network_document
from lib.file_utils import save_network

def main():
    parser = argparse.ArgumentParser(description="Create a .net.json file")
    parser.add_argument("path", help="Path to the .net.json file")
    parser.add_argument("--name", default="New Network")
    args = parser.parse_args()

    if os.path.exists(args.path):
        print(json.dumps({"ok": True}))
        return

    doc = create_network_document(args.name)
    save_network(args.path, doc)
    input_id = doc.nodes[0].id
    output_id = doc.nodes[1].id
    print(json.dumps({"ok": True, "inputId": input_id, "outputId": output_id}))

if __name__ == "__main__":
    main()
