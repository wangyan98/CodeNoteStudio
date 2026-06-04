import pytest
from httpx import ASGITransport, AsyncClient
from server import create_app
from memory import ConversationMemory
from tools.registry import ToolRegistry
from agent_loop import AgentLoop


class FakeProvider:
    def __init__(self):
        pass

    async def chat_stream(self, messages, tools):
        yield {"type": "text", "content": "Fake response."}
        yield {"type": "done"}


@pytest.fixture
def app():
    import tempfile
    import os

    tmpdir = tempfile.mkdtemp()
    db_path = os.path.join(tmpdir, "test.db")

    memory = ConversationMemory(db_path)
    registry = ToolRegistry()

    def make_agent(provider, workspace, repos, output_dir):
        return AgentLoop(
            provider=provider,
            registry=registry,
            memory=memory,
            workspace=workspace or "/ws",
            repos=repos or [],
            output_dir=output_dir or "/ws/docs",
            max_steps=5,
        )

    return create_app(make_agent, memory)


@pytest.mark.asyncio
async def test_health_check(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_chat_endpoint_accepts_request(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/chat",
            json={
                "message": "hello",
                "provider_id": "fake",
                "workspace": "/ws",
                "repos": ["/repo"],
                "output_dir": "/ws/docs",
            },
        )
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_history_endpoints(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/history")
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert len(data["messages"]) == 0

        resp = await client.delete("/history")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True
