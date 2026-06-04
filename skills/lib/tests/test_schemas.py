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
