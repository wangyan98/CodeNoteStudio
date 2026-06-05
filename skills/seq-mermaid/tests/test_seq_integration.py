"""Integration tests for seq-mermaid skill — full workflow."""
import json
import os
import subprocess
import sys
import tempfile


def _run(script, *args):
    result = subprocess.run(
        [sys.executable, f"skills/seq-mermaid/scripts/{script}"] + list(args),
        capture_output=True, text=True
    )
    return json.loads(result.stdout), result.returncode


def test_full_workflow():
    with tempfile.TemporaryDirectory() as tmpdir:
        name = os.path.join(tmpdir, "auth")

        # 1. Create
        result, code = _run("create_seq.py", name, "--title", "OAuth Flow")
        assert code == 0
        path = result["path"]

        # 2. Add participants
        _run("append_participant.py", path, "Client", "--alias", "Mobile App")
        _run("append_participant.py", path, "AuthServer")
        _run("append_participant.py", path, "Database")

        # 3. Add messages
        _run("append_message.py", path, "Client", "AuthServer", "POST /token")
        _run("append_message.py", path, "AuthServer", "Database", "lookup user")
        _run("append_message.py", path, "Database", "AuthServer", "user record", "--type", "dashed")
        _run("append_message.py", path, "AuthServer", "Client", "access_token", "--type", "dashed")

        # 4. Verify final content
        content = open(path).read()
        assert "sequenceDiagram" in content
        assert "participant Client as Mobile App" in content
        assert "participant AuthServer" in content
        assert "participant Database" in content
        assert "Client->>AuthServer: POST /token" in content
        assert "AuthServer->>Database: lookup user" in content
        assert "AuthServer-->>Client: access_token" in content


def test_rejects_duplicate_participant_in_workflow():
    with tempfile.TemporaryDirectory() as tmpdir:
        name = os.path.join(tmpdir, "test")
        result, _ = _run("create_seq.py", name)
        path = result["path"]
        r1, _ = _run("append_participant.py", path, "Svc")
        assert r1["ok"] is True
        r2, _ = _run("append_participant.py", path, "Svc")
        assert r2["ok"] is False


def test_message_order_preserved():
    with tempfile.TemporaryDirectory() as tmpdir:
        name = os.path.join(tmpdir, "test")
        result, _ = _run("create_seq.py", name)
        path = result["path"]
        _run("append_participant.py", path, "A")
        _run("append_participant.py", path, "B")
        _run("append_message.py", path, "A", "B", "msg1")
        _run("append_message.py", path, "B", "A", "msg2")
        _run("append_message.py", path, "A", "B", "msg3")

        lines = open(path).readlines()
        msg_lines = [l.strip() for l in lines if ":" in l and not l.startswith("participant") and l.strip() != "sequenceDiagram"]
        assert "msg1" in msg_lines[0]
        assert "msg2" in msg_lines[1]
        assert "msg3" in msg_lines[2]
