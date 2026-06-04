import json
import os
from typing import Any

from .schemas import (
    MindMapDocument, is_valid_mindmap_document,
    DerivationDocument, is_valid_derive_document,
    NetworkDocument, is_valid_network_document,
)


def ensure_dir(dir_path: str) -> None:
    os.makedirs(dir_path, exist_ok=True)


def read_json(path: str) -> Any:
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def write_json(path: str, data: Any) -> None:
    ensure_dir(os.path.dirname(path))
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def read_text(path: str) -> str:
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()


def write_text(path: str, content: str) -> None:
    ensure_dir(os.path.dirname(path))
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)


# --- Helper: dataclass <-> dict ---

def _to_dict(obj: Any) -> Any:
    if hasattr(obj, '__dict__'):
        return {k: _to_dict(v) for k, v in obj.__dict__.items()}
    if isinstance(obj, list):
        return [_to_dict(i) for i in obj]
    return obj


def _from_dict(cls: type, data: dict) -> Any:
    return cls(**data)


# --- Typed loaders ---

def load_mindmap(path: str) -> MindMapDocument:
    data = read_json(path)
    if not is_valid_mindmap_document(data):
        raise ValueError(f"Invalid mind map document: {path}")

    def _parse_node(d: dict) -> Any:
        from .schemas import MindMapNode, CodeMapping
        cm = None
        if d.get("codeMapping"):
            cm = CodeMapping(**d["codeMapping"])
        children = [_parse_node(c) for c in d.get("children", [])]
        return MindMapNode(
            id=d["id"], title=d["title"], content=d.get("content", ""),
            children=children, codeMapping=cm
        )

    root = _parse_node(data["root"])
    return MindMapDocument(root=root)


def save_mindmap(path: str, doc: MindMapDocument) -> None:
    write_json(path, _to_dict(doc))


def load_derive(path: str) -> DerivationDocument:
    data = read_json(path)
    if not is_valid_derive_document(data):
        raise ValueError(f"Invalid derivation document: {path}")

    from .schemas import DerivationNode, CodeMapping
    nodes = []
    for n in data["nodes"]:
        cm = None
        if n.get("codeMapping"):
            cm = CodeMapping(**n["codeMapping"])
        nodes.append(DerivationNode(
            id=n["id"], title=n["title"], content=n.get("content", ""),
            stepNumber=n["stepNumber"], derivesFrom=n.get("derivesFrom"),
            derivesTo=n.get("derivesTo", []), embedRefs=n.get("embedRefs", []),
            codeMapping=cm
        ))
    return DerivationDocument(nodes=nodes)


def save_derive(path: str, doc: DerivationDocument) -> None:
    write_json(path, _to_dict(doc))


def load_network(path: str) -> NetworkDocument:
    data = read_json(path)
    if not is_valid_network_document(data):
        raise ValueError(f"Invalid network document: {path}")

    from .schemas import GraphNode, GraphEdge, CodeMapping

    def _parse_node(d: dict) -> GraphNode:
        cm = None
        if d.get("codeMapping"):
            cm = CodeMapping(**d["codeMapping"])
        children = None
        if d.get("children"):
            children = [_parse_node(c) for c in d["children"]]
        internal_edges = None
        if d.get("internalEdges"):
            internal_edges = [GraphEdge(**e) for e in d["internalEdges"]]
        return GraphNode(
            id=d["id"], kind=d["kind"], label=d["label"],
            layerType=d.get("layerType"), params=d.get("params"),
            inputShape=d.get("inputShape"), outputShape=d.get("outputShape"),
            repeat=d.get("repeat"), children=children,
            internalEdges=internal_edges, codeMapping=cm
        )

    nodes = [_parse_node(n) for n in data["nodes"]]
    edges = [GraphEdge(**e) for e in data.get("edges", [])]
    return NetworkDocument(
        name=data["name"], nodes=nodes, edges=edges,
        version=data.get("version", 2)
    )


def save_network(path: str, doc: NetworkDocument) -> None:
    write_json(path, _to_dict(doc))
