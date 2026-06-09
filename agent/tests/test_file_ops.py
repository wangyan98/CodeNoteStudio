import os
import tempfile
import pytest
from tools.file_ops import read_file, list_files, search_in_files, grep


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
            assert "tree" in result
            tree = result["tree"]
            assert "a.py" in tree
            assert "b.txt" in tree
            assert "subdir/" in tree
            assert result["count"] >= 3


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


class TestGrep:
    def test_regex_match(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with open(os.path.join(tmpdir, "main.py"), "w") as f:
                f.write("def sky_atmosphere():\n    pass\n\nclass SkyMaterial:\n    pass\n")

            result = grep(tmpdir, r"def\s+\w+")
            assert result["ok"] is True
            assert len(result["matches"]) >= 1
            assert "sky_atmosphere" in result["matches"][0]["line"]
            assert result["matches"][0]["line_number"] == 1

    def test_context_lines(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with open(os.path.join(tmpdir, "main.py"), "w") as f:
                f.write("import os\n\ndef foo():\n    pass\n\ndef bar():\n    pass\n")

            result = grep(tmpdir, r"def foo", context_before=1, context_after=1)
            assert result["ok"] is True
            match = result["matches"][0]
            assert "def foo():" in match["line"]
            assert len(match["context_before"]) == 1
            assert len(match["context_after"]) == 1
            # context_before[0] is closest to match (line 2, the blank line)
            # context_before lines ascend: closest first
            assert match["context_before"][0]["line_number"] == 2
            assert match["context_after"][0]["line_number"] == 4

    def test_file_pattern_filter(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with open(os.path.join(tmpdir, "main.py"), "w") as f:
                f.write("def hello():\n    pass\n")
            with open(os.path.join(tmpdir, "readme.txt"), "w") as f:
                f.write("def hello():\n    pass\n")

            result = grep(tmpdir, r"def hello", file_pattern="*.py")
            assert result["ok"] is True
            assert len(result["matches"]) == 1
            assert result["matches"][0]["file"].endswith("main.py")

    def test_invalid_regex(self):
        result = grep("/some/dir", r"[invalid")
        assert result["ok"] is False
        assert "error" in result

    def test_not_a_directory(self):
        result = grep("/nonexistent/path", r"foo")
        assert result["ok"] is False
        assert "error" in result

    def test_truncation_at_max_results(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with open(os.path.join(tmpdir, "main.py"), "w") as f:
                for i in range(10):
                    f.write(f"x{i} = {i}\n")

            result = grep(tmpdir, r"x\d\s*=", max_results=3)
            assert result["ok"] is True
            assert result["count"] == 3
            assert result.get("truncated") is True

    def test_binary_file_no_crash(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with open(os.path.join(tmpdir, "data.bin"), "wb") as f:
                f.write(b"\x00\x01\x02\xff\xfe\xfd")

            result = grep(tmpdir, r"anything")
            assert result["ok"] is True
            # Should not crash, matches may be 0 for binary content

    def test_no_match(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with open(os.path.join(tmpdir, "main.py"), "w") as f:
                f.write("def hello():\n    pass\n")

            result = grep(tmpdir, r"nonexistent_\w+")
            assert result["ok"] is True
            assert len(result["matches"]) == 0
