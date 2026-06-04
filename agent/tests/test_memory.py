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
