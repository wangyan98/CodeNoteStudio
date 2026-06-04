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
            path = os.path.join(tmpdir, "test.mind.json")
            result = registry.execute("create_mindmap", {"path": path})
            assert result["ok"] is True
            assert "id" in result
            assert os.path.exists(path)

    def test_add_node(self, registry):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "test.mind.json")
            create_result = registry.execute("create_mindmap", {"path": path})
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
            path = os.path.join(tmpdir, "test.md")
            result = registry.execute("create_md", {
                "path": path,
                "title": "My Doc",
            })
            assert result["ok"] is True
            assert os.path.exists(path)
            with open(path) as f:
                content = f.read()
            assert "# My Doc" in content

    def test_append_section(self, registry):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "test.md")
            registry.execute("create_md", {"path": path, "title": "Doc"})
            result = registry.execute("append_section", {
                "path": path,
                "heading": "Analysis",
                "content": "This is the analysis content.",
            })
            assert result["ok"] is True
            with open(path) as f:
                content = f.read()
            assert "## Analysis" in content
