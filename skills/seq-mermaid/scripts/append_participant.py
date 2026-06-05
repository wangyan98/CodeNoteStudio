#!/usr/bin/env python3
"""Append a participant to a .seq.mermaid file."""
import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import resolve_path


def main():
    parser = argparse.ArgumentParser(description="Add a participant to a sequence diagram")
    parser.add_argument("path", help="Path to the .seq.mermaid file")
    parser.add_argument("name", help="Participant identifier (short name)")
    parser.add_argument("--alias", default=None, help="Display alias for the participant")
    args = parser.parse_args()

    args.path = resolve_path(args.path, ".seq.mermaid")

    if not os.path.exists(args.path):
        print(json.dumps({"ok": False, "error": f"File not found: {args.path}"}))
        sys.exit(1)

    with open(args.path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    # Check for duplicate participant
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(f"participant {args.name}") or stripped.startswith(f"participant {args.name} "):
            print(json.dumps({"ok": False, "error": f"Participant already exists: {args.name}"}))
            sys.exit(1)

    # Build the new participant line
    if args.alias:
        participant_line = f"    participant {args.name} as {args.alias}\n"
    else:
        participant_line = f"    participant {args.name}\n"

    # Insert after the sequenceDiagram header (line 0) and before first message
    # Find the insertion point: after all participant/actor lines, before first message line
    insert_idx = 1  # default: right after sequenceDiagram
    for i in range(1, len(lines)):
        stripped = lines[i].strip()
        if stripped and not stripped.startswith("participant ") and not stripped.startswith("actor "):
            insert_idx = i
            break
    else:
        insert_idx = len(lines)

    lines.insert(insert_idx, participant_line)
    with open(args.path, 'w', encoding='utf-8') as f:
        f.writelines(lines)

    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
