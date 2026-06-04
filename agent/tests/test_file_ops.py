import os
import tempfile
import pytest
from tools.file_ops import read_file, list_files, search_in_files


class TestReadFile:
    def test_read_existing_file(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
            f.write("def hello():\n    print('world')\n")
            tmp_path = f.name

        try:
            result = read_file(tmp_path)
            assert result["ok"] is True
            assert "def hello()" in result["content"]
            assert result["path"] == tmp_path
        finally:
            os.unlink(tmp_path)

    def test_read_nonexistent_file(self):
        result = read_file("/nonexistent/path.txt")
        assert result["ok"] is False
        assert "error" in result


class TestListFiles:
    def test_list_directory(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            os.makedirs(os.path.join(tmpdir, "subdir"))
            with open(os.path.join(tmpdir, "a.py"), "w") as f:
                f.write("x=1")
            with open(os.path.join(tmpdir, "b.txt"), "w") as f:
                f.write("hello")

            result = list_files(tmpdir)
            assert result["ok"] is True
            names = [f["name"] for f in result["files"]]
            assert "a.py" in names
            assert "b.txt" in names
            assert any(f["is_directory"] for f in result["files"])


class TestSearchInFiles:
    def test_search_finds_match(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with open(os.path.join(tmpdir, "main.py"), "w") as f:
                f.write("def sky_atmosphere():\n    pass\n")

            result = search_in_files(tmpdir, "sky_atmosphere")
            assert result["ok"] is True
            assert len(result["matches"]) >= 1
            assert "sky_atmosphere" in result["matches"][0]["line"]

    def test_search_no_match(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with open(os.path.join(tmpdir, "main.py"), "w") as f:
                f.write("def hello():\n    pass\n")

            result = search_in_files(tmpdir, "nonexistent_xyz")
            assert result["ok"] is True
            assert len(result["matches"]) == 0
