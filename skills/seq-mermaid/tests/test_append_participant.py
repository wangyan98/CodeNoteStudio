"""Tests for append_participant.py"""
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
        result, code = _run(path, "Client", "--alias", "Mobile App")
        assert code == 0
        assert result["ok"] is True
        content = open(path).read()
        assert "participant Client as Mobile App" in content


def test_rejects_duplicate_participant():
    with tempfile.TemporaryDirectory() as tmpdir:
        path = _setup(tmpdir)
        _run(path, "Server")
        result, code = _run(path, "Server")
        assert code == 1
        assert result["ok"] is False
        assert "already exists" in result["error"]


def test_rejects_missing_file():
    with tempfile.TemporaryDirectory() as tmpdir:
        result, code = _run(os.path.join(tmpdir, "nope.seq.mermaid"), "X")
        assert code == 1
        assert result["ok"] is False


def test_inserts_before_messages():
    with tempfile.TemporaryDirectory() as tmpdir:
        path = _setup(tmpdir)
        # Add a message first
        subprocess.run(
            [sys.executable, "skills/seq-mermaid/scripts/append_message.py",
             path, "A", "B", "hello"],
            capture_output=True
        )
        # Now add participant - should go before the message
        result, code = _run(path, "Server")
        assert code == 0
        lines = open(path).readlines()
        # Find participant line index
        participant_idx = next(i for i, l in enumerate(lines) if "participant Server" in l)
        message_idx = next(i for i, l in enumerate(lines) if "A->>B" in l)
        assert participant_idx < message_idx
