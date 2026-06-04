#!/usr/bin/env python3
"""Add a layer node to a .net.json document, inserted before the output node."""
import argparse, json, os, sys, uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import load_network, save_network
from lib.schemas import GraphNode, GraphEdge

def main():
    parser = argparse.ArgumentParser(description="Add a layer to a network graph")
    parser.add_argument("path", help="Path to the .net.json file")
    parser.add_argument("layer_type", help="Layer type (e.g. Conv2d, Linear)")
    parser.add_argument("--name", help="Layer display name")
    parser.add_argument("--params", default="{}", help='JSON params object')
    args = parser.parse_args()

    doc = load_network(args.path)
    output_node = next((n for n in doc.nodes if n.kind == "output"), None)
    if output_node is None:
        print(json.dumps({"ok": False, "error": "No output node found"}))
        sys.exit(1)

    output_edge = next((e for e in doc.edges if e.target == output_node.id), None)
    prev_node_id = output_edge.source if output_edge else doc.nodes[0].id
    if output_edge:
        doc.edges = [e for e in doc.edges if e.id != output_edge.id]

    params = json.loads(args.params)
    label = args.name or args.layer_type
    new_node = GraphNode(
        id=str(uuid.uuid4()), kind="layer", label=label,
        layerType=args.layer_type, params=params
    )
    output_idx = next(i for i, n in enumerate(doc.nodes) if n.id == output_node.id)
    doc.nodes.insert(output_idx, new_node)
    doc.edges.append(GraphEdge(id=str(uuid.uuid4()), source=prev_node_id, target=new_node.id))
    doc.edges.append(GraphEdge(id=str(uuid.uuid4()), source=new_node.id, target=output_node.id))
    save_network(args.path, doc)
    print(json.dumps({"ok": True, "id": new_node.id}))

if __name__ == "__main__":
    main()
