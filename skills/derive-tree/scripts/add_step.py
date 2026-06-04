#!/usr/bin/env python3
"""Add a step to a .derive.json document."""
import argparse, json, os, sys, uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import load_derive, save_derive
from lib.schemas import DerivationNode


def recalc(nodes: list[DerivationNode]) -> None:
    for i, n in enumerate(nodes):
        n.stepNumber = i + 1


def sync_derives_to(nodes: list[DerivationNode]) -> None:
    for n in nodes:
        n.derivesTo = [other.id for other in nodes if other.derivesFrom == n.id]


def main():
    parser = argparse.ArgumentParser(description="Add a step to a derivation tree")
    parser.add_argument("path", help="Path to the .derive.json file")
    parser.add_argument("--after-step", type=int, default=None, help="Insert after step number N (0 = beginning)")
    parser.add_argument("--derives-from", default=None, help="ID of parent step")
    parser.add_argument("--title", default="New Step")
    parser.add_argument("--content", default="", help="LaTeX formula content for this step")
    args = parser.parse_args()

    doc = load_derive(args.path)
    new_node = DerivationNode(
        id=str(uuid.uuid4()), title=args.title, content=args.content,
        stepNumber=0, derivesFrom=args.derives_from, derivesTo=[], embedRefs=[]
    )

    if args.after_step is not None:
        doc.nodes.insert(args.after_step, new_node)
    else:
        doc.nodes.append(new_node)

    recalc(doc.nodes)
    sync_derives_to(doc.nodes)
    save_derive(args.path, doc)
    print(json.dumps({"ok": True, "id": new_node.id, "stepNumber": new_node.stepNumber}))


if __name__ == "__main__":
    main()
