"""Tests for create_seq.py"""
import json
import os
import subprocess
import sys
import tempfile


def _run(*args):
    result = subprocess.run(
        [sys.executable, "skills/seq-mermaid/scripts/create_seq.py"] + list(args),
        capture_output=True, text=True
    )
    return json.loads(result.stdout), result.returncode


def test_creates_file_with_title():
    with tempfile.TemporaryDirectory() as tmpdir:
        name = os.path.join(tmpdir, "test")
        result, code = _run(name, "--title", "Auth Flow")
        assert code == 0
        assert result["ok"] is True
        path = result["path"]
        assert os.path.exists(path)
        content = open(path).read()
        assert content.startswith("sequenceDiagram")
        assert "Auth Flow" in content


def test_creates_file_without_title():
    with tempfile.TemporaryDirectory() as tmpdir:
        name = os.path.join(tmpdir, "test")
        result, code = _run(name)
        assert code == 0
        assert result["ok"] is True
        path = result["path"]
        content = open(path).read()
        assert "Sequence Diagram" in content


def test_idempotent_on_existing():
    with tempfile.TemporaryDirectory() as tmpdir:
        name = os.path.join(tmpdir, "test")
        _run(name, "--title", "First")
        result, code = _run(name, "--title", "Second")
        assert code == 0
        assert result["ok"] is True
        path = result["path"]
        content = open(path).read()
        assert "First" in content
        assert "Second" not in content


def test_creates_nested_dirs():
    with tempfile.TemporaryDirectory() as tmpdir:
        name = os.path.join(tmpdir, "sub", "nested", "test")
        result, code = _run(name)
        assert code == 0
        assert result["ok"] is True
        assert os.path.exists(result["path"])
