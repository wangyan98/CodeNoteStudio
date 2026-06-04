import uuid
import json
from dataclasses import dataclass, field
from typing import Literal, Any


@dataclass
class CodeMapping:
    raw: str
    functionName: str
    filePath: str
    startLine: int
    endLine: int


REQUIRED_CODE_MAPPING_FIELDS = {"raw", "functionName", "filePath", "startLine", "endLine"}


def parse_code_mapping(raw_json: str) -> CodeMapping:
    """Parse a --code-mapping JSON string with robust error handling.

    Gracefully handles common LLM-agent mistakes:
    - Malformed JSON → clear error with the JSON parse message
    - Missing required fields → clear error listing which fields are absent
    - startLine/endLine as strings → auto-coerced to int
    - Extra/unknown fields → silently stripped
    """
    if not raw_json or not raw_json.strip():
        raise ValueError("code-mapping JSON must not be empty")

    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON in code-mapping: {e}") from e

    if not isinstance(data, dict):
        raise ValueError(f"code-mapping must be a JSON object, got {type(data).__name__}")

    # Check missing required fields
    missing = REQUIRED_CODE_MAPPING_FIELDS - set(data.keys())
    if missing:
        raise ValueError(f"code-mapping missing required fields: {', '.join(sorted(missing))}")

    # Coerce startLine/endLine from string to int
    for field_name in ("startLine", "endLine"):
        if isinstance(data.get(field_name), str):
            try:
                data[field_name] = int(data[field_name])
            except ValueError:
                raise ValueError(f"code-mapping.{field_name} must be a number, got: {data[field_name]!r}")

    # Validate types
    for field_name in ("startLine", "endLine"):
        if not isinstance(data.get(field_name), int):
            raise ValueError(f"code-mapping.{field_name} must be an integer, got {type(data[field_name]).__name__}")
    for field_name in ("raw", "functionName", "filePath"):
        val = data.get(field_name)
        if not isinstance(val, str):
            raise ValueError(f"code-mapping.{field_name} must be a string, got {type(val).__name__}")

    # Strip extra fields the dataclass doesn't expect
    clean = {k: v for k, v in data.items() if k in REQUIRED_CODE_MAPPING_FIELDS}

    return CodeMapping(**clean)


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
