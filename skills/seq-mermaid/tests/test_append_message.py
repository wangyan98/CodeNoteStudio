"""Tests for append_message.py"""
import json
import os
import subprocess
import sys
import tempfile


def _setup(tmpdir, name="test"):
    script_name = os.path.join(tmpdir, name)
    result = subprocess.run(
        [sys.executable, "skills/seq-mermaid/scripts/create_seq.py", script_name],
        capture_output=True, text=True
    )
    return json.loads(result.stdout)["path"]


def _run(*args):
    result = subprocess.run(
        [sys.executable, "skills/seq-mermaid/scripts/append_message.py"] + list(args),
        capture_output=True, text=True
    )
    return json.loads(result.stdout), result.returncode


def test_appends_simple_message():
    with tempfile.TemporaryDirectory() as tmpdir:
        path = _setup(tmpdir)
        result, code = _run(path, "A", "B", "hello world")
        assert code == 0
        assert os.path.exists(path)
        content = open(path).read()
        assert "A->>B: hello world" in content


def test_appends_dashed_arrow():
    with tempfile.TemporaryDirectory() as tmpdir:
        path = _setup(tmpdir)
        result, code = _run(path, "Client", "Server", "response", "--type", "dashed")
        assert code == 0
        content = open(path).read()
        assert "Client-->>Server: response" in content


def test_appends_async_arrow():
    with tempfile.TemporaryDirectory() as tmpdir:
        path = _setup(tmpdir)
        result, code = _run(path, "A", "B", "event", "--type", "async")
        assert code == 0
        content = open(path).read()
        assert "A-)B: event" in content


def test_appends_x_arrow():
    with tempfile.TemporaryDirectory() as tmpdir:
        path = _setup(tmpdir)
        result, code = _run(path, "A", "B", "timeout", "--type", "x")
        assert code == 0
        content = open(path).read()
        assert "A--xB: timeout" in content


def test_rejects_missing_file():
    result, code = _run("/nonexistent/path", "A", "B", "msg")
    assert code == 1
    assert result["ok"] is False


def test_rejects_invalid_diagram():
    with tempfile.TemporaryDirectory() as tmpdir:
        path = os.path.join(tmpdir, "bad.txt")
        with open(path, 'w') as f:
            f.write("not a sequence diagram")
        result, code = _run(path, "A", "B", "msg")
        assert code == 1
        assert result["ok"] is False


def test_multiple_messages_accumulate():
    with tempfile.TemporaryDirectory() as tmpdir:
        path = _setup(tmpdir)
        _run(path, "A", "B", "first")
        _run(path, "B", "C", "second")
        content = open(path).read()
        assert "first" in content
        assert "second" in content
