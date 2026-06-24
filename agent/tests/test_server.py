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

    def make_agent(provider, workspace, repos, output_dir, provider_id="", active_file=""):
        return AgentLoop(
            provider=provider,
            registry=registry,
            memory=memory,
            workspace=workspace or "/ws",
            repos=repos or [],
            output_dir=output_dir or "/ws/docs",
            max_steps=5,
            provider_id=provider_id,
            active_file=active_file,
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


@pytest.mark.asyncio
async def test_history_returns_frozen_snapshot_after_chat(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/chat", json={
            "message": "hello", "provider_id": "fake",
            "workspace": "/ws", "repos": ["/repo"], "active_file": "/ws/a.py",
            "output_dir": "/ws/docs",
        })
        resp = await client.get("/history")
        data = resp.json()
        assert data["ok"] is True
        assert data["frozen"] is not None
        assert data["frozen"]["workspace"] == "/ws"
        assert data["frozen"]["repos"] == ["/repo"]
        assert data["frozen"]["active_file"] == "/ws/a.py"
        assert data["frozen"]["provider_id"] == "fake"


@pytest.mark.asyncio
async def test_history_frozen_null_before_any_chat(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/history")
        assert resp.json()["frozen"] is None


@pytest.mark.asyncio
async def test_clear_clears_messages_and_snapshot(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/chat", json={
            "message": "hello", "provider_id": "fake",
            "workspace": "/ws", "repos": ["/repo"], "active_file": "", "output_dir": "/ws/docs",
        })
        await client.delete("/history")
        resp = await client.get("/history")
        data = resp.json()
        assert data["messages"] == []
        assert data["frozen"] is None


@pytest.mark.asyncio
async def test_subsequent_chat_does_not_overwrite_snapshot(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/chat", json={
            "message": "first", "provider_id": "fake",
            "workspace": "/ws", "repos": ["/repo"], "active_file": "/ws/a.py",
            "output_dir": "/ws/docs",
        })
        frozen_at_1 = (await client.get("/history")).json()["frozen"]["frozen_at"]
        # Second message: live state has changed in the request body.
        await client.post("/chat", json={
            "message": "second", "provider_id": "fake",
            "workspace": "/changed", "repos": ["/other"], "active_file": "/changed/b.py",
            "output_dir": "/changed/docs",
        })
        data = (await client.get("/history")).json()
        # Snapshot still reflects the first turn.
        assert data["frozen"]["workspace"] == "/ws"
        assert data["frozen"]["repos"] == ["/repo"]
        assert data["frozen"]["frozen_at"] == frozen_at_1


@pytest.mark.asyncio
async def test_restart_recovery_restores_messages_and_snapshot(tmp_path):
    import os
    from server import create_app
    from memory import ConversationMemory
    from tools.registry import ToolRegistry
    from agent_loop import AgentLoop

    db_path = os.path.join(str(tmp_path), "agent.db")

    def build():
        memory = ConversationMemory(db_path)
        registry = ToolRegistry()
        def make_agent(provider, workspace, repos, output_dir, provider_id="", active_file=""):
            return AgentLoop(provider=provider, registry=registry, memory=memory,
                             workspace=workspace or "/ws", repos=repos or [],
                             output_dir=output_dir or "/ws/docs", max_steps=5,
                             provider_id=provider_id, active_file=active_file)
        return create_app(make_agent, memory), memory

    app1, memory1 = build()
    transport = ASGITransport(app=app1)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/chat", json={
            "message": "hello", "provider_id": "fake",
            "workspace": "/ws", "repos": ["/repo"], "active_file": "/ws/a.py", "output_dir": "/ws/docs",
        })

    memory1.close()
    # Simulate restart: brand new memory + app pointing at same on-disk DB.
    app2, memory2 = build()
    transport2 = ASGITransport(app=app2)
    async with AsyncClient(transport=transport2, base_url="http://test") as client:
        resp = await client.get("/history")
        data = resp.json()
        # History persisted across the new ConversationMemory instance.
        assert data["frozen"] is not None
        assert data["frozen"]["workspace"] == "/ws"
        assert any(m["role"] == "user" and m["content"] == "hello" for m in data["messages"])
    memory2.close()
