import json
import httpx
from typing import AsyncIterator
from .base import BaseProvider


class OpenAICompatProvider(BaseProvider):
    def __init__(self, base_url: str, api_key: str, model: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model

    @staticmethod
    def _finalize_tool_call_arguments(tc: dict) -> None:
        """Parse accumulated arguments_str into arguments dict. Mutates tc in place."""
        if "arguments_str" not in tc["function"]:
            return
        try:
            tc["function"]["arguments"] = json.loads(tc["function"]["arguments_str"])
        except json.JSONDecodeError:
            tc["function"]["arguments"] = {}
        del tc["function"]["arguments_str"]

    async def chat_stream(
        self,
        messages: list[dict],
        tools: list[dict],
    ) -> AsyncIterator[dict]:
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": self.model,
            "messages": messages,
            "tools": tools,
            "stream": True,
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream("POST", url, headers=headers, json=body) as response:
                if response.status_code >= 400:
                    error_body = ""
                    async for chunk in response.aiter_bytes():
                        error_body += chunk.decode(errors="replace")
                        if len(error_body) > 2000:
                            break
                    detail = error_body
                    try:
                        detail = json.loads(error_body)
                    except json.JSONDecodeError:
                        pass
                    raise Exception(
                        f"HTTP {response.status_code} from {self.model}: "
                        f"{json.dumps(detail, ensure_ascii=False) if isinstance(detail, dict) else detail}"
                    )

                tool_call_buffers: dict[int, dict] = {}
                _last_thinking = ""  # dedup: track total seen to compute deltas
                _last_text = ""      # same dedup for regular content

                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data_str = line[6:]
                    if data_str == "[DONE]":
                        for tc in tool_call_buffers.values():
                            OpenAICompatProvider._finalize_tool_call_arguments(tc)
                            yield {"type": "tool_call", "tool_call": tc}
                        yield {"type": "done"}
                        return

                    try:
                        chunk = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue

                    choices = chunk.get("choices", [])
                    if not choices:
                        continue
                    delta = choices[0].get("delta", {})
                    finish = choices[0].get("finish_reason")

                    # DeepSeek-style reasoning_content (thinking tokens).
                    # Some providers send full accumulated text each chunk
                    # rather than incremental deltas. Compute the true delta
                    # so the frontend can safely append without duplication.
                    if "reasoning_content" in delta and delta["reasoning_content"]:
                        full = delta["reasoning_content"]
                        if full.startswith(_last_thinking):
                            new_part = full[len(_last_thinking):]
                        else:
                            new_part = full
                        _last_thinking = full
                        if new_part:
                            yield {"type": "thinking", "content": new_part}

                    # Regular content — same dedup: some providers (especially
                    # DeepSeek-compatible backends) send the full accumulated
                    # message text in each chunk, not just the new token(s).
                    if "content" in delta and delta["content"]:
                        full = delta["content"]
                        if full.startswith(_last_text):
                            new_part = full[len(_last_text):]
                        else:
                            # Reset happened (new message or provider restart).
                            new_part = full
                        _last_text = full
                        if new_part:
                            yield {"type": "text", "content": new_part}

                    if "tool_calls" in delta:
                        for tc_delta in delta["tool_calls"]:
                            idx = tc_delta["index"]
                            if idx not in tool_call_buffers:
                                tool_call_buffers[idx] = {
                                    "id": tc_delta.get("id", ""),
                                    "type": "function",
                                    "function": {
                                        "name": "",
                                        "arguments_str": "",
                                    },
                                }
                            buf = tool_call_buffers[idx]
                            if "id" in tc_delta:
                                buf["id"] = tc_delta["id"]
                            if tc_delta.get("function", {}).get("name"):
                                buf["function"]["name"] = tc_delta["function"]["name"]
                            if tc_delta.get("function", {}).get("arguments"):
                                buf["function"]["arguments_str"] += tc_delta["function"]["arguments"]

                            # If this chunk ended with tool_calls and we have a complete tool call, emit it
                            if finish == "tool_calls" and buf["function"]["name"]:
                                OpenAICompatProvider._finalize_tool_call_arguments(buf)
                                yield {"type": "tool_call", "tool_call": buf}
