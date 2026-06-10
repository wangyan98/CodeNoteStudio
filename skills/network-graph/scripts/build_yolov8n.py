#!/usr/bin/env python3
"""
Build a YOLOv8n net.json with direction-aware blocks.

Backbone: horizontal block (Conv + C2f layers stacked L→R, multi-output skip ports)
Neck:     vertical block (FPN upsample/concat/c2f chain)
Heads:    P3/8, P4/16, P5/32 from neck feeding into Detect
"""
import argparse, json, sys, uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import save_network
from lib.schemas import GraphNode, GraphEdge, NetworkDocument


def make_layer(label, layer_type, params=None, in_shape=None, out_shape=None):
    return GraphNode(
        id=str(uuid.uuid4()), kind="layer", label=label,
        layerType=layer_type, params=params,
        inputShape=in_shape, outputShape=out_shape,
    )


def make_block(label, children, internal_edges, direction, repeat=None):
    return GraphNode(
        id=str(uuid.uuid4()), kind="block", label=label,
        children=children, internalEdges=internal_edges,
        direction=direction, repeat=repeat,
    )


def edge(src, tgt, style="forward", lbl=None):
    return GraphEdge(id=str(uuid.uuid4()), source=src, target=tgt, style=style, label=lbl)


def main():
    parser = argparse.ArgumentParser(description="Build YOLOv8n net.json")
    parser.add_argument("path", help="Output path for .net.json file")
    parser.add_argument("--name", default="YOLOv8n (direction-aware)", help="Network name")
    args = parser.parse_args()

    # ============================================================
    # INPUT / OUTPUT
    # ============================================================
    input_node = GraphNode(id=str(uuid.uuid4()), kind="input", label="Input",
                           inputShape="3×640×640")
    output_node = GraphNode(id=str(uuid.uuid4()), kind="output", label="Output")

    # ============================================================
    # BACKBONE (horizontal)
    # YOLOv8n channels: width=0.25, depth=0.33, max_ch=1024
    # ============================================================
    bb_layers = []
    bb_edges = []

    # 0: Conv(3→16, k3, s2, p1) — P1/2
    c0 = make_layer("Conv(3→16,k3,s2)", "Conv2d",
                    {"in_channels": 3, "out_channels": 16, "kernel_size": 3, "stride": 2, "padding": 1},
                    "3×640×640", "16×320×320")
    bb_layers.append(c0)

    # 1: Conv(16→32, k3, s2, p1) — P2/4
    c1 = make_layer("Conv(16→32,k3,s2)", "Conv2d",
                    {"in_channels": 16, "out_channels": 32, "kernel_size": 3, "stride": 2, "padding": 1},
                    "16×320×320", "32×160×160")
    bb_layers.append(c1)
    bb_edges.append(edge(c0.id, c1.id))

    # 2: C2f(32→32, n=1, shortcut=True) — 3×0.33≈1
    c2 = make_layer("C2f(32→32,n=1,sh=True)", "Custom",
                    {"module": "C2f", "in_channels": 32, "out_channels": 32, "n_bottlenecks": 1, "shortcut": True},
                    "32×160×160", "32×160×160")
    bb_layers.append(c2)
    bb_edges.append(edge(c1.id, c2.id))

    # 3: Conv(32→64, k3, s2, p1) — P3/8
    c3 = make_layer("Conv(32→64,k3,s2)", "Conv2d",
                    {"in_channels": 32, "out_channels": 64, "kernel_size": 3, "stride": 2, "padding": 1},
                    "32×160×160", "64×80×80")
    bb_layers.append(c3)
    bb_edges.append(edge(c2.id, c3.id))

    # 4: C2f(64→64, n=2, shortcut=True) — 6×0.33≈2 — P3 SKIP OUTPUT
    c4 = make_layer("C2f(64→64,n=2,sh=True)", "Custom",
                    {"module": "C2f", "in_channels": 64, "out_channels": 64, "n_bottlenecks": 2, "shortcut": True},
                    "64×80×80", "64×80×80")
    bb_layers.append(c4)
    bb_edges.append(edge(c3.id, c4.id))

    # 5: Conv(64→128, k3, s2, p1) — P4/16
    c5 = make_layer("Conv(64→128,k3,s2)", "Conv2d",
                    {"in_channels": 64, "out_channels": 128, "kernel_size": 3, "stride": 2, "padding": 1},
                    "64×80×80", "128×40×40")
    bb_layers.append(c5)
    bb_edges.append(edge(c4.id, c5.id))

    # 6: C2f(128→128, n=2, shortcut=True) — 6×0.33≈2 — P4 SKIP OUTPUT
    c6 = make_layer("C2f(128→128,n=2,sh=True)", "Custom",
                    {"module": "C2f", "in_channels": 128, "out_channels": 128, "n_bottlenecks": 2, "shortcut": True},
                    "128×40×40", "128×40×40")
    bb_layers.append(c6)
    bb_edges.append(edge(c5.id, c6.id))

    # 7: Conv(128→256, k3, s2, p1) — P5/32
    c7 = make_layer("Conv(128→256,k3,s2)", "Conv2d",
                    {"in_channels": 128, "out_channels": 256, "kernel_size": 3, "stride": 2, "padding": 1},
                    "128×40×40", "256×20×20")
    bb_layers.append(c7)
    bb_edges.append(edge(c6.id, c7.id))

    # 8: C2f(256→256, n=1, shortcut=True) — 3×0.33≈1
    c8 = make_layer("C2f(256→256,n=1,sh=True)", "Custom",
                    {"module": "C2f", "in_channels": 256, "out_channels": 256, "n_bottlenecks": 1, "shortcut": True},
                    "256×20×20", "256×20×20")
    bb_layers.append(c8)
    bb_edges.append(edge(c7.id, c8.id))

    # 9: SPPF(256→256, k5) — P5 SKIP OUTPUT
    c9 = make_layer("SPPF(256→256,k5)", "Custom",
                    {"module": "SPPF", "in_channels": 256, "out_channels": 256, "kernel_size": 5},
                    "256×20×20", "256×20×20")
    bb_layers.append(c9)
    bb_edges.append(edge(c8.id, c9.id))

    backbone = make_block("Backbone", bb_layers, bb_edges, direction="horizontal")

    # ============================================================
    # NECK/HEAD (vertical) — FPN+PAN top→bottom chain
    # ============================================================
    neck_layers = []
    neck_edges = []

    # 10: Upsample(×2) — first neck layer (input from backbone SPPF via top-level edge)
    l10 = make_layer("Upsample(×2)", "Custom",
                     {"module": "Upsample", "scale_factor": 2},
                     "256×20×20", "256×40×40")
    neck_layers.append(l10)

    # 11: Concat([10, 6]) — merge with backbone P4 (c6)
    l11 = make_layer("Concat([10,6])", "Custom",
                     {"module": "Concat", "dimension": 1},
                     None, "384×40×40")
    neck_layers.append(l11)
    neck_edges.append(edge(l10.id, l11.id))

    # 12: C2f(384→128, n=1, shortcut=False)
    l12 = make_layer("C2f(384→128,n=1,sh=False)", "Custom",
                     {"module": "C2f", "in_channels": 384, "out_channels": 128, "n_bottlenecks": 1, "shortcut": False},
                     "384×40×40", "128×40×40")
    neck_layers.append(l12)
    neck_edges.append(edge(l11.id, l12.id))

    # 13: Upsample(×2)
    l13 = make_layer("Upsample(×2)", "Custom",
                     {"module": "Upsample", "scale_factor": 2},
                     "128×40×40", "128×80×80")
    neck_layers.append(l13)
    neck_edges.append(edge(l12.id, l13.id))

    # 14: Concat([13, 4]) — merge with backbone P3 (c4)
    l14 = make_layer("Concat([13,4])", "Custom",
                     {"module": "Concat", "dimension": 1},
                     None, "192×80×80")
    neck_layers.append(l14)
    neck_edges.append(edge(l13.id, l14.id))

    # 15: C2f(192→64, n=1, shortcut=False) — P3/8 OUTPUT
    l15 = make_layer("C2f(192→64,n=1,P3/8)", "Custom",
                     {"module": "C2f", "in_channels": 192, "out_channels": 64, "n_bottlenecks": 1, "shortcut": False},
                     "192×80×80", "64×80×80")
    neck_layers.append(l15)
    neck_edges.append(edge(l14.id, l15.id))

    # 16: Conv(64→64, k3, s2, p1) — downsample back
    l16 = make_layer("Conv(64→64,k3,s2)", "Conv2d",
                     {"in_channels": 64, "out_channels": 64, "kernel_size": 3, "stride": 2, "padding": 1},
                     "64×80×80", "64×40×40")
    neck_layers.append(l16)
    neck_edges.append(edge(l15.id, l16.id))

    # 17: Concat([16, 12]) — merge with l12
    l17 = make_layer("Concat([16,12])", "Custom",
                     {"module": "Concat", "dimension": 1},
                     None, "192×40×40")
    neck_layers.append(l17)
    neck_edges.append(edge(l16.id, l17.id))

    # 18: C2f(192→128, n=1, shortcut=False) — P4/16 OUTPUT
    l18 = make_layer("C2f(192→128,n=1,P4/16)", "Custom",
                     {"module": "C2f", "in_channels": 192, "out_channels": 128, "n_bottlenecks": 1, "shortcut": False},
                     "192×40×40", "128×40×40")
    neck_layers.append(l18)
    neck_edges.append(edge(l17.id, l18.id))

    # 19: Conv(128→128, k3, s2, p1) — downsample
    l19 = make_layer("Conv(128→128,k3,s2)", "Conv2d",
                     {"in_channels": 128, "out_channels": 128, "kernel_size": 3, "stride": 2, "padding": 1},
                     "128×40×40", "128×20×20")
    neck_layers.append(l19)
    neck_edges.append(edge(l18.id, l19.id))

    # 20: Concat([19, 9]) — merge with backbone P5 (c9 SPPF)
    l20 = make_layer("Concat([19,9])", "Custom",
                     {"module": "Concat", "dimension": 1},
                     None, "384×20×20")
    neck_layers.append(l20)
    neck_edges.append(edge(l19.id, l20.id))

    # 21: C2f(384→256, n=1, shortcut=False) — P5/32 OUTPUT
    l21 = make_layer("C2f(384→256,n=1,P5/32)", "Custom",
                     {"module": "C2f", "in_channels": 384, "out_channels": 256, "n_bottlenecks": 1, "shortcut": False},
                     "384×20×20", "256×20×20")
    neck_layers.append(l21)
    neck_edges.append(edge(l20.id, l21.id))

    neck = make_block("Neck (FPN+PAN)", neck_layers, neck_edges, direction="vertical")

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
    top_edges = [
        edge(input_node.id, backbone.id),
        edge(backbone.id, neck.id),
        # Three heads (inside neck block) → Detect (cross-block edges)
        edge(l15.id, detect.id),
        edge(l18.id, detect.id),
        edge(l21.id, detect.id),
        edge(detect.id, output_node.id),
    ]

    # Skip connections from backbone to neck concat layers
    top_edges.append(edge(c6.id, l11.id, "skip", "P4"))     # BB C2f_6 → Concat 11
    top_edges.append(edge(c4.id, l14.id, "skip", "P3"))     # BB C2f_4 → Concat 14
    top_edges.append(edge(c9.id, l20.id, "skip", "P5"))     # BB SPPF_9 → Concat 20

    # YOLOv8 neck PAN: l12 (C2f) has 2 outputs — forward→l13 (Upsample, FPN up),
    # skip→l17 (Concat, PAN down). This matches yaml [[-1, 12], 1, Concat, [1]].
    neck_edges.append(edge(l12.id, l17.id, "skip", "P4_lateral"))

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
