import pytest
import json
from unittest.mock import AsyncMock, patch, MagicMock
from provider.base import BaseProvider
from provider.openai_compat import OpenAICompatProvider


class TestBaseProvider:
    def test_cannot_instantiate_base(self):
        with pytest.raises(TypeError):
            BaseProvider()


class TestOpenAICompatProvider:
    @pytest.fixture
    def provider(self):
        return OpenAICompatProvider(
            base_url="https://api.test.com/v1",
            api_key="test-key",
            model="test-model"
        )

    def test_init_stores_config(self, provider):
        assert provider.base_url == "https://api.test.com/v1"
        assert provider.api_key == "test-key"
        assert provider.model == "test-model"

    @pytest.mark.asyncio
    async def test_chat_stream_emits_events(self, provider):
        """Simulate a complete LLM response with text."""
        messages = [{"role": "user", "content": "search for main"}]
        tools = [{"type": "function", "function": {"name": "search_code", "parameters": {}}}]

        # Patch httpx.AsyncClient.stream
        with patch('httpx.AsyncClient') as mock_client_class:
            mock_client = MagicMock()
            mock_client_class.return_value = mock_client
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)

            mock_chunk = {
                "id": "chat-123",
                "object": "chat.completion.chunk",
                "choices": [{"index": 0, "delta": {"content": "Hello world"}, "finish_reason": "stop"}]
            }

            mock_lines = [
                f"data: {json.dumps(mock_chunk)}",
                "data: [DONE]",
            ]

            async def mock_aiter_lines():
                for line in mock_lines:
                    yield line

            mock_response = MagicMock()
            mock_response.aiter_lines = mock_aiter_lines
            mock_response.raise_for_status = MagicMock()
            mock_response.__aenter__ = AsyncMock(return_value=mock_response)
            mock_response.__aexit__ = AsyncMock(return_value=None)

            mock_client.stream = MagicMock(return_value=mock_response)

            events = []
            async for event in provider.chat_stream(messages, tools):
                events.append(event)

        assert len(events) > 0
        # Should have text and done events
        types = [e["type"] for e in events]
        assert "text" in types
        assert "done" in types

    @pytest.mark.asyncio
    async def test_chat_stream_with_tool_call(self, provider):
        """Simulate LLM returning a tool_call."""
        with patch('httpx.AsyncClient') as mock_client_class:
            mock_client = MagicMock()
            mock_client_class.return_value = mock_client
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)

            mock_chunk = {
                "id": "chat-123",
                "object": "chat.completion.chunk",
                "choices": [{
                    "index": 0,
                    "delta": {
                        "tool_calls": [{
                            "index": 0,
                            "id": "call_abc",
                            "type": "function",
                            "function": {"name": "search_code", "arguments": '{"query":"sky"}'}
                        }]
                    },
                    "finish_reason": "tool_calls"
                }]
            }

            async def mock_aiter_lines():
                yield f"data: {json.dumps(mock_chunk)}"
                yield "data: [DONE]"

            mock_response = MagicMock()
            mock_response.aiter_lines = mock_aiter_lines
            mock_response.raise_for_status = MagicMock()
            mock_response.__aenter__ = AsyncMock(return_value=mock_response)
            mock_response.__aexit__ = AsyncMock(return_value=None)

            mock_client.stream = MagicMock(return_value=mock_response)

            messages = [{"role": "user", "content": "find sky atmosphere"}]
            tools = [{"type": "function", "function": {"name": "search_code", "parameters": {}}}]

            events = []
            async for event in provider.chat_stream(messages, tools):
                events.append(event)

        tool_calls = [e for e in events if e["type"] == "tool_call"]
        assert len(tool_calls) > 0
