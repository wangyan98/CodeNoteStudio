#!/usr/bin/env python3
"""
Build a YOLOv5n net.json with direction-aware blocks.

Backbone: horizontal block (Conv layers stacked L→R, multi-output skip ports)
Neck:     vertical block (FPN upsample/concat downstream)
Heads:    three parallel C3 nodes (P3/8, P4/16, P5/32) feeding into Detect
"""
import argparse, json, sys, uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import save_network
from lib.schemas import GraphNode, GraphEdge, NetworkDocument


def make_layer(label: str, layer_type: str, params: dict = None,
               in_shape: str = None, out_shape: str = None) -> GraphNode:
    return GraphNode(
        id=str(uuid.uuid4()), kind="layer", label=label,
        layerType=layer_type, params=params,
        inputShape=in_shape, outputShape=out_shape,
    )


def make_block(label: str, children: list[GraphNode], internal_edges: list[GraphEdge],
               direction: str, repeat: int = None) -> GraphNode:
    return GraphNode(
        id=str(uuid.uuid4()), kind="block", label=label,
        children=children, internalEdges=internal_edges,
        direction=direction, repeat=repeat,
    )


def edge(src: str, tgt: str, style="forward", lbl=None) -> GraphEdge:
    return GraphEdge(id=str(uuid.uuid4()), source=src, target=tgt, style=style, label=lbl)


def main():
    parser = argparse.ArgumentParser(description="Build YOLOv5n net.json")
    parser.add_argument("path", help="Output path for .net.json file")
    parser.add_argument("--name", default="YOLOv5n (direction-aware)", help="Network name")
    args = parser.parse_args()

    # ============================================================
    # INPUT / OUTPUT
    # ============================================================
    input_node = GraphNode(id=str(uuid.uuid4()), kind="input", label="Input",
                           inputShape="3×640×640")
    output_node = GraphNode(id=str(uuid.uuid4()), kind="output", label="Output")

    # ============================================================
    # BACKBONE (horizontal) — layers flow left→right
    # ============================================================
    bb_layers: list[GraphNode] = []
    bb_edges: list[GraphEdge] = []

    # 0: Conv (3→16, k6, s2, p2)
    c0 = make_layer("Conv(3→16,k6,s2)", "Conv2d",
                    {"in_channels": 3, "out_channels": 16, "kernel_size": 6, "stride": 2, "padding": 2},
                    "3×640×640", "16×320×320")
    bb_layers.append(c0)

    # 1: Conv (16→32, k3, s2)
    c1 = make_layer("Conv(16→32,k3,s2)", "Conv2d",
                    {"in_channels": 16, "out_channels": 32, "kernel_size": 3, "stride": 2, "padding": 1},
                    "16×320×320", "32×160×160")
    bb_layers.append(c1)
    bb_edges.append(edge(c0.id, c1.id))

    # 2: C3 (32→32, n=1)
    c2 = make_layer("C3(32→32,n=1)", "Custom",
                    {"module": "C3", "in_channels": 32, "out_channels": 32, "n_bottlenecks": 1, "shortcut": True},
                    "32×160×160", "32×160×160")
    bb_layers.append(c2)
    bb_edges.append(edge(c1.id, c2.id))

    # 3: Conv (32→64, k3, s2) — P3 SKIP OUTPUT
    c3 = make_layer("Conv(32→64,k3,s2)", "Conv2d",
                    {"in_channels": 32, "out_channels": 64, "kernel_size": 3, "stride": 2, "padding": 1},
                    "32×160×160", "64×80×80")
    bb_layers.append(c3)
    bb_edges.append(edge(c2.id, c3.id))

    # 4: C3 (64→64, n=2)
    c4 = make_layer("C3(64→64,n=2)", "Custom",
                    {"module": "C3", "in_channels": 64, "out_channels": 64, "n_bottlenecks": 2, "shortcut": True},
                    "64×80×80", "64×80×80")
    bb_layers.append(c4)
    bb_edges.append(edge(c3.id, c4.id))

    # 5: Conv (64→128, k3, s2) — P4 SKIP OUTPUT
    c5 = make_layer("Conv(64→128,k3,s2)", "Conv2d",
                    {"in_channels": 64, "out_channels": 128, "kernel_size": 3, "stride": 2, "padding": 1},
                    "64×80×80", "128×40×40")
    bb_layers.append(c5)
    bb_edges.append(edge(c4.id, c5.id))

    # 6: C3 (128→128, n=3)
    c6 = make_layer("C3(128→128,n=3)", "Custom",
                    {"module": "C3", "in_channels": 128, "out_channels": 128, "n_bottlenecks": 3, "shortcut": True},
                    "128×40×40", "128×40×40")
    bb_layers.append(c6)
    bb_edges.append(edge(c5.id, c6.id))

    # 7: Conv (128→256, k3, s2) — P5 SKIP OUTPUT
    c7 = make_layer("Conv(128→256,k3,s2)", "Conv2d",
                    {"in_channels": 128, "out_channels": 256, "kernel_size": 3, "stride": 2, "padding": 1},
                    "128×40×40", "256×20×20")
    bb_layers.append(c7)
    bb_edges.append(edge(c6.id, c7.id))

    # 8: C3 (256→256, n=1)
    c8 = make_layer("C3(256→256,n=1)", "Custom",
                    {"module": "C3", "in_channels": 256, "out_channels": 256, "n_bottlenecks": 1, "shortcut": True},
                    "256×20×20", "256×20×20")
    bb_layers.append(c8)
    bb_edges.append(edge(c7.id, c8.id))

    # 9: SPPF (256→256)
    c9 = make_layer("SPPF(256→256,k5)", "Custom",
                    {"module": "SPPF", "in_channels": 256, "out_channels": 256, "kernel_size": 5},
                    "256×20×20", "256×20×20")
    bb_layers.append(c9)
    bb_edges.append(edge(c8.id, c9.id))

    backbone = make_block("Backbone", bb_layers, bb_edges, direction="horizontal")
    # Mark multi-output skip source layers for port visualization
    # (direction info on the block already ensures horizontal layout;
    #  the UI will auto-detect these as multi-output nodes)

    # ============================================================
    # NECK/HEAD (vertical) — FPN processing top→bottom, then branches
    # ============================================================
    neck_layers: list[GraphNode] = []
    neck_edges: list[GraphEdge] = []

    # 10: Conv (256→128, k1, s1) — first neck layer (input from backbone via top-level edge)
    l10 = make_layer("Conv(256→128,k1,s1)", "Conv2d",
                     {"in_channels": 256, "out_channels": 128, "kernel_size": 1, "stride": 1, "padding": 0},
                     "256×20×20", "128×20×20")
    neck_layers.append(l10)
    # No internal edge into l10 — the top-level backbone→neck edge handles this

    # 11: Upsample (×2)
    l11 = make_layer("Upsample(×2)", "Custom",
                     {"module": "Upsample", "scale_factor": 2},
                     "128×20×20", "128×40×40")
    neck_layers.append(l11)
    neck_edges.append(edge(l10.id, l11.id))

    # 12: Concat([11, 6]) — merge with backbone P4 (c6)
    l12 = make_layer("Concat([11,6])", "Custom",
                     {"module": "Concat", "dimension": 1},
                     None, "256×40×40")
    neck_layers.append(l12)
    neck_edges.append(edge(l11.id, l12.id))  # Upsample → Concat

    # 13: C3 (256→128, n=1, shortcut=False)
    l13 = make_layer("C3(256→128,n=1,sh=False)", "Custom",
                     {"module": "C3", "in_channels": 256, "out_channels": 128, "n_bottlenecks": 1, "shortcut": False},
                     "256×40×40", "128×40×40")
    neck_layers.append(l13)
    neck_edges.append(edge(l12.id, l13.id))

    # 14: Conv (128→64, k1, s1)
    l14 = make_layer("Conv(128→64,k1,s1)", "Conv2d",
                     {"in_channels": 128, "out_channels": 64, "kernel_size": 1, "stride": 1, "padding": 0},
                     "128×40×40", "64×40×40")
    neck_layers.append(l14)
    neck_edges.append(edge(l13.id, l14.id))

    # 15: Upsample (×2)
    l15 = make_layer("Upsample(×2)", "Custom",
                     {"module": "Upsample", "scale_factor": 2},
                     "64×40×40", "64×80×80")
    neck_layers.append(l15)
    neck_edges.append(edge(l14.id, l15.id))

    # 16: Concat([15, 4]) — merge with backbone P3 (c4)
    l16 = make_layer("Concat([15,4])", "Custom",
                     {"module": "Concat", "dimension": 1},
                     None, "128×80×80")
    neck_layers.append(l16)
    neck_edges.append(edge(l15.id, l16.id))  # Upsample → Concat

    # 17: C3 (128→64, n=1) — P3/8 OUTPUT
    l17 = make_layer("C3(128→64,n=1,P3/8)", "Custom",
                     {"module": "C3", "in_channels": 128, "out_channels": 64, "n_bottlenecks": 1, "shortcut": False},
                     "128×80×80", "64×80×80")
    neck_layers.append(l17)
    neck_edges.append(edge(l16.id, l17.id))

    # 18: Conv (64→64, k3, s2) — downsample back
    l18 = make_layer("Conv(64→64,k3,s2)", "Conv2d",
                     {"in_channels": 64, "out_channels": 64, "kernel_size": 3, "stride": 2, "padding": 1},
                     "64×80×80", "64×40×40")
    neck_layers.append(l18)
    neck_edges.append(edge(l17.id, l18.id))

    # 19: Concat([18, 14]) — merge with l14
    l19 = make_layer("Concat([18,14])", "Custom",
                     {"module": "Concat", "dimension": 1},
                     None, "128×40×40")
    neck_layers.append(l19)
    neck_edges.append(edge(l18.id, l19.id))  # Conv → Concat

    # 20: C3 (128→128, n=1) — P4/16 OUTPUT
    l20 = make_layer("C3(128→128,n=1,P4/16)", "Custom",
                     {"module": "C3", "in_channels": 128, "out_channels": 128, "n_bottlenecks": 1, "shortcut": False},
                     "128×40×40", "128×40×40")
    neck_layers.append(l20)
    neck_edges.append(edge(l19.id, l20.id))

    # 21: Conv (128→128, k3, s2) — downsample
    l21 = make_layer("Conv(128→128,k3,s2)", "Conv2d",
                     {"in_channels": 128, "out_channels": 128, "kernel_size": 3, "stride": 2, "padding": 1},
                     "128×40×40", "128×20×20")
    neck_layers.append(l21)
    neck_edges.append(edge(l20.id, l21.id))

    # 22: Concat([21, 10]) — merge with l10
    l22 = make_layer("Concat([21,10])", "Custom",
                     {"module": "Concat", "dimension": 1},
                     None, "256×20×20")
    neck_layers.append(l22)
    neck_edges.append(edge(l21.id, l22.id))  # Conv → Concat

    # 23: C3 (256→256, n=1) — P5/32 OUTPUT
    l23 = make_layer("C3(256→256,n=1,P5/32)", "Custom",
                     {"module": "C3", "in_channels": 256, "out_channels": 256, "n_bottlenecks": 1, "shortcut": False},
                     "256×20×20", "256×20×20")
    neck_layers.append(l23)
    neck_edges.append(edge(l22.id, l23.id))

    neck = make_block("Neck (FPN)", neck_layers, neck_edges, direction="vertical")

    # ============================================================
    # DETECT + OUTPUT
    # ============================================================
    detect = make_layer("Detect(P3=64,P4=128,P5=256)", "Custom",
                        {"module": "Detect", "nc": 80, "reg_max": 16},
                        None, "[N×84]")

    # ============================================================
    # TOP-LEVEL NODES
    # ============================================================
    top_nodes = [input_node, backbone, neck, detect, output_node]

    # ============================================================
    # TOP-LEVEL EDGES
    # ============================================================
    top_edges: list[GraphEdge] = [
        # input → backbone
        edge(input_node.id, backbone.id),
        # backbone → neck (SPPF output → neck entry)
        edge(backbone.id, neck.id),
        # neck → detect
        edge(neck.id, detect.id),
        # detect → output
        edge(detect.id, output_node.id),
    ]

    # Skip connections from backbone to neck concat layers
    top_edges.append(edge(c4.id, l16.id, "skip", "P3"))    # BB C3_4 → Concat 16
    top_edges.append(edge(c6.id, l12.id, "skip", "P4"))    # BB C3_6 → Concat 12
    top_edges.append(edge(c9.id, l22.id, "skip", "P5"))    # SPPF → Concat 22

    # Neck internal skip edges (within the neck block):
    # l10 (SPPF→Conv) has 2 outputs: forward→l11 (upsample), skip→l22 (P5 head concat)
    # l14 (C3_13→Conv) has 2 outputs: forward→l15 (upsample), skip→l19 (P4 head concat)
    neck_edges.append(edge(l10.id, l22.id, "skip", "P5_head"))
    neck_edges.append(edge(l14.id, l19.id, "skip", "P4_head"))

    # Rebuild neck with updated internal edges
    neck.internalEdges = neck_edges

    # ============================================================
    # ASSEMBLE DOCUMENT
    # ============================================================
    doc = NetworkDocument(
        name=args.name,
        nodes=top_nodes,
        edges=top_edges,
    )

    path = args.path
    if not path.endswith(".net.json"):
        path += ".net.json"

    save_network(path, doc)
    print(json.dumps({
        "ok": True,
        "path": path,
        "inputId": input_node.id,
        "outputId": output_node.id,
        "backboneId": backbone.id,
        "neckId": neck.id,
        "detectId": detect.id,
        "backboneDirection": backbone.direction,
        "neckDirection": neck.direction,
    }, indent=2))


if __name__ == "__main__":
    main()
