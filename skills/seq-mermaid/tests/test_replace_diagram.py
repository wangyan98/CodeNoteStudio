"""Tests for replace_diagram.py"""
import json
import os
import subprocess
import sys
import tempfile


def _setup(tmpdir, name="test.seq.mermaid"):
    path = os.path.join(tmpdir, name)
    subprocess.run(
        [sys.executable, "skills/seq-mermaid/scripts/create_seq.py", path],
        capture_output=True
    )
    return path


def _run(*args):
    result = subprocess.run(
        [sys.executable, "skills/seq-mermaid/scripts/replace_diagram.py"] + list(args),
        capture_output=True, text=True
    )
    return json.loads(result.stdout), result.returncode


def test_replaces_full_content():
    with tempfile.TemporaryDirectory() as tmpdir:
        path = _setup(tmpdir)
        new_content = "sequenceDiagram\n    participant X as ServiceX\n    X->>X: self call"
        result, code = _run(path, new_content)
        assert code == 0
        assert result["ok"] is True
        content = open(path).read()
        assert "ServiceX" in content
        assert "self call" in content


def test_rejects_missing_file():
    with tempfile.TemporaryDirectory() as tmpdir:
        result, code = _run(os.path.join(tmpdir, "nope.seq.mermaid"), "sequenceDiagram\n    A->>B: hi")
        assert code == 1
        assert result["ok"] is False


def test_rejects_content_without_header():
    with tempfile.TemporaryDirectory() as tmpdir:
        path = _setup(tmpdir)
        result, code = _run(path, "not a sequenceDiagram at all")
        assert code == 1
        assert "must start with" in result["error"]


def test_preserves_newline():
    with tempfile.TemporaryDirectory() as tmpdir:
        path = _setup(tmpdir)
        new_content = "sequenceDiagram\n    participant A\n    A->>A: test"
        _run(path, new_content)
        content = open(path).read()
        assert content.endswith("\n")
