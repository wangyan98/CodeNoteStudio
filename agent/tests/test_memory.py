import os
import tempfile
import pytest
from memory import ConversationMemory


class TestConversationMemory:
    @pytest.fixture
    def memory(self):
        tmpdir = tempfile.mkdtemp()
        db_path = os.path.join(tmpdir, "test.db")
        mem = ConversationMemory(db_path)
        yield mem
        mem.close()
        os.unlink(db_path)
        os.rmdir(tmpdir)

    def test_init_creates_tables(self, memory):
        cursor = memory.conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )
        tables = [row[0] for row in cursor.fetchall()]
        assert "conversations" in tables
        assert "messages" in tables

    def test_get_or_create_conversation(self, memory):
        conv_id = memory.get_or_create_conversation()
        assert conv_id is not None
        # Second call returns same conversation
        conv_id2 = memory.get_or_create_conversation()
        assert conv_id2 == conv_id

    def test_add_and_get_messages(self, memory):
        memory.add_message("user", "hello world")
        memory.add_message("assistant", "hi there", tool_name=None)
        memory.add_message("tool", '{"ok": true}', tool_name="search_code")

        messages = memory.get_messages()
        assert len(messages) == 3
        assert messages[0]["role"] == "user"
        assert messages[0]["content"] == "hello world"
        assert messages[1]["role"] == "assistant"
        assert messages[2]["role"] == "tool"
        assert messages[2]["tool_name"] == "search_code"

    def test_clear_messages(self, memory):
        memory.add_message("user", "test")
        assert len(memory.get_messages()) == 1

        memory.clear()
        assert len(memory.get_messages()) == 0

    def test_get_openai_messages(self, memory):
        memory.add_message("user", "hello")
        memory.add_message("assistant", "hi", tool_name=None)
        memory.add_message("tool", '{"ok": true}', tool_name="search_code")

        msgs = memory.get_openai_messages()
        assert len(msgs) == 3
        assert msgs[0] == {"role": "user", "content": "hello"}
        assert msgs[1] == {"role": "assistant", "content": "hi"}
        assert msgs[2] == {
            "role": "tool",
            "content": '{"ok": true}',
            "tool_call_id": "search_code",
        }

    def test_current_turn_table_created(self, memory):
        cursor = memory.conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )
        tables = [row[0] for row in cursor.fetchall()]
        assert "current_turn" in tables

    def test_set_and_get_current_workspace(self, memory):
        ws = {
            "workspace": "/ws",
            "repos": ["/repo"],
            "active_file": "/ws/a.py",
            "provider_id": "p1",
            "output_dir": "/ws/docs",
            "frozen_at": "2026-06-24T00:00:00+00:00",
        }
        memory.set_current_workspace(ws)
        got = memory.get_current_workspace()
        assert got == ws

    def test_set_current_workspace_upserts_single_row(self, memory):
        memory.set_current_workspace({"workspace": "/a", "repos": [], "active_file": "",
                                      "provider_id": "", "output_dir": "", "frozen_at": "t1"})
        memory.set_current_workspace({"workspace": "/b", "repos": [], "active_file": "",
                                      "provider_id": "", "output_dir": "", "frozen_at": "t2"})
        rows = memory.conn.execute("SELECT COUNT(*) FROM current_turn").fetchone()
        assert rows[0] == 1
        assert memory.get_current_workspace()["workspace"] == "/b"

    def test_get_current_workspace_null_when_empty(self, memory):
        assert memory.get_current_workspace() is None

    def test_clear_current_workspace(self, memory):
        memory.set_current_workspace({"workspace": "/ws", "repos": [], "active_file": "",
                                      "provider_id": "", "output_dir": "", "frozen_at": "t"})
        memory.clear_current_workspace()
        assert memory.get_current_workspace() is None
        rows = memory.conn.execute("SELECT COUNT(*) FROM current_turn").fetchone()
        assert rows[0] == 0

    def test_clear_also_clears_current_workspace(self, memory):
        memory.add_message("user", "hi")
        memory.set_current_workspace({"workspace": "/ws", "repos": [], "active_file": "",
                                      "provider_id": "", "output_dir": "", "frozen_at": "t"})
        memory.clear()
        assert len(memory.get_messages()) == 0
        assert memory.get_current_workspace() is None


import uuid


class TestMultiConversation:
    @pytest.fixture
    def memory(self):
        from memory import ConversationMemory
        mem = ConversationMemory(":memory:")
        yield mem
        mem.close()

    def test_add_message_with_explicit_conversation_id(self, memory):
        cid1 = str(uuid.uuid4())
        cid2 = str(uuid.uuid4())

        memory.create_conversation(cid1)
        memory.create_conversation(cid2)
        memory.add_message("user", "hello from c1", conversation_id=cid1)
        memory.add_message("user", "hello from c2", conversation_id=cid2)

        msgs1 = memory.get_messages(cid1)
        msgs2 = memory.get_messages(cid2)
        assert len(msgs1) == 1
        assert msgs1[0]["content"] == "hello from c1"
        assert len(msgs2) == 1
        assert msgs2[0]["content"] == "hello from c2"

    def test_clear_with_conversation_id_scoped(self, memory):
        cid1 = str(uuid.uuid4())
        cid2 = str(uuid.uuid4())
        memory.create_conversation(cid1)
        memory.create_conversation(cid2)
        memory.add_message("user", "msg1", conversation_id=cid1)
        memory.add_message("user", "msg2", conversation_id=cid2)

        memory.clear(cid1)
        assert len(memory.get_messages(cid1)) == 0
        assert len(memory.get_messages(cid2)) == 1

    def test_workspace_scoped_to_conversation(self, memory):
        cid = str(uuid.uuid4())
        memory.create_conversation(cid)
        ws = {"workspace": "/child", "repos": [], "active_file": "",
              "provider_id": "", "output_dir": "", "frozen_at": "t"}
        memory.set_current_workspace(ws, conversation_id=cid)

        got = memory.get_current_workspace(cid)
        assert got == ws

        # Main conversation workspace is independent.
        assert memory.get_current_workspace() is None

    def test_get_openai_messages_with_conversation_id(self, memory):
        cid = str(uuid.uuid4())
        memory.create_conversation(cid)
        memory.add_message("user", "q", conversation_id=cid)
        memory.add_message("assistant", "a", conversation_id=cid)
        memory.add_message("tool", '{"ok":true}', tool_name="echo", conversation_id=cid)

        msgs = memory.get_openai_messages(cid)
        assert len(msgs) == 3
        assert msgs[2] == {"role": "tool", "content": '{"ok":true}', "tool_call_id": "echo"}

    def test_create_conversation_with_parent_id(self, memory):
        parent_id = str(uuid.uuid4())
        child_id = str(uuid.uuid4())
        memory.create_conversation(parent_id)
        memory.create_conversation(child_id, parent_id=parent_id)

        children = memory.get_conversation_children()
        # The child is returned; main (auto-created by get_or_create_conversation) is not.
        child_entry = next(c for c in children if c["conversation_id"] == child_id)
        assert child_entry is not None
        assert child_entry["parent_id"] == parent_id
