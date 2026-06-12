#!/usr/bin/env python3
"""
Build a SAM3 (Segment Anything Model 3) net.json with direction-aware blocks.

SAM3 is a vision-language model for open-world segmentation and tracking.
Architecture overview:

  Input(Image + Text) → VL Backbone {ViT + TextEncoder} → Transformer Encoder
    → Transformer Decoder → Segmentation Head + DotProductScoring → Output(Masks + Boxes + Scores)

All blocks use direction="vertical" (edges enter from top, exit from bottom).
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
    parser = argparse.ArgumentParser(description="Build SAM3 net.json")
    parser.add_argument("path", help="Output path for .net.json file")
    parser.add_argument("--name", default="SAM3 (Segment Anything Model 3)", help="Network name")
    args = parser.parse_args()

    # ============================================================
    # INPUT / OUTPUT
    # ============================================================
    img_input = GraphNode(id=str(uuid.uuid4()), kind="input", label="Image Input",
                          inputShape="3×1008×1008")
    txt_input = GraphNode(id=str(uuid.uuid4()), kind="input", label="Text Input",
                          inputShape="[N tokens]")

    output_node = GraphNode(id=str(uuid.uuid4()), kind="output", label="Output",
                            outputShape="Masks + Boxes + Scores")

    # ============================================================
    # 1. ViT BACKBONE (horizontal) — patch embed + transformer blocks
    # ============================================================
    vit_layers = []
    vit_edges = []

    patch_embed = make_layer("PatchEmbed(p=14, dim=1024)", "Conv2d",
                             {"in_channels": 3, "out_channels": 1024, "kernel_size": 14, "stride": 14},
                             "3×1008×1008", "1024×72×72")
    vit_layers.append(patch_embed)

    # ViT block stages with global attention
    vit_stages = [
        ("ViT Stage 1\n(blocks 0-6, window)", "Custom",
         {"module": "ViTWindowBlock", "blocks": "0-6", "attn": "windowed", "dim": 1024, "heads": 16},
         "1024×72×72", "1024×72×72"),
        ("ViT Stage 2\n(block 7, global)", "MultiheadAttention",
         {"embed_dim": 1024, "num_heads": 16, "attn": "global"},
         "1024×72×72", "1024×72×72"),
        ("ViT Stage 3\n(blocks 8-14, window)", "Custom",
         {"module": "ViTWindowBlock", "blocks": "8-14", "attn": "windowed", "dim": 1024, "heads": 16},
         "1024×72×72", "1024×72×72"),
        ("ViT Stage 4\n(block 15, global)", "MultiheadAttention",
         {"embed_dim": 1024, "num_heads": 16, "attn": "global"},
         "1024×72×72", "1024×72×72"),
        ("ViT Stage 5\n(blocks 16-22, window)", "Custom",
         {"module": "ViTWindowBlock", "blocks": "16-22", "attn": "windowed", "dim": 1024, "heads": 16},
         "1024×72×72", "1024×72×72"),
        ("ViT Stage 6\n(block 23, global)", "MultiheadAttention",
         {"embed_dim": 1024, "num_heads": 16, "attn": "global"},
         "1024×72×72", "1024×72×72"),
        ("ViT Stage 7\n(blocks 24-31, window)", "Custom",
         {"module": "ViTWindowBlock", "blocks": "24-31", "attn": "windowed", "dim": 1024, "heads": 16},
         "1024×72×72", "1024×72×72"),
    ]

    prev = patch_embed
    for label, ltype, params, inshape, outshape in vit_stages:
        node = make_layer(label, ltype, params, inshape, outshape)
        vit_layers.append(node)
        vit_edges.append(edge(prev.id, node.id))
        prev = node

    vit_block = make_block("ViT Backbone\n(32 blocks, window_size=24, RoPE)", vit_layers, vit_edges, direction="vertical")

    # ============================================================
    # 2. FPN NECK (vertical) — 4-scale feature pyramid
    # ============================================================
    neck_layers = []
    neck_edges = []

    pos_enc = make_layer("PositionEmbeddingSine\n(num_pos_feats=256)", "Custom",
                         {"module": "PositionEmbeddingSine", "num_pos_feats": 256},
                         "1024×72×72", "1024×72×72")
    neck_layers.append(pos_enc)

    # Scale 4.0× (P2): 2× ConvTranspose2d → 256
    p2_up = make_layer("FPN P2 (scale 4.0×)\nConvTranspose2d→256", "ConvTranspose2d",
                       {"in_channels": 1024, "out_channels": 256, "kernel_size": 2, "stride": 2},
                       "1024×72×72", "256×288×288")
    neck_layers.append(p2_up)
    neck_edges.append(edge(pos_enc.id, p2_up.id))

    # Scale 2.0× (P3): ConvTranspose2d → 256
    p3_up = make_layer("FPN P3 (scale 2.0×)\nConvTranspose2d→256", "ConvTranspose2d",
                       {"in_channels": 1024, "out_channels": 256, "kernel_size": 2, "stride": 2},
                       "1024×72×72", "256×144×144")
    neck_layers.append(p3_up)
    neck_edges.append(edge(pos_enc.id, p3_up.id))

    # Scale 1.0× (P4): Conv1×1 → 256
    p4_conv = make_layer("FPN P4 (scale 1.0×)\nConv1×1→256", "Conv2d",
                         {"in_channels": 1024, "out_channels": 256, "kernel_size": 1},
                         "1024×72×72", "256×72×72")
    neck_layers.append(p4_conv)
    neck_edges.append(edge(pos_enc.id, p4_conv.id))

    # Scale 0.5× (P5): MaxPool2d → 256
    p5_down = make_layer("FPN P5 (scale 0.5×)\nMaxPool2d→256", "MaxPool2d",
                         {"kernel_size": 2, "stride": 2},
                         "1024×72×72", "256×36×36")
    neck_layers.append(p5_down)
    neck_edges.append(edge(pos_enc.id, p5_down.id))

    fpn_block = make_block("FPN Neck\n(4-scale → d_model=256)", neck_layers, neck_edges, direction="vertical")

    # ============================================================
    # 3. TEXT ENCODER (vertical)
    # ============================================================
    text_layers = []
    text_edges = []

    tokenizer = make_layer("BPE Tokenizer\n(SimpleTokenizer)", "Embedding",
                           {"num_embeddings": 16000, "embedding_dim": 1024},
                           "[N tokens]", "[N tokens]×1024")
    text_layers.append(tokenizer)

    for i in range(6):
        stage = make_layer(f"Text Encoder Stage {i+1}\n(4× TransformerBlock)", "MultiheadAttention",
                          {"embed_dim": 1024, "num_heads": 16},
                          "[N]×1024", "[N]×1024")
        text_layers.append(stage)
        if i == 0:
            text_edges.append(edge(tokenizer.id, stage.id))
        else:
            text_edges.append(edge(text_layers[-2].id, stage.id))

    text_proj = make_layer("Text Projection\n(Linear 1024→256)", "Linear",
                          {"in_features": 1024, "out_features": 256},
                          "[N]×1024", "[N]×256")
    text_layers.append(text_proj)
    text_edges.append(edge(text_layers[-2].id, text_proj.id))

    text_block = make_block("Text Encoder\n(VETextEncoder, 24 layers, width=1024, heads=16)", text_layers, text_edges, direction="vertical")

    # ============================================================
    # 4. VL BACKBONE (visual + text combiner)
    # ============================================================
    vl_layers = []
    vl_edges = []

    vis_neck_node = make_layer("Visual Neck Output\n(image features)", "Identity", {},
                               "Multi-scale\n256", "Multi-scale\n256")
    text_out_node = make_layer("Text Encoder Output\n(language features)", "Identity", {},
                               "[N]×256", "[N]×256")
    vl_layers.extend([vis_neck_node, text_out_node])

    vl_block = make_block("VL Backbone\n(SAM3VLBackbone, scalp=1)", vl_layers, vl_edges, direction="vertical")

    # ============================================================
    # 5. GEOMETRY ENCODER (vertical)
    # ============================================================
    geo_layers = []
    geo_edges = []

    geo_pos_enc = make_layer("Geometry PositionEnc\n(PositionEmbeddingSine)", "Custom",
                             {"module": "PositionEmbeddingSine", "num_pos_feats": 256},
                             "Pts/Boxes×256", "Pts/Boxes×256")
    geo_layers.append(geo_pos_enc)

    cx_fuser = make_layer("CXBlock Fuser\n(k7, DWConv, LayerScale)", "Custom",
                          {"module": "CXBlock", "kernel_size": 7, "dim": 256},
                          "256", "256")
    geo_layers.append(cx_fuser)
    geo_edges.append(edge(geo_pos_enc.id, cx_fuser.id))

    geo_enc = make_layer("Geometry Transformer\n(3× Self+Cross-Attn)", "MultiheadAttention",
                         {"embed_dim": 256, "num_heads": 8},
                         "Pts/Boxes×256", "Pts/Boxes×256")
    geo_layers.append(geo_enc)
    geo_edges.append(edge(cx_fuser.id, geo_enc.id))

    geo_proj = make_layer("Post-Encode Projection\n(Linear 256→256)", "Linear",
                         {"in_features": 256, "out_features": 256},
                         "Pts/Boxes×256", "Pts/Boxes×256")
    geo_layers.append(geo_proj)
    geo_edges.append(edge(geo_enc.id, geo_proj.id))

    geo_block = make_block("Geometry Encoder\n(3 layers, encode points+boxes)", geo_layers, geo_edges, direction="vertical")

    # ============================================================
    # 6. PROMPT ENCODER (concatenates text+geo+visual prompts)
    # ============================================================
    prompt_concat = make_layer("Prompt Concatenation\n(Text + Geo + Visual)", "Custom",
                               {"module": "Concat"},
                               "Text[N]×256\n+Geo×256\n+Vis×256", "[N+Pts]×256")

    # ============================================================
    # 7. TRANSFORMER ENCODER (vertical)
    # ============================================================
    enc_layers = []
    enc_edges = []

    for i in range(6):
        enc_layer = make_layer(f"Encoder Layer {i+1}\n(Self-Attn + Cross-Attn)", "MultiheadAttention",
                               {"embed_dim": 256, "num_heads": 8},
                               "HW×256", "HW×256")
        enc_layers.append(enc_layer)
        if i > 0:
            enc_edges.append(edge(enc_layers[i-1].id, enc_layer.id))

    enc_ffn = make_layer("Encoder Output\n(FFN 256→2048→256)", "Linear",
                         {"in_features": 256, "out_features": 256},
                         "HW×256", "HW×256")
    enc_layers.append(enc_ffn)
    enc_edges.append(edge(enc_layers[-2].id, enc_ffn.id))

    enc_block = make_block("Transformer Encoder\n(6 layers, d=256, FFN=2048, 8 heads, pre-norm)", enc_layers, enc_edges, direction="vertical")

    # ============================================================
    # 8. TRANSFORMER DECODER (vertical)
    # ============================================================
    dec_layers = []
    dec_edges = []

    query_embed = make_layer("Query Embeddings\n(200 queries × 256)", "Embedding",
                            {"num_embeddings": 200, "embedding_dim": 256},
                            "200×256", "200×256")
    dec_layers.append(query_embed)

    for i in range(6):
        dec_layer = make_layer(f"Decoder Layer {i+1}\n(Self+CrossImg+CrossTxt)", "MultiheadAttention",
                               {"embed_dim": 256, "num_heads": 8},
                               "200×256", "200×256")
        dec_layers.append(dec_layer)
        if i == 0:
            dec_edges.append(edge(query_embed.id, dec_layer.id))
        else:
            dec_edges.append(edge(dec_layers[i].id, dec_layer.id)) # previous layer (skipping query_embed)

    # bbox regression + classification heads
    bbox_head = make_layer("BBox Regression\n(MLP 256→256→4)", "Linear",
                           {"in_features": 256, "out_features": 4},
                           "200×256", "200×4")
    dec_layers.append(bbox_head)
    dec_edges.append(edge(dec_layers[-2].id, bbox_head.id))

    dec_block = make_block("Transformer Decoder\n(6 layers, 200 queries, DAC, box refine, presence token)", dec_layers, dec_edges, direction="vertical")

    # ============================================================
    # 9. SEGMENTATION HEAD (vertical)
    # ============================================================
    seg_layers = []
    seg_edges = []

    pixel_dec = make_layer("PixelDecoder\n(3× upsampling stages)", "Custom",
                           {"module": "PixelDecoder", "upsampling_stages": 3, "hidden_dim": 256},
                           "Multi-scale\nFPN features", "256×H/4×W/4")
    seg_layers.append(pixel_dec)

    cross_attn = make_layer("Cross-Attend Prompt\n(MultiheadAttn, 8 heads)", "MultiheadAttention",
                            {"embed_dim": 256, "num_heads": 8},
                            "ObjQueries×256\n+ PixelFeats", "MaskFeats")
    seg_layers.append(cross_attn)
    seg_edges.append(edge(pixel_dec.id, cross_attn.id))

    mask_pred = make_layer("Mask Prediction\n(PredMasks)", "Custom",
                           {"module": "PredMasks"},
                           "MaskFeats×256", "Masks\n[200×H×W]")
    seg_layers.append(mask_pred)
    seg_edges.append(edge(cross_attn.id, mask_pred.id))

    seg_block = make_block("Segmentation Head\n(UniversalSegmentationHead, 3× upsample)", seg_layers, seg_edges, direction="vertical")

    # ============================================================
    # 10. DOT PRODUCT SCORING
    # ============================================================
    score_mlp = make_layer("DotProductScoring\n(MLP 256→2048→256 → Dot)", "Linear",
                           {"in_features": 256, "out_features": 256},
                           "Queries×256\n+ Text×256", "Scores\n[200×1]")

    # ============================================================
    # 11. TRACKER MODULE (for video)
    # ============================================================
    tracker_layers = []
    tracker_edges = []

    mask_enc = make_layer("Mask Memory Encoder\n(PosEnc+DownSampler+Fuser)", "Custom",
                          {"module": "SimpleMaskEncoder", "out_dim": 64},
                          "Mask×H×W", "64×H×W")
    tracker_layers.append(mask_enc)

    for i in range(4):
        trk_enc = make_layer(f"Tracker Enc Layer {i+1}\n(RoPE Self+Cross Attn)", "MultiheadAttention",
                             {"embed_dim": 256, "num_heads": 1},
                             "ObjTokens×256", "ObjTokens×256")
        tracker_layers.append(trk_enc)
        if i == 0:
            tracker_edges.append(edge(mask_enc.id, trk_enc.id))
        else:
            tracker_edges.append(edge(tracker_layers[i].id, trk_enc.id))

    trk_block = make_block("Tracker Module\n(4-layer RoPE, mask memory, 7-frame cond)", tracker_layers, tracker_edges, direction="vertical")

    # ============================================================
    # TOP-LEVEL NODES
    # ============================================================
    top_nodes = [
        # LEFT: segmentation / output components
        seg_block, score_mlp,
        # CENTER-LEFT: decoder & encoder (core processing chain)
        dec_block, enc_block,
        # CENTER: output
        output_node,
        # MAIN TRUNK: visual backbone (image → ViT → FPN → VL)
        img_input, vit_block, fpn_block, vl_block,
        # RIGHT BRANCH: text encoding + geometry + prompt
        txt_input, text_block, geo_block, prompt_concat,
        # FAR RIGHT: tracker (video)
        trk_block,
    ]

    # ============================================================
    # TOP-LEVEL EDGES
    # Port indices are assigned automatically by source/target X position
    # at render time, so left-side nodes always connect to left-side ports.
    # Edge order in the JSON does not affect visual port assignment.
    # ============================================================
    top_edges = [
        # Image flow (left side of main trunk)
        edge(img_input.id, vit_block.id),
        edge(vit_block.id, fpn_block.id, "forward", "ViT→FPN"),
        edge(fpn_block.id, vl_block.id, "forward", "visual"),

        # Text flow (right branch)
        edge(txt_input.id, text_block.id),
        edge(text_block.id, vl_block.id, "forward", "text"),

        # VL backbone → geometry encoder (image features cross-attention)
        edge(vl_block.id, geo_block.id, "forward", "img feats"),

        # Prompt Concatenation (2 inputs from VL Backbone + Geometry Encoder)
        edge(vl_block.id, prompt_concat.id, "forward", "text feats"),
        edge(geo_block.id, prompt_concat.id, "forward", "geo feats"),

        # Transformer Encoder (2 inputs: VL Backbone bypass + Prompt Concat)
        edge(vl_block.id, enc_block.id, "skip", "img feats"),
        edge(prompt_concat.id, enc_block.id, "forward", "prompt"),

        # Encoder → Decoder
        edge(enc_block.id, dec_block.id, "forward", "memory"),

        # Prompt → Decoder (text cross-attention)
        edge(prompt_concat.id, dec_block.id, "skip", "text cross-attn"),

        # Segmentation Head (2 inputs: Decoder queries + VL Backbone FPN features)
        edge(dec_block.id, seg_block.id, "forward", "obj queries"),
        edge(vl_block.id, seg_block.id, "skip", "FPN feats"),

        # Dot Product Scoring (2 inputs: Decoder queries + Prompt text embeddings)
        edge(dec_block.id, score_mlp.id, "forward", "queries"),
        edge(prompt_concat.id, score_mlp.id, "skip", "text"),

        # Outputs (masks, scores, boxes)
        edge(seg_block.id, output_node.id, "forward", "masks"),
        edge(score_mlp.id, output_node.id, "forward", "scores"),
        edge(dec_block.id, output_node.id, "forward", "boxes"),

        # Tracker (video: VL Backbone visual features + Decoder detections)
        edge(vl_block.id, trk_block.id, "forward", "visual feats\n(video)"),
        edge(dec_block.id, trk_block.id, "skip", "detections\n(video)"),
    ]

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
        "imageInputId": img_input.id,
        "textInputId": txt_input.id,
        "outputId": output_node.id,
        "vitBlockId": vit_block.id,
        "fpnBlockId": fpn_block.id,
        "textBlockId": text_block.id,
        "vlBlockId": vl_block.id,
        "geoBlockId": geo_block.id,
        "encBlockId": enc_block.id,
        "decBlockId": dec_block.id,
        "segBlockId": seg_block.id,
        "trackerBlockId": trk_block.id,
    }, indent=2))


if __name__ == "__main__":
    main()
