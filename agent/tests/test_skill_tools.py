import os
import tempfile
import pytest
from tools.mindmap_tools import register_mindmap_tools
from tools.markdown_tools import register_markdown_tools
from tools.registry import ToolRegistry


class TestMindmapTools:
    @pytest.fixture
    def registry(self):
        reg = ToolRegistry()
        register_mindmap_tools(reg)
        return reg

    def test_create_mindmap(self, registry):
        with tempfile.TemporaryDirectory() as tmpdir:
            name = os.path.join(tmpdir, "test")
            result = registry.execute("create_mindmap", {"name": name})
            assert result["ok"] is True
            assert "id" in result
            path = result["path"]
            assert os.path.exists(path)

    def test_add_node(self, registry):
        with tempfile.TemporaryDirectory() as tmpdir:
            name = os.path.join(tmpdir, "test")
            create_result = registry.execute("create_mindmap", {"name": name})
            path = create_result["path"]
            parent_id = create_result["id"]

            result = registry.execute("add_node", {
                "path": path,
                "parent_id": parent_id,
                "title": "Child Node",
                "content": "Some content",
            })
            assert result["ok"] is True
            assert "id" in result


class TestMarkdownTools:
    @pytest.fixture
    def registry(self):
        reg = ToolRegistry()
        register_markdown_tools(reg)
        return reg

    def test_create_md(self, registry):
        with tempfile.TemporaryDirectory() as tmpdir:
            name = os.path.join(tmpdir, "test")
            result = registry.execute("create_md", {
                "name": name,
                "title": "My Doc",
            })
            assert result["ok"] is True
            path = result["path"]
            assert os.path.exists(path)
            with open(path) as f:
                content = f.read()
            assert "# My Doc" in content

    def test_append_section(self, registry):
        with tempfile.TemporaryDirectory() as tmpdir:
            name = os.path.join(tmpdir, "test")
            create_result = registry.execute("create_md", {"name": name, "title": "Doc"})
            path = create_result["path"]
            result = registry.execute("append_section", {
                "path": path,
                "heading": "Analysis",
                "content": "This is the analysis content.",
            })
            assert result["ok"] is True
            with open(path) as f:
                content = f.read()
            assert "## Analysis" in content
