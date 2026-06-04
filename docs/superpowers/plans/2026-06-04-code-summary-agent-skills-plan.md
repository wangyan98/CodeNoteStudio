# Code Summary Agent Skills — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 4 Claude Code skills (mind-map, derive-tree, network-graph, markdown) with Python scripts and comprehensive tests, plus a shared Python library, to enable an LLM agent to create and manipulate notebook files.

**Architecture:** A shared `skills/lib/` with dataclass schemas and file I/O utilities. Four skill directories under `skills/`, each containing `SKILL.md`, `scripts/` with argparse-based Python CLI tools, and `tests/` with pytest-based test suites. Scripts import from `skills.lib` via `PYTHONPATH`. All work isolated on a new git branch.

**Tech Stack:** Python 3.11+, pytest, dataclasses, uuid, argparse, json, subprocess (for tests)

---

### Task 1: Branch and directory scaffold

**Files:**
- Create: `skills/` directory tree (all dirs, no code yet)

- [ ] **Step 1: Create new branch**

```bash
cd /Users/wangyan/Desktop/note
git checkout -b feat/code-summary-agent-skills
```

- [ ] **Step 2: Create all directories**

```bash
mkdir -p skills/lib/tests
mkdir -p skills/mind-map/scripts
mkdir -p skills/mind-map/tests
mkdir -p skills/derive-tree/scripts
mkdir -p skills/derive-tree/tests
mkdir -p skills/network-graph/scripts
mkdir -p skills/network-graph/tests
mkdir -p skills/markdown/scripts
mkdir -p skills/markdown/tests
```

- [ ] **Step 3: Create `__init__.py` files so Python treats everything as packages**

```bash
touch skills/__init__.py
touch skills/lib/__init__.py
touch skills/lib/tests/__init__.py
touch skills/mind-map/tests/__init__.py
touch skills/derive-tree/tests/__init__.py
touch skills/network-graph/tests/__init__.py
touch skills/markdown/tests/__init__.py
```

- [ ] **Step 4: Commit**

```bash
git add skills/
git commit -m "chore: scaffold skill directories for code-summary agent"
```

---

### Task 2: Shared lib — schemas.py

**Files:**
- Create: `skills/lib/schemas.py`
- Create: `skills/lib/tests/test_schemas.py`

- [ ] **Step 1: Write the failing schema tests**

Create `skills/lib/tests/test_schemas.py`:

```python
import json
import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.schemas import (
    CodeMapping,
    MindMapNode, MindMapDocument, create_mindmap_document, is_valid_mindmap_document,
    DerivationNode, DerivationDocument, create_derive_document, is_valid_derive_document,
    GraphNode, GraphEdge, NetworkDocument, create_network_document, is_valid_network_document,
)


class TestCodeMapping:
    def test_round_trip(self):
        cm = CodeMapping(raw="def foo():", functionName="foo", filePath="a.py", startLine=1, endLine=3)
        d = cm.__dict__
        cm2 = CodeMapping(**d)
        assert cm2.functionName == "foo"
        assert cm2.filePath == "a.py"


class TestMindMapDocument:
    def test_create_default(self):
        doc = create_mindmap_document()
        assert doc.type == "mind"
        assert doc.version == 1
        assert doc.root.title == "New Mind Map"
        assert doc.root.children == []

    def test_json_round_trip(self):
        doc = create_mindmap_document()
        raw = json.dumps(doc, default=lambda o: o.__dict__)
        data = json.loads(raw)
        assert data["type"] == "mind"
        assert data["version"] == 1
        assert data["root"]["title"] == "New Mind Map"

    def test_is_valid_rejects_wrong_type(self):
        assert not is_valid_mindmap_document({"type": "note", "version": 1})

    def test_is_valid_rejects_missing_root(self):
        assert not is_valid_mindmap_document({"type": "mind", "version": 1})

    def test_is_valid_accepts_correct(self):
        doc = create_mindmap_document()
        d = json.loads(json.dumps(doc, default=lambda o: o.__dict__))
        assert is_valid_mindmap_document(d)

    def test_nested_children(self):
        root = MindMapNode(id="r", title="Root", content="", children=[])
        child = MindMapNode(id="c1", title="Child", content="x", children=[])
        root.children.append(child)
        doc = MindMapDocument(root=root)
        assert len(doc.root.children) == 1
        assert doc.root.children[0].title == "Child"

    def test_code_mapping_optional(self):
        cm = CodeMapping(raw="x", functionName="f", filePath="f.py", startLine=1, endLine=2)
        node = MindMapNode(id="n", title="N", content="", children=[], codeMapping=cm)
        assert node.codeMapping is not None
        assert node.codeMapping.functionName == "f"


class TestDerivationDocument:
    def test_create_default(self):
        doc = create_derive_document()
        assert doc.type == "derive"
        assert doc.version == 1
        assert doc.nodes == []

    def test_json_round_trip(self):
        doc = create_derive_document()
        n = DerivationNode(id="s1", title="Step 1", content="x", stepNumber=1,
                           derivesFrom=None, derivesTo=[], embedRefs=[], codeMapping=None)
        doc.nodes.append(n)
        raw = json.dumps(doc, default=lambda o: o.__dict__)
        data = json.loads(raw)
        assert len(data["nodes"]) == 1
        assert data["nodes"][0]["stepNumber"] == 1

    def test_is_valid_rejects_wrong_type(self):
        assert not is_valid_derive_document({"type": "note", "version": 1})

    def test_is_valid_accepts_correct(self):
        doc = create_derive_document()
        d = json.loads(json.dumps(doc, default=lambda o: o.__dict__))
        assert is_valid_derive_document(d)


class TestNetworkDocument:
    def test_create_default(self):
        doc = create_network_document()
        assert doc.type == "net"
        assert doc.version == 2
        assert len(doc.nodes) == 2  # input + output
        assert len(doc.edges) == 1
        assert doc.nodes[0].kind == "input"
        assert doc.nodes[1].kind == "output"

    def test_json_round_trip(self):
        doc = create_network_document("MyNet")
        raw = json.dumps(doc, default=lambda o: o.__dict__)
        data = json.loads(raw)
        assert data["name"] == "MyNet"
        assert len(data["nodes"]) == 2

    def test_is_valid_v1(self):
        assert is_valid_network_document({"type": "net", "version": 1, "name": "n", "blocks": []})

    def test_is_valid_v2(self):
        assert is_valid_network_document({"type": "net", "version": 2, "name": "n", "nodes": []})

    def test_is_valid_rejects(self):
        assert not is_valid_network_document({"type": "net", "version": 2, "name": "n"})
        # missing nodes
        assert not is_valid_network_document({"type": "x", "version": 1})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/wangyan/Desktop/note
python -m pytest skills/lib/tests/test_schemas.py -v
```

Expected: all fail with `ModuleNotFoundError: No module named 'lib.schemas'`

- [ ] **Step 3: Write schemas.py implementation**

Create `skills/lib/schemas.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest skills/lib/tests/test_schemas.py -v
```

Expected: 14 passed

- [ ] **Step 5: Commit**

```bash
git add skills/lib/schemas.py skills/lib/tests/test_schemas.py
git commit -m "feat: add Python schemas for mind-map, derive-tree, and network-graph"
```

---

### Task 3: Shared lib — file_utils.py

**Files:**
- Create: `skills/lib/file_utils.py`
- Create: `skills/lib/tests/test_file_utils.py`

- [ ] **Step 1: Write the failing file_utils tests**

Create `skills/lib/tests/test_file_utils.py`:

```python
import json
import tempfile
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import (
    read_json, write_json, read_text, write_text, ensure_dir,
    load_mindmap, save_mindmap,
    load_derive, save_derive,
    load_network, save_network,
)
from lib.schemas import (
    create_mindmap_document, create_derive_document, create_network_document,
    DerivationNode,
)


class TestReadWriteJson:
    def test_write_and_read(self):
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
            path = f.name
        try:
            write_json(path, {"key": "value"})
            data = read_json(path)
            assert data == {"key": "value"}
        finally:
            os.unlink(path)

    def test_write_creates_parent_dirs(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "sub", "nested", "file.json")
            write_json(path, [1, 2, 3])
            data = read_json(path)
            assert data == [1, 2, 3]


class TestReadWriteText:
    def test_write_and_read(self):
        with tempfile.NamedTemporaryFile(suffix=".md", delete=False) as f:
            path = f.name
        try:
            write_text(path, "# Hello\n\nWorld")
            content = read_text(path)
            assert content == "# Hello\n\nWorld"
        finally:
            os.unlink(path)


class TestEnsureDir:
    def test_creates_nested(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = os.path.join(tmp, "a", "b", "c")
            ensure_dir(p)
            assert os.path.isdir(p)


class TestMindMapIO:
    def test_load_save_round_trip(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "test.mind.json")
            doc = create_mindmap_document("Test")
            save_mindmap(path, doc)
            loaded = load_mindmap(path)
            assert loaded.type == "mind"
            assert loaded.root.title == "Test"

    def test_load_invalid_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "bad.mind.json")
            write_json(path, {"type": "mind", "version": 1})
            with pytest.raises(ValueError, match="Invalid mind map"):
                load_mindmap(path)


class TestDeriveIO:
    def test_load_save_round_trip(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "test.derive.json")
            doc = create_derive_document()
            doc.nodes.append(DerivationNode(
                id="s1", title="Step", content="x", stepNumber=1,
                derivesFrom=None, derivesTo=[], embedRefs=[]
            ))
            save_derive(path, doc)
            loaded = load_derive(path)
            assert len(loaded.nodes) == 1

    def test_load_invalid_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "bad.derive.json")
            write_json(path, {"type": "derive", "version": 1, "nodes": "not_a_list"})
            with pytest.raises(ValueError, match="Invalid derivation"):
                load_derive(path)


class TestNetworkIO:
    def test_load_save_round_trip(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "test.net.json")
            doc = create_network_document("MyNet")
            save_network(path, doc)
            loaded = load_network(path)
            assert loaded.name == "MyNet"
            assert len(loaded.nodes) == 2

    def test_load_invalid_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "bad.net.json")
            write_json(path, {"type": "net", "version": 2, "name": "x"})
            with pytest.raises(ValueError, match="Invalid network"):
                load_network(path)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest skills/lib/tests/test_file_utils.py -v
```

Expected: all fail with `ModuleNotFoundError`

- [ ] **Step 3: Write file_utils.py implementation**

Create `skills/lib/file_utils.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest skills/lib/tests/test_file_utils.py -v
```

Expected: 8 passed

- [ ] **Step 5: Commit**

```bash
git add skills/lib/file_utils.py skills/lib/tests/test_file_utils.py
git commit -m "feat: add file_utils with typed loaders/savers for all document types"
```

---

### Task 4: Mind Map skill — create_mindmap.py

**Files:**
- Create: `skills/mind-map/scripts/create_mindmap.py`
- Create: `skills/mind-map/tests/test_create_mindmap.py`

- [ ] **Step 1: Write failing test**

Create `skills/mind-map/tests/test_create_mindmap.py`:

```python
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.file_utils import read_json


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "create_mindmap.py"), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def test_creates_valid_mindmap():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        code, out, err = run_script(path)
        assert code == 0, f"stderr: {err}"
        result = json.loads(out)
        assert result["ok"] is True
        assert "id" in result
        data = read_json(path)
        assert data["type"] == "mind"
        assert data["version"] == 1
        assert data["root"]["title"] == "New Mind Map"


def test_idempotent_on_existing():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        run_script(path)
        code, out, err = run_script(path)
        assert code == 0
        result = json.loads(out)
        assert result["ok"] is True


def test_creates_parent_directory():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "sub", "nested", "test.mind.json")
        code, out, err = run_script(path)
        assert code == 0
        assert os.path.isfile(path)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest skills/mind-map/tests/test_create_mindmap.py -v
```

Expected: FAIL with `No such file or directory: '.../create_mindmap.py'`

- [ ] **Step 3: Write create_mindmap.py**

Create `skills/mind-map/scripts/create_mindmap.py`:

```python
#!/usr/bin/env python3
"""Create a new .mind.json file with a root node."""
import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.schemas import create_mindmap_document, is_valid_mindmap_document
from lib.file_utils import write_json, read_json


def main():
    parser = argparse.ArgumentParser(description="Create a .mind.json file")
    parser.add_argument("path", help="Path to the .mind.json file")
    args = parser.parse_args()

    if os.path.exists(args.path):
        try:
            data = read_json(args.path)
            if is_valid_mindmap_document(data):
                print(json.dumps({"ok": True, "id": data["root"]["id"]}))
                return
        except Exception:
            pass

    doc = create_mindmap_document()
    write_json(args.path, doc)
    print(json.dumps({"ok": True, "id": doc.root.id}))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest skills/mind-map/tests/test_create_mindmap.py -v
```

Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add skills/mind-map/scripts/create_mindmap.py skills/mind-map/tests/test_create_mindmap.py
git commit -m "feat(mind-map): add create_mindmap.py script with tests"
```

---

### Task 5: Mind Map skill — add_node.py

**Files:**
- Create: `skills/mind-map/scripts/add_node.py`
- Create: `skills/mind-map/tests/test_add_node.py`

- [ ] **Step 1: Write failing test**

Create `skills/mind-map/tests/test_add_node.py`:

```python
import json
import os
import subprocess
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.schemas import create_mindmap_document
from lib.file_utils import write_json, load_mindmap
import tempfile


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "add_node.py"), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def _make_doc(path):
    doc = create_mindmap_document("Root")
    write_json(path, doc)
    return doc


def test_adds_child_to_root():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        doc = _make_doc(path)
        root_id = doc.root.id
        code, out, err = run_script(path, root_id, "--title", "Child1", "--content", "Hello")
        assert code == 0, f"stderr: {err}"
        result = json.loads(out)
        assert result["ok"] is True
        new_id = result["id"]
        loaded = load_mindmap(path)
        assert len(loaded.root.children) == 1
        child = loaded.root.children[0]
        assert child.id == new_id
        assert child.title == "Child1"
        assert child.content == "Hello"


def test_adds_child_to_nested_node():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        doc = create_mindmap_document("Root")
        from lib.schemas import MindMapNode
        import uuid
        mid = MindMapNode(id=str(uuid.uuid4()), title="Mid", content="", children=[])
        doc.root.children.append(mid)
        write_json(path, doc)

        code, out, err = run_script(path, mid.id, "--title", "Leaf")
        assert code == 0
        loaded = load_mindmap(path)
        assert len(loaded.root.children[0].children) == 1
        assert loaded.root.children[0].children[0].title == "Leaf"


def test_rejects_unknown_parent():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        _make_doc(path)
        code, out, err = run_script(path, "nonexistent-id", "--title", "X")
        assert code == 1
        result = json.loads(out)
        assert result["ok"] is False
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest skills/mind-map/tests/test_add_node.py -v
```

Expected: FAIL (script not found)

- [ ] **Step 3: Write add_node.py**

Create `skills/mind-map/scripts/add_node.py`:

```python
#!/usr/bin/env python3
"""Add a child node to a mind map tree."""
import argparse
import json
import os
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.file_utils import load_mindmap, save_mindmap
from lib.schemas import MindMapNode


def find_node(node: MindMapNode, node_id: str) -> MindMapNode | None:
    if node.id == node_id:
        return node
    for child in node.children:
        found = find_node(child, node_id)
        if found:
            return found
    return None


def main():
    parser = argparse.ArgumentParser(description="Add a child node to a mind map")
    parser.add_argument("path", help="Path to the .mind.json file")
    parser.add_argument("parent_id", help="ID of the parent node")
    parser.add_argument("--title", default="New Node")
    parser.add_argument("--content", default="")
    args = parser.parse_args()

    if not os.path.exists(args.path):
        print(json.dumps({"ok": False, "error": f"File not found: {args.path}"}))
        sys.exit(1)

    doc = load_mindmap(args.path)
    parent = find_node(doc.root, args.parent_id)
    if parent is None:
        print(json.dumps({"ok": False, "error": f"Parent node not found: {args.parent_id}"}))
        sys.exit(1)

    new_node = MindMapNode(id=str(uuid.uuid4()), title=args.title, content=args.content)
    parent.children.append(new_node)
    save_mindmap(args.path, doc)
    print(json.dumps({"ok": True, "id": new_node.id}))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest skills/mind-map/tests/test_add_node.py -v
```

Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add skills/mind-map/scripts/add_node.py skills/mind-map/tests/test_add_node.py
git commit -m "feat(mind-map): add add_node.py script with tests"
```

---

### Task 6: Mind Map skill — update_node.py

**Files:**
- Create: `skills/mind-map/scripts/update_node.py`
- Create: `skills/mind-map/tests/test_update_node.py`

- [ ] **Step 1: Write failing test**

Create `skills/mind-map/tests/test_update_node.py`:

```python
import json, os, subprocess, sys, tempfile, uuid
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.schemas import create_mindmap_document, MindMapNode
from lib.file_utils import write_json, load_mindmap


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "update_node.py"), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def _make_doc(path):
    doc = create_mindmap_document("Root")
    child = MindMapNode(id=str(uuid.uuid4()), title="Child", content="Old", children=[])
    doc.root.children.append(child)
    write_json(path, doc)
    return doc


def test_updates_title():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        doc = _make_doc(path)
        child_id = doc.root.children[0].id
        code, out, err = run_script(path, child_id, "--title", "New Title")
        assert code == 0
        loaded = load_mindmap(path)
        assert loaded.root.children[0].title == "New Title"
        assert loaded.root.children[0].content == "Old"  # unchanged


def test_updates_content():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        doc = _make_doc(path)
        child_id = doc.root.children[0].id
        code, out, err = run_script(path, child_id, "--content", "New Content")
        assert code == 0
        loaded = load_mindmap(path)
        assert loaded.root.children[0].content == "New Content"


def test_sets_code_mapping():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        doc = _make_doc(path)
        child_id = doc.root.children[0].id
        cm = '{"raw":"def foo():","functionName":"foo","filePath":"a.py","startLine":1,"endLine":3}'
        code, out, err = run_script(path, child_id, "--code-mapping", cm)
        assert code == 0
        loaded = load_mindmap(path)
        assert loaded.root.children[0].codeMapping is not None
        assert loaded.root.children[0].codeMapping.functionName == "foo"


def test_rejects_unknown_node():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        _make_doc(path)
        code, out, err = run_script(path, "nonexistent", "--title", "X")
        assert code == 1
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest skills/mind-map/tests/test_update_node.py -v
```

Expected: FAIL

- [ ] **Step 3: Write update_node.py**

Create `skills/mind-map/scripts/update_node.py`:

```python
#!/usr/bin/env python3
"""Update a mind map node's title, content, or codeMapping."""
import argparse, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.file_utils import load_mindmap, save_mindmap
from lib.schemas import MindMapNode, CodeMapping


def find_node(node: MindMapNode, node_id: str) -> MindMapNode | None:
    if node.id == node_id:
        return node
    for child in node.children:
        found = find_node(child, node_id)
        if found:
            return found
    return None


def main():
    parser = argparse.ArgumentParser(description="Update a mind map node")
    parser.add_argument("path", help="Path to the .mind.json file")
    parser.add_argument("node_id", help="ID of the node to update")
    parser.add_argument("--title")
    parser.add_argument("--content")
    parser.add_argument("--code-mapping", help='JSON: {"raw":"...","functionName":"...",...}')
    args = parser.parse_args()

    doc = load_mindmap(args.path)
    node = find_node(doc.root, args.node_id)
    if node is None:
        print(json.dumps({"ok": False, "error": f"Node not found: {args.node_id}"}))
        sys.exit(1)

    if args.title is not None:
        node.title = args.title
    if args.content is not None:
        node.content = args.content
    if args.code_mapping is not None:
        data = json.loads(args.code_mapping)
        node.codeMapping = CodeMapping(**data)

    save_mindmap(args.path, doc)
    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest skills/mind-map/tests/test_update_node.py -v
```

Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add skills/mind-map/scripts/update_node.py skills/mind-map/tests/test_update_node.py
git commit -m "feat(mind-map): add update_node.py script with tests"
```

---

### Task 7: Mind Map skill — delete_node.py + integration

**Files:**
- Create: `skills/mind-map/scripts/delete_node.py`
- Create: `skills/mind-map/tests/test_delete_node.py`
- Create: `skills/mind-map/tests/test_mindmap_integration.py`

- [ ] **Step 1: Write failing tests**

Create `skills/mind-map/tests/test_delete_node.py`:

```python
import json, os, subprocess, sys, tempfile, uuid
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.schemas import create_mindmap_document, MindMapNode
from lib.file_utils import write_json, load_mindmap


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "delete_node.py"), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip()


def _make_doc_with_child(path):
    doc = create_mindmap_document("Root")
    child = MindMapNode(id=str(uuid.uuid4()), title="Child", content="x", children=[])
    doc.root.children.append(child)
    write_json(path, doc)
    return doc


def test_deletes_leaf_node():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        doc = _make_doc_with_child(path)
        child_id = doc.root.children[0].id
        code, out = run_script(path, child_id)
        assert code == 0
        loaded = load_mindmap(path)
        assert len(loaded.root.children) == 0


def test_deletes_subtree():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        doc = create_mindmap_document("Root")
        mid = MindMapNode(id=str(uuid.uuid4()), title="Mid", content="", children=[])
        leaf = MindMapNode(id=str(uuid.uuid4()), title="Leaf", content="", children=[])
        mid.children.append(leaf)
        doc.root.children.append(mid)
        write_json(path, doc)

        code, out = run_script(path, mid.id)
        assert code == 0
        loaded = load_mindmap(path)
        assert len(loaded.root.children) == 0


def test_replaces_root_when_deleted():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        doc = create_mindmap_document("Root")
        write_json(path, doc)
        code, out = run_script(path, doc.root.id)
        assert code == 0
        loaded = load_mindmap(path)
        assert loaded.root.title == "New Mind Map"
```

Create `skills/mind-map/tests/test_mindmap_integration.py`:

```python
import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.file_utils import load_mindmap


def run(cmd, *args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / cmd), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip()


def test_full_workflow():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")

        # Create
        code, out = run("create_mindmap.py", path)
        assert code == 0
        result = json.loads(out)
        root_id = result["id"]

        # Add children
        code, out = run("add_node.py", path, root_id, "--title", "Functions")
        funcs_id = json.loads(out)["id"]
        code, out = run("add_node.py", path, root_id, "--title", "Classes")
        classes_id = json.loads(out)["id"]

        # Add leaf under Functions
        code, out = run("add_node.py", path, funcs_id, "--title", "main()")
        leaf_id = json.loads(out)["id"]

        # Update leaf
        run("update_node.py", path, leaf_id, "--content", "Entry point")

        # Verify structure
        doc = load_mindmap(path)
        assert len(doc.root.children) == 2
        assert doc.root.children[0].title == "Functions"
        assert len(doc.root.children[0].children) == 1
        assert doc.root.children[0].children[0].content == "Entry point"

        # Delete leaf
        run("delete_node.py", path, leaf_id)
        doc = load_mindmap(path)
        assert len(doc.root.children[0].children) == 0

        # Delete Functions branch
        run("delete_node.py", path, funcs_id)
        doc = load_mindmap(path)
        assert len(doc.root.children) == 1
        assert doc.root.children[0].title == "Classes"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest skills/mind-map/tests/test_delete_node.py skills/mind-map/tests/test_mindmap_integration.py -v
```

Expected: FAIL (delete_node.py not found)

- [ ] **Step 3: Write delete_node.py**

Create `skills/mind-map/scripts/delete_node.py`:

```python
#!/usr/bin/env python3
"""Delete a node (and its subtree) from a mind map."""
import argparse, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.file_utils import load_mindmap, save_mindmap
from lib.schemas import MindMapNode, create_mindmap_document


def remove_from_parent(parent: MindMapNode, target_id: str) -> bool:
    for i, child in enumerate(parent.children):
        if child.id == target_id:
            parent.children.pop(i)
            return True
        if remove_from_parent(child, target_id):
            return True
    return False


def main():
    parser = argparse.ArgumentParser(description="Delete a node from a mind map")
    parser.add_argument("path", help="Path to the .mind.json file")
    parser.add_argument("node_id", help="ID of the node to delete")
    args = parser.parse_args()

    doc = load_mindmap(args.path)

    if doc.root.id == args.node_id:
        new_doc = create_mindmap_document()
        save_mindmap(args.path, new_doc)
        print(json.dumps({"ok": True}))
        return

    removed = remove_from_parent(doc.root, args.node_id)
    if not removed:
        print(json.dumps({"ok": False, "error": f"Node not found: {args.node_id}"}))
        sys.exit(1)

    save_mindmap(args.path, doc)
    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest skills/mind-map/tests/test_delete_node.py skills/mind-map/tests/test_mindmap_integration.py -v
```

Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add skills/mind-map/scripts/delete_node.py skills/mind-map/tests/test_delete_node.py skills/mind-map/tests/test_mindmap_integration.py
git commit -m "feat(mind-map): add delete_node.py and integration tests"
```

---

### Task 8: Mind Map SKILL.md

**Files:**
- Create: `skills/mind-map/SKILL.md`

- [ ] **Step 1: Write SKILL.md**

Create `skills/mind-map/SKILL.md`:

```markdown
---
name: mind-map
description: Create and edit .mind.json mind map files in the notebook app. Use when: (1) Creating new mind maps, (2) Adding nodes to a mind map tree, (3) Updating node titles/content/code mappings, (4) Deleting nodes. Triggers on .mind.json file operations.
---

# Mind Map Skill

Operates on `.mind.json` files — tree-structured documents with a root node and recursive children.

## Node Structure

```json
{
  "id": "uuid",
  "title": "Node title",
  "content": "Markdown content",
  "children": [...],
  "codeMapping": { "raw": "...", "functionName": "...", "filePath": "...", "startLine": 1, "endLine": 10 }
}
```

`codeMapping` is optional. When set, it links the node to a specific code location.

## Scripts

All scripts print JSON to stdout: `{"ok": true, ...}` on success or `{"ok": false, "error": "..."}` on failure.

| Script | Purpose |
|--------|---------|
| `scripts/create_mindmap.py <path>` | Create a new .mind.json with a root node |
| `scripts/add_node.py <path> <parent-id> [--title] [--content]` | Add a child node, prints new node ID |
| `scripts/update_node.py <path> <node-id> (--title\|--content\|--code-mapping) <value>` | Set fields on a node |
| `scripts/delete_node.py <path> <node-id>` | Delete a node and its subtree |

### create_mindmap.py

```bash
python scripts/create_mindmap.py /path/to/file.mind.json
# => {"ok": true, "id": "uuid-of-root"}
```

Idempotent: does nothing if a valid .mind.json already exists.

### add_node.py

```bash
python scripts/add_node.py file.mind.json <parent-id> --title "Functions" --content "## Overview"
# => {"ok": true, "id": "uuid-of-new-node"}
```

Searches the entire tree recursively for the parent node by ID.

### update_node.py

```bash
python scripts/update_node.py file.mind.json <node-id> --title "New Title"
python scripts/update_node.py file.mind.json <node-id> --code-mapping '{"raw":"def foo():","functionName":"foo","filePath":"a.py","startLine":1,"endLine":3}'
```

At least one of `--title`, `--content`, `--code-mapping` must be provided.

### delete_node.py

```bash
python scripts/delete_node.py file.mind.json <node-id>
# => {"ok": true}
```

Removes the node and all descendants. If the root is deleted, replaces with a fresh empty root.
```

- [ ] **Step 2: Commit**

```bash
git add skills/mind-map/SKILL.md
git commit -m "docs(mind-map): add SKILL.md with script reference"
```

---

### Task 9: Derive Tree skill — create_derive.py

**Files:**
- Create: `skills/derive-tree/scripts/create_derive.py`
- Create: `skills/derive-tree/tests/test_create_derive.py`

- [ ] **Step 1: Write failing test**

Create `skills/derive-tree/tests/test_create_derive.py`:

```python
import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.file_utils import read_json


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "create_derive.py"), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip()


def test_creates_empty_derive():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        code, out = run_script(path)
        assert code == 0
        result = json.loads(out)
        assert result["ok"] is True
        data = read_json(path)
        assert data["type"] == "derive"
        assert data["version"] == 1
        assert data["nodes"] == []


def test_creates_parent_directory():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "a", "b", "test.derive.json")
        code, out = run_script(path)
        assert code == 0
        assert os.path.isfile(path)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest skills/derive-tree/tests/test_create_derive.py -v
```

Expected: FAIL

- [ ] **Step 3: Write create_derive.py**

Create `skills/derive-tree/scripts/create_derive.py`:

```python
#!/usr/bin/env python3
"""Create a new .derive.json file."""
import argparse, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.schemas import create_derive_document
from lib.file_utils import write_json


def main():
    parser = argparse.ArgumentParser(description="Create a .derive.json file")
    parser.add_argument("path", help="Path to the .derive.json file")
    args = parser.parse_args()

    if os.path.exists(args.path):
        print(json.dumps({"ok": True}))
        return

    doc = create_derive_document()
    write_json(args.path, doc)
    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest skills/derive-tree/tests/test_create_derive.py -v
```

Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add skills/derive-tree/scripts/create_derive.py skills/derive-tree/tests/test_create_derive.py
git commit -m "feat(derive-tree): add create_derive.py script with tests"
```

---

### Task 10: Derive Tree skill — add_step.py

**Files:**
- Create: `skills/derive-tree/scripts/add_step.py`
- Create: `skills/derive-tree/tests/test_add_step.py`

- [ ] **Step 1: Write failing test**

Create `skills/derive-tree/tests/test_add_step.py`:

```python
import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.file_utils import write_json, load_derive
from lib.schemas import create_derive_document, DerivationNode


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "add_step.py"), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip()


def _make_doc(path):
    doc = create_derive_document()
    write_json(path, doc)
    return doc


def test_adds_first_step():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        _make_doc(path)
        code, out = run_script(path, "--title", "Step 1", "--content", "First step")
        assert code == 0
        result = json.loads(out)
        assert result["ok"] is True
        assert result["stepNumber"] == 1
        loaded = load_derive(path)
        assert len(loaded.nodes) == 1
        assert loaded.nodes[0].title == "Step 1"
        assert loaded.nodes[0].stepNumber == 1


def test_inserts_at_position():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        doc = create_derive_document()
        doc.nodes = [
            DerivationNode(id="a", title="A", content="", stepNumber=1, derivesFrom=None, derivesTo=[], embedRefs=[]),
            DerivationNode(id="b", title="B", content="", stepNumber=2, derivesFrom=None, derivesTo=[], embedRefs=[]),
        ]
        write_json(path, doc)
        code, out = run_script(path, "--after-step", "1", "--title", "Inserted")
        assert code == 0
        loaded = load_derive(path)
        assert len(loaded.nodes) == 3
        assert loaded.nodes[1].title == "Inserted"
        assert loaded.nodes[1].stepNumber == 2
        assert loaded.nodes[2].stepNumber == 3


def test_adds_with_derives_from():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        doc = create_derive_document()
        doc.nodes.append(DerivationNode(
            id="parent", title="Parent", content="", stepNumber=1,
            derivesFrom=None, derivesTo=[], embedRefs=[]
        ))
        write_json(path, doc)
        code, out = run_script(path, "--derives-from", "parent", "--title", "Child")
        assert code == 0
        result = json.loads(out)
        new_id = result["id"]
        loaded = load_derive(path)
        child = next(n for n in loaded.nodes if n.id == new_id)
        assert child.derivesFrom == "parent"
        parent = next(n for n in loaded.nodes if n.id == "parent")
        assert new_id in parent.derivesTo


def test_renumbers_after_insert():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        doc = create_derive_document()
        for i, ch in enumerate(["A", "B", "C"]):
            doc.nodes.append(DerivationNode(
                id=ch, title=ch, content="", stepNumber=i+1,
                derivesFrom=None, derivesTo=[], embedRefs=[]
            ))
        write_json(path, doc)
        code, out = run_script(path, "--after-step", "1", "--title", "Inserted")
        assert code == 0
        loaded = load_derive(path)
        assert [n.stepNumber for n in loaded.nodes] == [1, 2, 3, 4]
        assert [n.title for n in loaded.nodes] == ["A", "Inserted", "B", "C"]
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest skills/derive-tree/tests/test_add_step.py -v
```

Expected: FAIL

- [ ] **Step 3: Write add_step.py**

Create `skills/derive-tree/scripts/add_step.py`:

```python
#!/usr/bin/env python3
"""Add a step to a .derive.json document."""
import argparse, json, os, sys, uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
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
    parser.add_argument("--content", default="")
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
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest skills/derive-tree/tests/test_add_step.py -v
```

Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add skills/derive-tree/scripts/add_step.py skills/derive-tree/tests/test_add_step.py
git commit -m "feat(derive-tree): add add_step.py with position, parent link, and renumbering"
```

---

### Task 11: Derive Tree skill — update_step.py + delete_step.py

**Files:**
- Create: `skills/derive-tree/scripts/update_step.py`, `skills/derive-tree/scripts/delete_step.py`
- Create: `skills/derive-tree/tests/test_update_step.py`, `skills/derive-tree/tests/test_delete_step.py`

- [ ] **Step 1: Write failing tests**

Create `skills/derive-tree/tests/test_update_step.py`:

```python
import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.file_utils import write_json, load_derive
from lib.schemas import create_derive_document, DerivationNode


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "update_step.py"), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip()


def _make_doc(path):
    doc = create_derive_document()
    doc.nodes = [
        DerivationNode(id="s1", title="Step 1", content="Old", stepNumber=1,
                       derivesFrom=None, derivesTo=[], embedRefs=[])
    ]
    write_json(path, doc)
    return doc


def test_updates_title_and_content():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        _make_doc(path)
        code, out = run_script(path, "s1", "--title", "New Title", "--content", "New Content")
        assert code == 0
        loaded = load_derive(path)
        assert loaded.nodes[0].title == "New Title"
        assert loaded.nodes[0].content == "New Content"


def test_rejects_unknown_step():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        _make_doc(path)
        code, out = run_script(path, "nonexistent", "--title", "X")
        assert code == 1
```

Create `skills/derive-tree/tests/test_delete_step.py`:

```python
import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.file_utils import write_json, load_derive
from lib.schemas import create_derive_document, DerivationNode


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "delete_step.py"), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip()


def _make_chain(path):
    doc = create_derive_document()
    doc.nodes = [
        DerivationNode(id="s1", title="A", content="", stepNumber=1, derivesFrom=None, derivesTo=["s2"], embedRefs=[]),
        DerivationNode(id="s2", title="B", content="", stepNumber=2, derivesFrom="s1", derivesTo=["s3"], embedRefs=[]),
        DerivationNode(id="s3", title="C", content="", stepNumber=3, derivesFrom="s2", derivesTo=[], embedRefs=[]),
    ]
    write_json(path, doc)
    return doc


def test_deletes_step():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        _make_chain(path)
        code, out = run_script(path, "s2")
        assert code == 0
        loaded = load_derive(path)
        assert len(loaded.nodes) == 2
        assert [n.title for n in loaded.nodes] == ["A", "C"]


def test_orphans_children():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        _make_chain(path)
        code, out = run_script(path, "s2")
        assert code == 0
        loaded = load_derive(path)
        s3 = next(n for n in loaded.nodes if n.id == "s3")
        assert s3.derivesFrom is None


def test_renumbers_after_delete():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        _make_chain(path)
        code, out = run_script(path, "s1")
        assert code == 0
        loaded = load_derive(path)
        assert loaded.nodes[0].stepNumber == 1
        assert loaded.nodes[1].stepNumber == 2
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest skills/derive-tree/tests/test_update_step.py skills/derive-tree/tests/test_delete_step.py -v
```

Expected: FAIL

- [ ] **Step 3: Write update_step.py and delete_step.py**

Create `skills/derive-tree/scripts/update_step.py`:

```python
#!/usr/bin/env python3
"""Update a step in a .derive.json document."""
import argparse, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.file_utils import load_derive, save_derive
from lib.schemas import CodeMapping


def main():
    parser = argparse.ArgumentParser(description="Update a derivation step")
    parser.add_argument("path", help="Path to the .derive.json file")
    parser.add_argument("step_id", help="ID of the step to update")
    parser.add_argument("--title")
    parser.add_argument("--content")
    parser.add_argument("--code-mapping", help='JSON code mapping object')
    args = parser.parse_args()

    doc = load_derive(args.path)
    node = next((n for n in doc.nodes if n.id == args.step_id), None)
    if node is None:
        print(json.dumps({"ok": False, "error": f"Step not found: {args.step_id}"}))
        sys.exit(1)

    if args.title is not None:
        node.title = args.title
    if args.content is not None:
        node.content = args.content
    if args.code_mapping is not None:
        data = json.loads(args.code_mapping)
        node.codeMapping = CodeMapping(**data)

    save_derive(args.path, doc)
    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
```

Create `skills/derive-tree/scripts/delete_step.py`:

```python
#!/usr/bin/env python3
"""Delete a step from a .derive.json document."""
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.file_utils import load_derive, save_derive


def recalc(nodes):
    for i, n in enumerate(nodes):
        n.stepNumber = i + 1


def sync_derives_to(nodes):
    for n in nodes:
        n.derivesTo = [other.id for other in nodes if other.derivesFrom == n.id]


def main():
    parser = argparse.ArgumentParser(description="Delete a step from a derivation tree")
    parser.add_argument("path", help="Path to the .derive.json file")
    parser.add_argument("step_id", help="ID of the step to delete")
    args = parser.parse_args()

    doc = load_derive(args.path)
    target = next((n for n in doc.nodes if n.id == args.step_id), None)
    if target is None:
        print(json.dumps({"ok": False, "error": f"Step not found: {args.step_id}"}))
        sys.exit(1)

    doc.nodes = [n for n in doc.nodes if n.id != args.step_id]
    # orphan children
    for n in doc.nodes:
        if n.derivesFrom == args.step_id:
            n.derivesFrom = None

    recalc(doc.nodes)
    sync_derives_to(doc.nodes)
    save_derive(args.path, doc)
    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest skills/derive-tree/tests/test_update_step.py skills/derive-tree/tests/test_delete_step.py -v
```

Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add skills/derive-tree/scripts/update_step.py skills/derive-tree/scripts/delete_step.py skills/derive-tree/tests/test_update_step.py skills/derive-tree/tests/test_delete_step.py
git commit -m "feat(derive-tree): add update_step.py and delete_step.py with tests"
```

---

### Task 12: Derive Tree skill — set_derives_from.py + integration

**Files:**
- Create: `skills/derive-tree/scripts/set_derives_from.py`
- Create: `skills/derive-tree/tests/test_set_derives_from.py`
- Create: `skills/derive-tree/tests/test_derive_integration.py`

- [ ] **Step 1: Write failing tests**

Create `skills/derive-tree/tests/test_set_derives_from.py`:

```python
import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.file_utils import write_json, load_derive
from lib.schemas import create_derive_document, DerivationNode


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "set_derives_from.py"), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip()


def _make_doc(path):
    doc = create_derive_document()
    doc.nodes = [
        DerivationNode(id="s1", title="A", content="", stepNumber=1, derivesFrom=None, derivesTo=[], embedRefs=[]),
        DerivationNode(id="s2", title="B", content="", stepNumber=2, derivesFrom=None, derivesTo=[], embedRefs=[]),
        DerivationNode(id="s3", title="C", content="", stepNumber=3, derivesFrom=None, derivesTo=[], embedRefs=[]),
    ]
    write_json(path, doc)
    return doc


def test_sets_parent():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        _make_doc(path)
        code, out = run_script(path, "s2", "s1")
        assert code == 0
        loaded = load_derive(path)
        s2 = next(n for n in loaded.nodes if n.id == "s2")
        assert s2.derivesFrom == "s1"
        s1 = next(n for n in loaded.nodes if n.id == "s1")
        assert "s2" in s1.derivesTo


def test_sets_root():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        doc = _make_doc(path)
        doc.nodes[1].derivesFrom = "s1"
        doc.nodes[0].derivesTo = ["s2"]
        write_json(path, doc)
        code, out = run_script(path, "s2", "null")
        assert code == 0
        loaded = load_derive(path)
        s2 = next(n for n in loaded.nodes if n.id == "s2")
        assert s2.derivesFrom is None


def test_rejects_self_link():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        _make_doc(path)
        code, out = run_script(path, "s1", "s1")
        assert code == 1
        result = json.loads(out)
        assert "self" in result["error"].lower()


def test_rejects_cycle():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        doc = _make_doc(path)
        doc.nodes[0].derivesFrom = "s2"
        doc.nodes[1].derivesTo = ["s1"]
        write_json(path, doc)
        code, out = run_script(path, "s2", "s1")
        assert code == 1
        result = json.loads(out)
        assert "cycle" in result["error"].lower()
```

Create `skills/derive-tree/tests/test_derive_integration.py`:

```python
import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.file_utils import load_derive


def run(cmd, *args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / cmd), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip()


def test_full_workflow():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")

        # Create
        run("create_derive.py", path)

        # Add steps
        run("add_step.py", path, "--title", "Problem Setup")
        run("add_step.py", path, "--title", "Derivation")
        run("add_step.py", path, "--title", "Result")
        code, out = run("add_step.py", path, "--after-step", "1", "--title", "Assumptions")

        # Link chain: Assumptions -> Problem -> Derivation -> Result
        loaded = load_derive(path)
        s_ids = {n.title: n.id for n in loaded.nodes}
        run("set_derives_from.py", path, s_ids["Problem Setup"], s_ids["Assumptions"])
        run("set_derives_from.py", path, s_ids["Derivation"], s_ids["Problem Setup"])
        run("set_derives_from.py", path, s_ids["Result"], s_ids["Derivation"])

        # Verify chain
        loaded = load_derive(path)
        result_node = next(n for n in loaded.nodes if n.title == "Result")
        deriv_node = next(n for n in loaded.nodes if n.title == "Derivation")
        assert result_node.derivesFrom == deriv_node.id

        # Update content
        run("update_step.py", path, s_ids["Derivation"], "--content", "## Proof\n\n...")

        # Delete middle step
        run("delete_step.py", path, s_ids["Problem Setup"])
        loaded = load_derive(path)
        assert len(loaded.nodes) == 3
        # Verify Derivation was orphaned
        deriv_node = next(n for n in loaded.nodes if n.title == "Derivation")
        assert deriv_node.derivesFrom is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest skills/derive-tree/tests/test_set_derives_from.py skills/derive-tree/tests/test_derive_integration.py -v
```

Expected: FAIL

- [ ] **Step 3: Write set_derives_from.py**

Create `skills/derive-tree/scripts/set_derives_from.py`:

```python
#!/usr/bin/env python3
"""Set (or clear) the derivesFrom parent of a step, with cycle detection."""
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.file_utils import load_derive, save_derive


def get_descendants(nodes, node_id):
    """Collect all descendant IDs of node_id."""
    children_of = {}
    for n in nodes:
        key = n.derivesFrom if n.derivesFrom else '__root__'
        children_of.setdefault(key, []).append(n)

    desc = set()
    stack = [node_id]
    while stack:
        cur = stack.pop()
        for child in children_of.get(cur, []):
            if child.id not in desc:
                desc.add(child.id)
                stack.append(child.id)
    return desc


def sync_derives_to(nodes):
    for n in nodes:
        n.derivesTo = [other.id for other in nodes if other.derivesFrom == n.id]


def main():
    parser = argparse.ArgumentParser(description="Set or clear a step's derivesFrom parent")
    parser.add_argument("path", help="Path to the .derive.json file")
    parser.add_argument("step_id", help="ID of the step")
    parser.add_argument("parent_id", help="ID of the parent step, or 'null' to make it a root")
    args = parser.parse_args()

    parent_id = None if args.parent_id == "null" else args.parent_id

    doc = load_derive(args.path)
    node = next((n for n in doc.nodes if n.id == args.step_id), None)
    if node is None:
        print(json.dumps({"ok": False, "error": f"Step not found: {args.step_id}"}))
        sys.exit(1)

    if parent_id is not None:
        if args.step_id == parent_id:
            print(json.dumps({"ok": False, "error": "Cannot set self as parent (self-link)"}))
            sys.exit(1)

        if not any(n.id == parent_id for n in doc.nodes):
            print(json.dumps({"ok": False, "error": f"Parent step not found: {parent_id}"}))
            sys.exit(1)

        descendants = get_descendants(doc.nodes, args.step_id)
        if parent_id in descendants:
            print(json.dumps({"ok": False, "error": "Cycle detected: parent is a descendant of this step"}))
            sys.exit(1)

    node.derivesFrom = parent_id
    sync_derives_to(doc.nodes)
    save_derive(args.path, doc)
    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest skills/derive-tree/tests/test_set_derives_from.py skills/derive-tree/tests/test_derive_integration.py -v
```

Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add skills/derive-tree/scripts/set_derives_from.py skills/derive-tree/tests/test_set_derives_from.py skills/derive-tree/tests/test_derive_integration.py
git commit -m "feat(derive-tree): add set_derives_from.py with cycle detection and integration tests"
```

---

### Task 13: Derive Tree SKILL.md

**Files:**
- Create: `skills/derive-tree/SKILL.md`

- [ ] **Step 1: Write SKILL.md**

Create `skills/derive-tree/SKILL.md`:

```markdown
---
name: derive-tree
description: Create and edit .derive.json derivation tree files. Use when: (1) Creating new derivation documents, (2) Adding derivation steps, (3) Linking steps with derivesFrom relationships, (4) Updating step content/code mappings, (5) Deleting steps. Triggers on .derive.json file operations.
---

# Derive Tree Skill

Operates on `.derive.json` files — flat list of steps with parent-child links via `derivesFrom` / `derivesTo`.

## Node Structure

```json
{
  "id": "uuid",
  "title": "Step title",
  "content": "Step content (markdown)",
  "stepNumber": 1,
  "derivesFrom": "parent-id or null",
  "derivesTo": ["child-id-1", "child-id-2"],
  "embedRefs": [],
  "codeMapping": null
}
```

Step numbers are auto-calculated. `derivesTo` is synced automatically.

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/create_derive.py <path>` | Create empty .derive.json |
| `scripts/add_step.py <path> [--after-step N] [--derives-from ID] [--title] [--content]` | Add step with optional parent link |
| `scripts/update_step.py <path> <step-id> (--title\|--content\|--code-mapping) <value>` | Update step fields |
| `scripts/delete_step.py <path> <step-id>` | Delete step, orphans children, renumbers |
| `scripts/set_derives_from.py <path> <step-id> <parent-id\|"null">` | Change parent with cycle detection |

### create_derive.py

```bash
python scripts/create_derive.py /path/to/file.derive.json
# => {"ok": true}
```

### add_step.py

```bash
python scripts/add_step.py file.derive.json --title "Step 1" --content "## Heading"
python scripts/add_step.py file.derive.json --after-step 2 --derives-from <parent-id> --title "Child Step"
# => {"ok": true, "id": "uuid", "stepNumber": 3}
```

Insert position: `--after-step N` (after step number N, 0 = beginning). Default: append to end.

### set_derives_from.py

```bash
python scripts/set_derives_from.py file.derive.json <step-id> <parent-id>
python scripts/set_derives_from.py file.derive.json <step-id> null
# => {"ok": true}
```

Rejects self-links and cycles. Pass `"null"` as parent-id to make it a root node.
```

- [ ] **Step 2: Commit**

```bash
git add skills/derive-tree/SKILL.md
git commit -m "docs(derive-tree): add SKILL.md with script reference"
```

---

### Task 14: Network Graph skill — create_network.py + add_layer.py

**Files:**
- Create: `skills/network-graph/scripts/create_network.py`, `skills/network-graph/scripts/add_layer.py`
- Create: `skills/network-graph/tests/test_create_network.py`, `skills/network-graph/tests/test_add_layer.py`

- [ ] **Step 1: Write failing tests**

Create `skills/network-graph/tests/test_create_network.py`:

```python
import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.file_utils import read_json


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "create_network.py"), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip()


def test_creates_default_network():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.net.json")
        code, out = run_script(path)
        assert code == 0
        result = json.loads(out)
        assert result["ok"] is True
        data = read_json(path)
        assert data["type"] == "net"
        assert data["version"] == 2
        assert len(data["nodes"]) == 2
        kinds = [n["kind"] for n in data["nodes"]]
        assert "input" in kinds
        assert "output" in kinds
        assert len(data["edges"]) == 1


def test_creates_with_custom_name():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.net.json")
        code, out = run_script(path, "--name", "ResNet50")
        assert code == 0
        data = read_json(path)
        assert data["name"] == "ResNet50"
```

Create `skills/network-graph/tests/test_add_layer.py`:

```python
import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.file_utils import write_json, load_network
from lib.schemas import create_network_document


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "add_layer.py"), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip()


def _make_doc(path):
    doc = create_network_document("Test")
    write_json(path, doc)
    return doc


def test_adds_layer_before_output():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.net.json")
        doc = _make_doc(path)
        code, out = run_script(path, "Conv2d", "--name", "conv1")
        assert code == 0
        result = json.loads(out)
        assert result["ok"] is True
        loaded = load_network(path)
        assert len(loaded.nodes) == 3
        # Order: input -> conv1 -> output
        assert loaded.nodes[0].kind == "input"
        assert loaded.nodes[1].kind == "layer"
        assert loaded.nodes[1].layerType == "Conv2d"
        assert loaded.nodes[1].label == "conv1"
        assert loaded.nodes[2].kind == "output"
        # Edges: input->conv1, conv1->output
        assert len(loaded.edges) == 2


def test_adds_layer_with_params():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.net.json")
        _make_doc(path)
        code, out = run_script(path, "Linear", "--params", '{"in_features": 512, "out_features": 256}')
        assert code == 0
        loaded = load_network(path)
        layer = loaded.nodes[1]
        assert layer.params == {"in_features": 512, "out_features": 256}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest skills/network-graph/tests/test_create_network.py skills/network-graph/tests/test_add_layer.py -v
```

Expected: FAIL

- [ ] **Step 3: Write scripts**

Create `skills/network-graph/scripts/create_network.py`:

```python
#!/usr/bin/env python3
"""Create a new .net.json file."""
import argparse, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.schemas import create_network_document
from lib.file_utils import write_json


def main():
    parser = argparse.ArgumentParser(description="Create a .net.json file")
    parser.add_argument("path", help="Path to the .net.json file")
    parser.add_argument("--name", default="New Network")
    args = parser.parse_args()

    if os.path.exists(args.path):
        print(json.dumps({"ok": True}))
        return

    doc = create_network_document(args.name)
    write_json(args.path, doc)
    input_id = doc.nodes[0].id
    output_id = doc.nodes[1].id
    print(json.dumps({"ok": True, "inputId": input_id, "outputId": output_id}))


if __name__ == "__main__":
    main()
```

Create `skills/network-graph/scripts/add_layer.py`:

```python
#!/usr/bin/env python3
"""Add a layer node to a .net.json document, inserted before the output node."""
import argparse, json, os, sys, uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
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

    # Find the output node and the edge leading to it
    output_node = next((n for n in doc.nodes if n.kind == "output"), None)
    if output_node is None:
        print(json.dumps({"ok": False, "error": "No output node found"}))
        sys.exit(1)

    # Find the node that currently connects to output
    output_edge = next((e for e in doc.edges if e.target == output_node.id), None)
    prev_node_id = output_edge.source if output_edge else doc.nodes[0].id

    # Remove old edge to output
    if output_edge:
        doc.edges = [e for e in doc.edges if e.id != output_edge.id]

    params = json.loads(args.params)
    label = args.name or args.layer_type
    new_node = GraphNode(
        id=str(uuid.uuid4()), kind="layer", label=label,
        layerType=args.layer_type, params=params
    )

    # Insert before output
    output_idx = next(i for i, n in enumerate(doc.nodes) if n.id == output_node.id)
    doc.nodes.insert(output_idx, new_node)

    # Wire: prev -> new -> output
    doc.edges.append(GraphEdge(id=str(uuid.uuid4()), source=prev_node_id, target=new_node.id))
    doc.edges.append(GraphEdge(id=str(uuid.uuid4()), source=new_node.id, target=output_node.id))

    save_network(args.path, doc)
    print(json.dumps({"ok": True, "id": new_node.id}))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest skills/network-graph/tests/test_create_network.py skills/network-graph/tests/test_add_layer.py -v
```

Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add skills/network-graph/scripts/create_network.py skills/network-graph/scripts/add_layer.py skills/network-graph/tests/test_create_network.py skills/network-graph/tests/test_add_layer.py
git commit -m "feat(network-graph): add create_network.py and add_layer.py with tests"
```

---

### Task 15: Network Graph skill — add_block.py + add_connection.py

**Files:**
- Create: `skills/network-graph/scripts/add_block.py`, `skills/network-graph/scripts/add_connection.py`
- Create: `skills/network-graph/tests/test_add_block.py`, `skills/network-graph/tests/test_add_connection.py`

- [ ] **Step 1: Write failing tests**

Create `skills/network-graph/tests/test_add_block.py`:

```python
import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.file_utils import write_json, load_network
from lib.schemas import create_network_document


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "add_block.py"), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip()


def test_creates_block():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.net.json")
        doc = create_network_document()
        write_json(path, doc)
        code, out = run_script(path, "ResBlock", "--repeat", "3")
        assert code == 0
        result = json.loads(out)
        assert result["ok"] is True
        loaded = load_network(path)
        blocks = [n for n in loaded.nodes if n.kind == "block"]
        assert len(blocks) == 1
        assert blocks[0].label == "ResBlock"
        assert blocks[0].repeat == 3
```

Create `skills/network-graph/tests/test_add_connection.py`:

```python
import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.file_utils import write_json, load_network
from lib.schemas import create_network_document


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "add_connection.py"), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip()


def test_adds_skip_connection():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.net.json")
        doc = create_network_document("Test")
        write_json(path, doc)
        input_id = doc.nodes[0].id
        output_id = doc.nodes[1].id
        code, out = run_script(path, input_id, output_id, "--style", "skip", "--label", "residual")
        assert code == 0
        loaded = load_network(path)
        assert len(loaded.edges) == 2
        skip_edge = next(e for e in loaded.edges if e.style == "skip")
        assert skip_edge.label == "residual"


def test_rejects_unknown_nodes():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.net.json")
        doc = create_network_document()
        write_json(path, doc)
        code, out = run_script(path, "fake-id", doc.nodes[1].id)
        assert code == 1
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest skills/network-graph/tests/test_add_block.py skills/network-graph/tests/test_add_connection.py -v
```

Expected: FAIL

- [ ] **Step 3: Write scripts**

Create `skills/network-graph/scripts/add_block.py`:

```python
#!/usr/bin/env python3
"""Add a block node to a .net.json document."""
import argparse, json, sys, uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.file_utils import load_network, save_network
from lib.schemas import GraphNode


def main():
    parser = argparse.ArgumentParser(description="Add a block to a network graph")
    parser.add_argument("path", help="Path to the .net.json file")
    parser.add_argument("name", help="Block name")
    parser.add_argument("--repeat", type=int, default=None, help="Repeat count")
    args = parser.parse_args()

    doc = load_network(args.path)
    block = GraphNode(
        id=str(uuid.uuid4()), kind="block", label=args.name,
        repeat=args.repeat, children=[]
    )
    doc.nodes.append(block)
    save_network(args.path, doc)
    print(json.dumps({"ok": True, "id": block.id}))


if __name__ == "__main__":
    main()
```

Create `skills/network-graph/scripts/add_connection.py`:

```python
#!/usr/bin/env python3
"""Add an edge (connection) to a .net.json document."""
import argparse, json, sys, uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.file_utils import load_network, save_network
from lib.schemas import GraphEdge


def main():
    parser = argparse.ArgumentParser(description="Add a connection to a network graph")
    parser.add_argument("path", help="Path to the .net.json file")
    parser.add_argument("from_id", help="Source node ID")
    parser.add_argument("to_id", help="Target node ID")
    parser.add_argument("--style", default="forward", choices=["forward", "skip"])
    parser.add_argument("--label", default=None)
    args = parser.parse_args()

    doc = load_network(args.path)
    node_ids = {n.id for n in doc.nodes}
    if args.from_id not in node_ids:
        print(json.dumps({"ok": False, "error": f"Source node not found: {args.from_id}"}))
        sys.exit(1)
    if args.to_id not in node_ids:
        print(json.dumps({"ok": False, "error": f"Target node not found: {args.to_id}"}))
        sys.exit(1)

    # Deduplicate: skip if same source->target exists
    existing = next((e for e in doc.edges if e.source == args.from_id and e.target == args.to_id), None)
    if existing:
        print(json.dumps({"ok": True, "id": existing.id, "note": "edge already exists"}))
        return

    edge = GraphEdge(
        id=str(uuid.uuid4()), source=args.from_id, target=args.to_id,
        style=args.style, label=args.label
    )
    doc.edges.append(edge)
    save_network(args.path, doc)
    print(json.dumps({"ok": True, "id": edge.id}))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest skills/network-graph/tests/test_add_block.py skills/network-graph/tests/test_add_connection.py -v
```

Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add skills/network-graph/scripts/add_block.py skills/network-graph/scripts/add_connection.py skills/network-graph/tests/test_add_block.py skills/network-graph/tests/test_add_connection.py
git commit -m "feat(network-graph): add add_block.py and add_connection.py with tests"
```

---

### Task 16: Network Graph skill — delete_node.py + delete_connection.py + integration

**Files:**
- Create: `skills/network-graph/scripts/delete_node.py`, `skills/network-graph/scripts/delete_connection.py`, `skills/network-graph/scripts/update_node.py`, `skills/network-graph/scripts/add_node_to_block.py`
- Create: `skills/network-graph/tests/test_delete_node.py`, `skills/network-graph/tests/test_network_integration.py`

- [ ] **Step 1: Write failing tests**

Create `skills/network-graph/tests/test_delete_node.py`:

```python
import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.file_utils import write_json, load_network
from lib.schemas import create_network_document, GraphNode, GraphEdge
import uuid


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "delete_node.py"), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip()


def test_deletes_node_and_incident_edges():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.net.json")
        doc = create_network_document("Test")
        mid = GraphNode(id=str(uuid.uuid4()), kind="layer", label="Mid", layerType="ReLU")
        doc.nodes.insert(1, mid)
        doc.edges = [
            GraphEdge(id=str(uuid.uuid4()), source=doc.nodes[0].id, target=mid.id),
            GraphEdge(id=str(uuid.uuid4()), source=mid.id, target=doc.nodes[2].id),
        ]
        write_json(path, doc)

        code, out = run_script(path, mid.id)
        assert code == 0
        loaded = load_network(path)
        assert len(loaded.nodes) == 2
        # No edge references the deleted node
        mid_refs = [e for e in loaded.edges if e.source == mid.id or e.target == mid.id]
        assert len(mid_refs) == 0
```

Create `skills/network-graph/tests/test_network_integration.py`:

```python
import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.file_utils import load_network


def run(cmd, *args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / cmd), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip()


def test_three_layer_network():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.net.json")

        # Create
        run("create_network.py", path, "--name", "ThreeLayer")

        # Add layers
        run("add_layer.py", path, "Conv2d", "--name", "conv1",
            "--params", '{"in_channels":3,"out_channels":64,"kernel_size":3}')
        run("add_layer.py", path, "BatchNorm2d", "--name", "bn1")
        run("add_layer.py", path, "ReLU", "--name", "relu1")

        # Verify structure
        loaded = load_network(path)
        assert loaded.name == "ThreeLayer"
        assert len(loaded.nodes) == 5  # input + 3 layers + output
        assert len(loaded.edges) == 4  # chain of 4 edges

        kinds = [n.kind for n in loaded.nodes]
        assert kinds == ["input", "layer", "layer", "layer", "output"]

        # Add skip connection
        conv1 = next(n for n in loaded.nodes if n.label == "conv1")
        relu1 = next(n for n in loaded.nodes if n.label == "relu1")
        run("add_connection.py", path, conv1.id, relu1.id, "--style", "skip", "--label", "fast")

        loaded = load_network(path)
        skip_edges = [e for e in loaded.edges if e.style == "skip"]
        assert len(skip_edges) == 1
        assert skip_edges[0].label == "fast"

        # Delete middle layer
        bn1 = next(n for n in loaded.nodes if n.label == "bn1")
        run("delete_node.py", path, bn1.id)
        loaded = load_network(path)
        assert len(loaded.nodes) == 4
```

- [ ] **Step 2: Verify tests fail**

```bash
python -m pytest skills/network-graph/tests/test_delete_node.py skills/network-graph/tests/test_network_integration.py -v
```

Expected: FAIL

- [ ] **Step 3: Write remaining scripts**

Create `skills/network-graph/scripts/delete_node.py`:

```python
#!/usr/bin/env python3
"""Delete a node and all incident edges from a .net.json document."""
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.file_utils import load_network, save_network


def main():
    parser = argparse.ArgumentParser(description="Delete a node from a network graph")
    parser.add_argument("path", help="Path to the .net.json file")
    parser.add_argument("node_id", help="ID of the node to delete")
    args = parser.parse_args()

    doc = load_network(args.path)
    if not any(n.id == args.node_id for n in doc.nodes):
        print(json.dumps({"ok": False, "error": f"Node not found: {args.node_id}"}))
        sys.exit(1)

    doc.nodes = [n for n in doc.nodes if n.id != args.node_id]
    doc.edges = [e for e in doc.edges if e.source != args.node_id and e.target != args.node_id]
    save_network(args.path, doc)
    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
```

Create `skills/network-graph/scripts/delete_connection.py`:

```python
#!/usr/bin/env python3
"""Delete an edge from a .net.json document."""
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.file_utils import load_network, save_network


def main():
    parser = argparse.ArgumentParser(description="Delete a connection from a network graph")
    parser.add_argument("path", help="Path to the .net.json file")
    parser.add_argument("edge_id", help="ID of the edge to delete")
    args = parser.parse_args()

    doc = load_network(args.path)
    if not any(e.id == args.edge_id for e in doc.edges):
        print(json.dumps({"ok": False, "error": f"Edge not found: {args.edge_id}"}))
        sys.exit(1)

    doc.edges = [e for e in doc.edges if e.id != args.edge_id]
    save_network(args.path, doc)
    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
```

Create `skills/network-graph/scripts/update_node.py`:

```python
#!/usr/bin/env python3
"""Update a network node's label, params, or codeMapping."""
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.file_utils import load_network, save_network
from lib.schemas import CodeMapping


def main():
    parser = argparse.ArgumentParser(description="Update a network graph node")
    parser.add_argument("path", help="Path to the .net.json file")
    parser.add_argument("node_id", help="ID of the node to update")
    parser.add_argument("--label")
    parser.add_argument("--params", help="JSON params object")
    parser.add_argument("--code-mapping", help="JSON code mapping object")
    args = parser.parse_args()

    doc = load_network(args.path)
    node = next((n for n in doc.nodes if n.id == args.node_id), None)
    if node is None:
        print(json.dumps({"ok": False, "error": f"Node not found: {args.node_id}"}))
        sys.exit(1)

    if args.label is not None:
        node.label = args.label
    if args.params is not None:
        node.params = json.loads(args.params)
    if args.code_mapping is not None:
        data = json.loads(args.code_mapping)
        node.codeMapping = CodeMapping(**data)

    save_network(args.path, doc)
    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
```

Create `skills/network-graph/scripts/add_node_to_block.py`:

```python
#!/usr/bin/env python3
"""Move a node into a block's children."""
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from lib.file_utils import load_network, save_network


def main():
    parser = argparse.ArgumentParser(description="Move a node into a block")
    parser.add_argument("path", help="Path to the .net.json file")
    parser.add_argument("block_id", help="ID of the block node")
    parser.add_argument("node_id", help="ID of the node to move")
    args = parser.parse_args()

    doc = load_network(args.path)
    block = next((n for n in doc.nodes if n.id == args.block_id), None)
    if block is None or block.kind != "block":
        print(json.dumps({"ok": False, "error": f"Block not found: {args.block_id}"}))
        sys.exit(1)

    target = next((n for n in doc.nodes if n.id == args.node_id), None)
    if target is None:
        print(json.dumps({"ok": False, "error": f"Node not found: {args.node_id}"}))
        sys.exit(1)

    doc.nodes = [n for n in doc.nodes if n.id != args.node_id]
    if block.children is None:
        block.children = []
    block.children.append(target)
    save_network(args.path, doc)
    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest skills/network-graph/tests/test_delete_node.py skills/network-graph/tests/test_network_integration.py -v
```

Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add skills/network-graph/scripts/delete_node.py skills/network-graph/scripts/delete_connection.py skills/network-graph/scripts/update_node.py skills/network-graph/scripts/add_node_to_block.py skills/network-graph/tests/test_delete_node.py skills/network-graph/tests/test_network_integration.py
git commit -m "feat(network-graph): add delete_node, delete_connection, update_node, add_node_to_block + integration tests"
```

---

### Task 17: Network Graph SKILL.md

**Files:**
- Create: `skills/network-graph/SKILL.md`

- [ ] **Step 1: Write SKILL.md**

Create `skills/network-graph/SKILL.md`:

```markdown
---
name: network-graph
description: Create and edit .net.json network graph files for visualizing neural network architectures. Use when: (1) Creating new network graphs, (2) Adding layers/blocks/connections, (3) Updating node labels/params/code mappings, (4) Deleting nodes or connections. Triggers on .net.json file operations.
---

# Network Graph Skill

Operates on `.net.json` files — graph-based neural network visualizations with nodes and edges.

## Document Structure (v2)

```json
{
  "type": "net",
  "version": 2,
  "name": "MyNetwork",
  "nodes": [
    {"id": "uuid", "kind": "input", "label": "Input"},
    {"id": "uuid", "kind": "layer", "label": "conv1", "layerType": "Conv2d", "params": {"in_channels": 3}},
    {"id": "uuid", "kind": "block", "label": "ResBlock", "repeat": 3, "children": [...]},
    {"id": "uuid", "kind": "output", "label": "Output"}
  ],
  "edges": [
    {"id": "uuid", "source": "...", "target": "...", "style": "forward", "label": null},
    {"id": "uuid", "source": "...", "target": "...", "style": "skip", "label": "residual"}
  ]
}
```

Node kinds: `input`, `output`, `layer`, `block`. Edge styles: `forward`, `skip`.

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/create_network.py <path> [--name]` | Create .net.json with input/output |
| `scripts/add_layer.py <path> <type> [--name] [--params JSON]` | Insert layer before output |
| `scripts/add_block.py <path> <name> [--repeat N]` | Create block node |
| `scripts/add_node_to_block.py <path> <block-id> <node-id>` | Move node into block |
| `scripts/add_connection.py <path> <from-id> <to-id> [--style] [--label]` | Add edge |
| `scripts/update_node.py <path> <node-id> (--label\|--params\|--code-mapping) <value>` | Update node |
| `scripts/delete_node.py <path> <node-id>` | Delete node + incident edges |
| `scripts/delete_connection.py <path> <edge-id>` | Delete single edge |

### create_network.py

```bash
python scripts/create_network.py model.net.json --name "ResNet50"
# => {"ok": true, "inputId": "uuid", "outputId": "uuid"}
```

### add_layer.py

```bash
python scripts/add_layer.py model.net.json Conv2d --name "conv1" --params '{"in_channels":3,"out_channels":64,"kernel_size":7}'
# => {"ok": true, "id": "uuid"}
```

Automatically inserts before output and rewires edges.

### add_connection.py

```bash
python scripts/add_connection.py model.net.json <from-id> <to-id> --style skip --label "residual"
# => {"ok": true, "id": "uuid"}
```

Deduplicates: returns existing edge if same source→target pair already exists.
```

- [ ] **Step 2: Commit**

```bash
git add skills/network-graph/SKILL.md
git commit -m "docs(network-graph): add SKILL.md with script reference"
```

---

### Task 18: Markdown skill — create_md.py + append_section.py

**Files:**
- Create: `skills/markdown/scripts/create_md.py`, `skills/markdown/scripts/append_section.py`
- Create: `skills/markdown/tests/test_create_md.py`, `skills/markdown/tests/test_append_section.py`

- [ ] **Step 1: Write failing tests**

Create `skills/markdown/tests/test_create_md.py`:

```python
import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "create_md.py"), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip()


def test_creates_with_title():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        code, out = run_script(path, "--title", "My Doc")
        assert code == 0
        assert json.loads(out)["ok"] is True
        content = open(path).read()
        assert content == "# My Doc\n\n"


def test_creates_without_title():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        code, out = run_script(path)
        assert code == 0
        content = open(path).read()
        assert content.startswith("# Untitled\n")
```

Create `skills/markdown/tests/test_append_section.py`:

```python
import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "append_section.py"), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip()


def _make_md(path):
    open(path, 'w').write("# Doc\n\n")


def test_appends_section():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md(path)
        code, out = run_script(path, "Overview", "This is content.")
        assert code == 0
        content = open(path).read()
        assert "## Overview\n\nThis is content.\n\n" in content


def test_rejects_duplicate_heading():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md(path)
        run_script(path, "Overview", "First.")
        code, out = run_script(path, "Overview", "Second.")
        assert code == 1
        assert "already exists" in json.loads(out)["error"].lower()


def test_multiple_sections_accumulate():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md(path)
        run_script(path, "One", "1")
        run_script(path, "Two", "2")
        content = open(path).read()
        lines = content.split("\n")
        assert "## One" in lines
        assert "## Two" in lines
        # One comes before Two
        assert lines.index("## One") < lines.index("## Two")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest skills/markdown/tests/test_create_md.py skills/markdown/tests/test_append_section.py -v
```

Expected: FAIL

- [ ] **Step 3: Write scripts**

Create `skills/markdown/scripts/create_md.py`:

```python
#!/usr/bin/env python3
"""Create a .md markdown file."""
import argparse, json, os, sys


def main():
    parser = argparse.ArgumentParser(description="Create a .md file")
    parser.add_argument("path", help="Path to the .md file")
    parser.add_argument("--title", default="Untitled")
    args = parser.parse_args()

    if os.path.exists(args.path):
        print(json.dumps({"ok": True}))
        return

    os.makedirs(os.path.dirname(args.path) or ".", exist_ok=True)
    with open(args.path, 'w', encoding='utf-8') as f:
        f.write(f"# {args.title}\n\n")
    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
```

Create `skills/markdown/scripts/append_section.py`:

```python
#!/usr/bin/env python3
"""Append a ## heading section to a .md file."""
import argparse, json, os, sys


def main():
    parser = argparse.ArgumentParser(description="Append a section to a .md file")
    parser.add_argument("path", help="Path to the .md file")
    parser.add_argument("heading", help="Section heading (without ##)")
    parser.add_argument("content", help="Section content (markdown)")
    args = parser.parse_args()

    if not os.path.exists(args.path):
        print(json.dumps({"ok": False, "error": f"File not found: {args.path}"}))
        sys.exit(1)

    with open(args.path, 'r', encoding='utf-8') as f:
        text = f.read()

    # Check for duplicate heading
    marker = f"## {args.heading}\n"
    if marker in text:
        print(json.dumps({"ok": False, "error": f"Heading already exists: {args.heading}"}))
        sys.exit(1)

    with open(args.path, 'a', encoding='utf-8') as f:
        f.write(f"## {args.heading}\n\n{args.content}\n\n")

    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest skills/markdown/tests/test_create_md.py skills/markdown/tests/test_append_section.py -v
```

Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add skills/markdown/scripts/create_md.py skills/markdown/scripts/append_section.py skills/markdown/tests/test_create_md.py skills/markdown/tests/test_append_section.py
git commit -m "feat(markdown): add create_md.py and append_section.py with tests"
```

---

### Task 19: Markdown skill — replace_section.py + integration

**Files:**
- Create: `skills/markdown/scripts/replace_section.py`
- Create: `skills/markdown/tests/test_replace_section.py`, `skills/markdown/tests/test_markdown_integration.py`

- [ ] **Step 1: Write failing tests**

Create `skills/markdown/tests/test_replace_section.py`:

```python
import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "replace_section.py"), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip()


def _make_md(path):
    open(path, 'w').write("# Doc\n\n## Overview\n\nOld content.\n\n## Details\n\nMore stuff.\n\n")


def test_replaces_existing_section():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md(path)
        code, out = run_script(path, "Overview", "New content.")
        assert code == 0
        content = open(path).read()
        assert "## Overview\n\nNew content.\n\n" in content
        assert "Old content" not in content


def test_rejects_unknown_heading():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md(path)
        code, out = run_script(path, "Nonexistent", "x")
        assert code == 1


def test_preserves_other_sections():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md(path)
        run_script(path, "Overview", "New.")
        content = open(path).read()
        assert "## Details" in content
        assert "More stuff" in content
```

Create `skills/markdown/tests/test_markdown_integration.py`:

```python
import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def run(cmd, *args):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / cmd), *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip()


def test_full_workflow():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")

        # Create
        run("create_md.py", path, "--title", "Network Architecture")

        # Append sections
        run("append_section.py", path, "Layers", "- Conv2d: 3x64x7x7\n- BatchNorm\n- ReLU")
        run("append_section.py", path, "Training", "- Optimizer: Adam\n- LR: 0.001")
        run("append_section.py", path, "Results", "- Top-1: 76.2%")

        content = open(path).read()
        assert "## Layers" in content
        assert "## Training" in content
        assert "## Results" in content

        # Replace a section
        run("replace_section.py", path, "Results", "- Top-1: 78.1%\n- Top-5: 93.4%")
        content = open(path).read()
        assert "78.1%" in content
        assert "76.2%" not in content

        # Verify other sections intact
        assert "## Training" in content
        assert "Adam" in content
```

- [ ] **Step 2: Verify tests fail**

```bash
python -m pytest skills/markdown/tests/test_replace_section.py skills/markdown/tests/test_markdown_integration.py -v
```

Expected: FAIL

- [ ] **Step 3: Write replace_section.py**

Create `skills/markdown/scripts/replace_section.py`:

```python
#!/usr/bin/env python3
"""Replace content under a ## heading in a .md file."""
import argparse, json, os, sys


def main():
    parser = argparse.ArgumentParser(description="Replace a section in a .md file")
    parser.add_argument("path", help="Path to the .md file")
    parser.add_argument("heading", help="Section heading to replace (without ##)")
    parser.add_argument("content", help="New section content (markdown)")
    args = parser.parse_args()

    if not os.path.exists(args.path):
        print(json.dumps({"ok": False, "error": f"File not found: {args.path}"}))
        sys.exit(1)

    with open(args.path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    marker = f"## {args.heading}\n"
    start_idx = None
    for i, line in enumerate(lines):
        if line == marker:
            start_idx = i
            break

    if start_idx is None:
        print(json.dumps({"ok": False, "error": f"Heading not found: {args.heading}"}))
        sys.exit(1)

    # Find next ## or EOF
    end_idx = len(lines)
    for i in range(start_idx + 1, len(lines)):
        if lines[i].startswith("## "):
            end_idx = i
            break

    # Replace the section
    new_lines = lines[:start_idx] + [marker, "\n", args.content, "\n"]
    if end_idx < len(lines):
        new_lines.append("\n")
    new_lines.extend(lines[end_idx:])

    with open(args.path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)

    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest skills/markdown/tests/test_replace_section.py skills/markdown/tests/test_markdown_integration.py -v
```

Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add skills/markdown/scripts/replace_section.py skills/markdown/tests/test_replace_section.py skills/markdown/tests/test_markdown_integration.py
git commit -m "feat(markdown): add replace_section.py and integration tests"
```

---

### Task 20: Markdown SKILL.md

**Files:**
- Create: `skills/markdown/SKILL.md`

- [ ] **Step 1: Write SKILL.md**

Create `skills/markdown/SKILL.md`:

```markdown
---
name: markdown
description: Create and edit .md markdown files with heading-based section manipulation. Use when: (1) Creating new markdown documents, (2) Appending new sections with deduplication, (3) Replacing section content. Triggers on .md file operations in the notebook.
---

# Markdown Skill

Operates on `.md` files — plain text markdown documents with `##` heading sections.

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/create_md.py <path> [--title]` | Create .md file with `# title` |
| `scripts/append_section.py <path> <heading> <content>` | Append `## heading` section (rejects duplicates) |
| `scripts/replace_section.py <path> <heading> <new-content>` | Replace content under a `## heading` |

### create_md.py

```bash
python scripts/create_md.py /path/to/doc.md --title "Architecture Overview"
# => {"ok": true}
```

### append_section.py

```bash
python scripts/append_section.py doc.md "Layers" "- Conv2d: 64@7x7\n- BatchNorm\n- ReLU"
# => {"ok": true}
```

Rejects if a section with the same heading already exists. Use `replace_section.py` to update.

### replace_section.py

```bash
python scripts/replace_section.py doc.md "Layers" "- Conv2d: 128@3x3\n- MaxPool"
# => {"ok": true}
```

Matches `## heading` exactly, replaces content up to the next `##` or EOF.
```

- [ ] **Step 2: Commit**

```bash
git add skills/markdown/SKILL.md
git commit -m "docs(markdown): add SKILL.md with script reference"
```

---

### Task 21: Final verification — run all tests

- [ ] **Step 1: Run the complete test suite**

```bash
cd /Users/wangyan/Desktop/note
python -m pytest skills/ -v
```

Expected: all ~44 tests pass

- [ ] **Step 2: Verify all skills directories have required files**

```bash
echo "=== mind-map ===" && ls skills/mind-map/SKILL.md skills/mind-map/scripts/*.py skills/mind-map/tests/test_*.py
echo "=== derive-tree ===" && ls skills/derive-tree/SKILL.md skills/derive-tree/scripts/*.py skills/derive-tree/tests/test_*.py
echo "=== network-graph ===" && ls skills/network-graph/SKILL.md skills/network-graph/scripts/*.py skills/network-graph/tests/test_*.py
echo "=== markdown ===" && ls skills/markdown/SKILL.md skills/markdown/scripts/*.py skills/markdown/tests/test_*.py
echo "=== lib ===" && ls skills/lib/schemas.py skills/lib/file_utils.py skills/lib/tests/test_*.py
```

- [ ] **Step 3: Review the branch diff summary**

```bash
git diff --stat main...HEAD
```

- [ ] **Step 4: Commit if any final cleanups were made**

```bash
git add -A skills/
git commit -m "chore: final verification, all tests passing"
```
