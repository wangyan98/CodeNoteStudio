import json
import tempfile
import os
import sys
import pytest
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
