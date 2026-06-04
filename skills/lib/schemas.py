import uuid
from dataclasses import dataclass, field
from typing import Literal, Any


@dataclass
class CodeMapping:
    raw: str
    functionName: str
    filePath: str
    startLine: int
    endLine: int


# --- Mind Map ---

@dataclass
class MindMapNode:
    id: str
    title: str
    content: str
    children: list['MindMapNode'] = field(default_factory=list)
    codeMapping: CodeMapping | None = None


@dataclass
class MindMapDocument:
    root: MindMapNode
    type: Literal['mind'] = 'mind'
    version: Literal[1] = 1


def create_mindmap_document(title: str = "New Mind Map") -> MindMapDocument:
    root = MindMapNode(id=str(uuid.uuid4()), title=title, content="")
    return MindMapDocument(root=root)


def is_valid_mindmap_document(obj: object) -> bool:
    if not isinstance(obj, dict):
        return False
    return obj.get("type") == "mind" and obj.get("version") == 1 and "root" in obj


# --- Derivation Tree ---

@dataclass
class DerivationNode:
    id: str
    title: str
    content: str
    stepNumber: int
    derivesFrom: str | None
    derivesTo: list[str] = field(default_factory=list)
    embedRefs: list[str] = field(default_factory=list)
    codeMapping: CodeMapping | None = None


@dataclass
class DerivationDocument:
    nodes: list[DerivationNode] = field(default_factory=list)
    type: Literal['derive'] = 'derive'
    version: Literal[1] = 1


def create_derive_document() -> DerivationDocument:
    return DerivationDocument()


def is_valid_derive_document(obj: object) -> bool:
    if not isinstance(obj, dict):
        return False
    return obj.get("type") == "derive" and obj.get("version") == 1 and isinstance(obj.get("nodes"), list)


# --- Network Graph ---

@dataclass
class GraphNode:
    id: str
    kind: Literal['input', 'output', 'layer', 'block']
    label: str
    layerType: str | None = None
    params: dict[str, Any] | None = None
    inputShape: str | None = None
    outputShape: str | None = None
    repeat: int | None = None
    children: list['GraphNode'] | None = None
    internalEdges: list['GraphEdge'] | None = None
    codeMapping: CodeMapping | None = None


@dataclass
class GraphEdge:
    id: str
    source: str
    target: str
    style: Literal['forward', 'skip'] = 'forward'
    label: str | None = None


@dataclass
class NetworkDocument:
    name: str
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    type: Literal['net'] = 'net'
    version: Literal[1, 2] = 2


def create_network_document(name: str = "New Network") -> NetworkDocument:
    input_id = str(uuid.uuid4())
    output_id = str(uuid.uuid4())
    edge_id = str(uuid.uuid4())
    input_node = GraphNode(id=input_id, kind="input", label="Input")
    output_node = GraphNode(id=output_id, kind="output", label="Output")
    edge = GraphEdge(id=edge_id, source=input_id, target=output_id)
    return NetworkDocument(name=name, nodes=[input_node, output_node], edges=[edge])


def is_valid_network_document(obj: object) -> bool:
    if not isinstance(obj, dict):
        return False
    if obj.get("type") != "net":
        return False
    version = obj.get("version")
    if version == 1:
        return isinstance(obj.get("name"), str) and isinstance(obj.get("blocks"), list)
    if version == 2:
        return isinstance(obj.get("name"), str) and isinstance(obj.get("nodes"), list)
    return False
