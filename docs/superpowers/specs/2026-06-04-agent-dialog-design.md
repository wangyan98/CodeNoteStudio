# Agent Dialog — Design Spec

## Overview

Add an AI Agent button next to "Start Live Server" in the bottom status bar. Clicking opens a floating dialog where users chat with an LLM-powered agent. The agent analyzes code repos and generates documentation (`.md`, `.mind.json`, `.derive.json`, `.net.json`) using the existing Python skills. Supports multi-turn conversation with streaming output.

## Architecture

```
┌─ Electron App ──────────────────────────────────────────┐
│  Renderer                    Main Process                │
│  ┌──────────┐    IPC     ┌──────────────┐   HTTP/SSE    │
│  │ Agent     │◄─────────►│  spawn/kill   │◄─────────────►│
│  │ Dialog    │           │  Python proc  │               │
│  └──────────┘           └──────────────┘               │
└─────────────────────────────────────────────────────────┘
                                                  │
                  ┌───────────────────────────────┘
                  ▼
        ┌─ Python Agent Service (FastAPI) ────────────────┐
        │  POST /chat        → SSE streaming response      │
        │  GET  /history     → conversation history         │
        │  DELETE /history   → clear memory                │
        │  GET  /health      → health check                │
        └──────────────────────────────────────────────────┘
```

## Directory Structure

```
note/
├── agent/                              # NEW — Python Agent Service
│   ├── requirements.txt                # fastapi, uvicorn, httpx, etc.
│   ├── server.py                       # FastAPI entry, manages lifecycle
│   ├── agent_loop.py                   # ReAct loop core
│   ├── memory.py                       # Conversation memory (SQLite)
│   ├── context.py                      # Context template + prompt building
│   ├── provider/
│   │   ├── __init__.py
│   │   ├── base.py                     # Abstract base (chat_stream)
│   │   └── openai_compat.py           # DeepSeek / Qwen / OpenAI-compatible
│   └── tools/
│       ├── __init__.py
│       ├── registry.py                 # Tool registry → OpenAI function schemas
│       ├── file_ops.py                 # Read repo source files
│       ├── mindmap_tools.py            # Wraps skills/mind-map/ scripts
│       ├── derive_tools.py             # Wraps skills/derive-tree/ scripts
│       ├── network_tools.py            # Wraps skills/network-graph/ scripts
│       └── markdown_tools.py           # Wraps skills/markdown/ scripts
├── src/renderer/src/components/
│   ├── AgentDialog.tsx                 # NEW — floating dialog UI
│   └── AgentDialog.css                 # NEW
├── src/main/
│   ├── agent-manager.ts               # NEW — Python process lifecycle
│   └── ipc-handlers.ts                # MODIFY — add agent IPC handlers
└── src/preload/
    └── index.ts                        # MODIFY — expose agent API to renderer
```

## Skills Integration

`agent/tools/` is a thin wrapper around existing `skills/` scripts. Each tool does three things:

1. Declares an OpenAI function-calling JSON schema (name, description, parameters)
2. Receives arguments from the LLM
3. Calls the corresponding skill script via `subprocess.run()` or direct `import`, returns the result

```
agent/tools/                              skills/
─────────────────────────────────────     ───────────────────────────
mindmap_tools.py                          skills/mind-map/scripts/
  create_mindmap    ──► import ──►          create_mindmap.py
  add_node          ──► import ──►          add_node.py
  update_node       ──► import ──►          update_node.py
  delete_node       ──► import ──►          delete_node.py

derive_tools.py                           skills/derive-tree/scripts/
  create_derive     ──► import ──►          create_derive.py
  add_step          ──► import ──►          add_step.py
  ...

network_tools.py                          skills/network-graph/scripts/
  ...

markdown_tools.py                         skills/markdown/scripts/
  ...

file_ops.py                               (reads repo source files)
  read_file, search_code, list_files
```

## ReAct Loop (`agent_loop.py`)

```
User input: "analyze sky atmosphere"
    │
    ▼
┌─ context.py ─────────────────────────────────────────┐
│  Template injects:                                    │
│    workspace=/Users/.../test3                         │
│    repos=[/Users/.../Nilou-main]                      │
│    output_dir=<workspace>/docs/                       │
│  System: "You are a code analysis assistant..."       │
└──────────────────────────────────────────────────────┘
    │
    ▼
while step < max_steps (default 15):
  1. LLM reasoning → returns thought + action (or finish)
  2. If action == tool_call:
       → Execute tool (spawn skill script or import)
       → Append tool result to conversation messages
       → Go back to step 1
  3. If action == finish:
       → Return final text

Each step pushes an SSE event:
  event: thought      → "Searching for sky atmosphere files..."
  event: tool_call    → {"name": "create_mindmap", "args": {...}}
  event: tool_result  → {"ok": true, "id": "xxx"}
  event: text         → "Analysis complete. Generated docs..."
  event: done         → {}
```

- `max_steps` defaults to 15 to prevent infinite loops
- Tool results are appended directly to conversation messages as `role: tool`
- `context.py` templates are injected into the first system message only

## Provider Abstraction

```python
# provider/base.py
class BaseProvider(ABC):
    @abstractmethod
    async def chat_stream(
        self,
        messages: list[dict],
        tools: list[dict],
    ) -> AsyncIterator[Event]:
        ...
```

First version implements only `openai_compat.py`, which covers DeepSeek, Qwen, Ollama, and any OpenAI-compatible endpoint. Claude API support can be added later.

**Provider configuration** stored in `~/.code-note-studio/providers.json`:
```json
[
  {
    "id": "deepseek",
    "name": "DeepSeek V3",
    "base_url": "https://api.deepseek.com/v1",
    "api_key": "sk-xxx",
    "model": "deepseek-chat"
  }
]
```

User can switch providers in the dialog. API key is read from `providers.json` (or env var `MODEL_API_KEY` as fallback). No UI for key management in v1.

## Conversation Memory (`memory.py`)

SQLite database stored in the workspace directory. Schema:

```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  created_at TEXT,
  updated_at TEXT
);
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT,
  role TEXT,        -- user / assistant / tool
  content TEXT,
  tool_name TEXT,   -- nullable
  created_at TEXT
);
```

- Single conversation per workspace (no multi-conversation management in v1)
- Opening the dialog resumes the last conversation if one exists
- History persists across app restarts
- `GET /history` returns all messages for current conversation
- `DELETE /history` clears the conversation (manual clear button in dialog header)

## UI Design

### Button Position

Added to `ServerStatus.tsx` status bar, aligned right with the existing server controls:

```
[Web server offline] [Start Live Server] [🤖 Agent]
```

### Floating Dialog (`AgentDialog.tsx`)

```
┌─ AgentDialog (floating, bottom-right, resizable) ────────────┐
│  ┌─ header ─────────────────────────────────────────────────┐│
│  │ 🤖 Code Agent                        [−] [□] [×]        ││
│  ├─ context bar ────────────────────────────────────────────┤│
│  │ Provider: [DeepSeek ▼]  Workspace: auto  Repo: auto      ││
│  ├─ messages ───────────────────────────────────────────────┤│
│  │  👤 analyze sky atmosphere                               ││
│  │  🤖 🔍 searching for sky atmosphere files...              ││
│  │     📄 create_mindmap → ok, id: abc123                   ││
│  │     📝 generating analysis doc...                        ││
│  │     ✅ done. generated:                                   ││
│  │        - docs/sky_atmosphere.mind.json                   ││
│  │        - docs/sky_atmosphere.md                          ││
│  ├─ input ──────────────────────────────────────────────────┤│
│  │ [Type a message...________________________] [Send]       ││
│  └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

- Position: bottom-right floating, draggable, minimizable
- Context bar: shows current provider/workspace/repo, repo auto-filled from `state.codeRepoPath`
- Messages: SSE streaming display, tool calls shown as collapsible cards
- Generated doc paths are rendered as clickable links — clicking calls `dispatch({ type: 'SELECT_NOTE', noteId: relativePath })` to open the doc in the editor
- Dialog dimensions: ~400×500px default, resizable

## Process Management (`agent-manager.ts`)

Electron main process manages the Python agent service:

```
App start
  → spawn python3 agent/server.py --port <random>
  → wait for GET /health
  → store port number

User opens dialog
  → POST /chat via localhost:<port>

App quit
  → kill Python process
```

- Port: random available port, stored in memory
- Health check on startup with 3-second timeout
- Auto-restart if process dies unexpectedly
- Python deps installed via `pip3 install -r agent/requirements.txt` on first run

## IPC API

Preload exposes to renderer:

```typescript
window.agentAPI = {
  chat(prompt: string, providerId: string): void
  onEvent(callback: (event: AgentEvent) => void): () => void  // returns unsubscribe
  getHistory(): Promise<Message[]>
  clearHistory(): Promise<void>
  getProviders(): Promise<Provider[]>
}
```

Main process IPC handlers:
- `agent:chat` — POST /chat with SSE streaming, forwards events to renderer
- `agent:get-history` — GET /history
- `agent:clear-history` — DELETE /history
- `agent:get-providers` — reads providers.json

## Out of Scope (v1)

- Provider API key management UI (use config file or env var)
- Claude API provider (openai_compat only, add later)
- `seq-mermaid` skill integration (add when needed)
- Conversation branching or editing
- Agent configuration beyond provider selection

## Testing Strategy

- `agent/tests/` — pytest for agent loop, provider, tools, memory
- Unit tests per provider (mock LLM responses)
- Integration test: full agent run against a fixture repo
- UI: manual testing (Electron dialog), no automated UI tests in v1
