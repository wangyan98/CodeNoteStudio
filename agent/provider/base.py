from abc import ABC, abstractmethod
from typing import AsyncIterator


class BaseProvider(ABC):
    @abstractmethod
    async def chat_stream(
        self,
        messages: list[dict],
        tools: list[dict],
    ) -> AsyncIterator[dict]:
        """Yield SSE-style events: {type: 'text'|'tool_call'|'done', ...}"""
        ...
