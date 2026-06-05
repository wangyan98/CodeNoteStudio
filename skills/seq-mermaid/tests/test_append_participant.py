"""Tests for append_participant.py"""
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
        [sys.executable, "skills/seq-mermaid/scripts/append_participant.py"] + list(args),
        capture_output=True, text=True
    )
    return json.loads(result.stdout), result.returncode


def test_adds_participant():
    with tempfile.TemporaryDirectory() as tmpdir:
        path = _setup(tmpdir)
        result, code = _run(path, "Client")
        assert code == 0
        assert result["ok"] is True
        content = open(path).read()
        assert "participant Client" in content


def test_adds_participant_with_alias():
    with tempfile.TemporaryDirectory() as tmpdir:
        path = _setup(tmpdir)
        result, code = _run(path, "Svc", "--alias", "My Service")
        assert code == 0
        assert result["ok"] is True
        content = open(path).read()
        assert "participant Svc as My Service" in content


def test_rejects_duplicate_participant():
    with tempfile.TemporaryDirectory() as tmpdir:
        path = _setup(tmpdir)
        _run(path, "Svc")
        result, code = _run(path, "Svc")
        assert code == 1
        assert result["ok"] is False


def test_rejects_missing_file():
    result, code = _run("/nonexistent/path", "Foo")
    assert code == 1
    assert result["ok"] is False


def test_inserts_before_messages():
    with tempfile.TemporaryDirectory() as tmpdir:
        path = _setup(tmpdir)
        # Add a message first
        subprocess.run(
            [sys.executable, "skills/seq-mermaid/scripts/append_message.py", path, "A", "A", "test"],
            capture_output=True
        )
        _run(path, "Client")
        lines = open(path).readlines()
        # Client should appear before the message
        participant_lines = [l for l in lines if l.strip().startswith("participant ")]
        assert any("Client" in l for l in participant_lines)
