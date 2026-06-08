# Code Note Studio

A desktop note-taking tool that combines Markdown, mind maps, derivation trees, sequence diagrams, and neural network diagrams with deep code repository integration. Link your notes to actual source code symbols using `@ref(name)` syntax — keep documentation and code synchronized and navigable.

## Features

### Note Types

| Type | Extension | Description |
|------|-----------|-------------|
| **Markdown** | `.md` | Standard Markdown with Monaco editor, `@ref()` autocomplete, KaTeX math, live preview, and `![[path]]` embed support |
| **Mind Map** | `.mind.json` | Hierarchical tree structure rendered as a D3.js force-directed graph |
| **Derivation Tree** | `.derive.json` | Step-by-step derivation/explanation with linked code references |
| **Sequence Diagram** | `.seq.mermaid` | Mermaid sequence diagrams with live preview |
| **Network** | `.net.json` | PyTorch neural network architecture visualization with block-diagram editor, drag-and-drop layer palette, D3 SVG canvas, and `@ref()` source-code mapping per layer |

### Code Integration

- **Symbol Indexing** — Parse TypeScript, JavaScript, Python, Rust, Go, C, and C++ files using Tree-sitter. Symbols (functions, classes, methods, etc.) are indexed into SQLite.
- **@ref Syntax** — Reference code symbols directly in notes with `@ref(functionName)`. Click a reference to jump to the exact file and line in the code viewer.
- **Smart Resolution** — Three-tier matching: cached file+line lookup → full-text symbol search → `ClassName.methodName` resolution. Mappings persist across sessions via per-note `.refs.json` cache.
- **Autocomplete** — Type `@ref(` in the Markdown editor to see symbol suggestions with name, kind, and file location.

### Workspace Management

- Create or open workspace folders with `notebook.json` configuration
- Attach multiple code repositories per workspace
- Remembers last-opened note, active code repo, and open code file tabs across restarts

### AI Agent

LLM-powered coding assistant that can analyze code repositories and generate structured notes:

- **Chat Interface** — Toggle the agent dialog from the toolbar to chat with an LLM about your code
- **Tool Use** — The agent can read files, search code, and create/edit notes (Markdown, mind maps, derivation trees, network diagrams) directly in your workspace
- **Progressive Skill Disclosure** — Specialized note-type skills are loaded on-demand; the agent learns how to create mind maps or network diagrams only when needed
- **Streaming Responses** — Server-Sent Events (SSE) deliver real-time token streaming with tool call visibility in the chat UI
- **Multi-Provider** — Supports any OpenAI-compatible API (DeepSeek, OpenAI, local models via Ollama, etc.)

### Live Server

Built-in HTTP + WebSocket server for read-only web access to your workspace:

- Serve notes and code in any browser at `http://localhost:3456`
- REST API for all note and code operations
- Real-time push notifications when notes change
- Monaco Editor served locally (no CDN dependency)

### Layout

Four-panel resizable interface:

```
┌──────────┬──────────────┬──────────────┬──────────┐
│  Notes   │ Note Editor  │ Code Viewer  │  Code    │
│  Tree    │ (MD/Mind/    │  (Monaco)    │  Files   │
│          │  Derive/Seq/ │              │  Tree    │
│          │  Network)    │              │          │
└──────────┴──────────────┴──────────────┴──────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron 33 |
| Build | electron-vite |
| Frontend | React 18, TypeScript 5 |
| Code Editor | Monaco Editor |
| Diagrams | D3.js |
| Databases | better-sqlite3 (`.index.db`, `.symbols.db`) |
| Code Parsing | web-tree-sitter (8 language grammars) |
| Live Server | Express 5 + WebSocket (ws) |
| AI Agent | Python 3, FastAPI, uvicorn, httpx (OpenAI-compatible streaming) |
| Testing | Vitest + Testing Library, pytest (agent) |

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- Python 3.10+ (for the AI Agent)
- C++ compiler toolchain (for native module rebuild):
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Windows: Visual Studio Build Tools + Python 3
  - Linux: `build-essential` (gcc, g++, make)

> **Windows note:** The AI Agent expects a `python3` command on your PATH. If your Python is only available as `python` or `py`, create a symlink or alias so `python3` resolves correctly.

### Install

```bash
git clone <repo-url>
cd note
npm install
```

The `postinstall` script automatically rebuilds native modules for Electron and copies Tree-sitter grammar files. If grammar files are missing after install, run the fallback script:

```bash
bash scripts/download-grammars.sh
```

Install the Python agent dependencies:

```bash
pip install -r agent/requirements.txt
```

### Development

```bash
npm run dev
```

Starts electron-vite in development mode with hot module replacement for the renderer, auto-restart for the main process, and the Python agent server on a random port.

### Build

```bash
npm run build
```

Outputs production bundles to `out/`:

```
out/
├── main/
│   └── index.js
├── preload/
│   └── index.js
└── renderer/
    ├── index.html
    └── assets/
```

### Test

```bash
npm test                # Run all frontend tests once
npm run test:watch      # Run in watch mode
cd agent && pytest      # Run Python agent tests
```

> Agent integration tests require a configured LLM provider. If you don't have one set up yet, skip them with `SKIP_INTEGRATION_TESTS=1 pytest`.

## Project Structure

```
src/
├── main/                          # Electron main process
│   ├── index.ts                   # Entry point, window creation
│   ├── ipc-handlers.ts            # All IPC handler registrations
│   ├── agent-manager.ts           # Python agent process lifecycle (spawn, health-check, restart)
│   ├── types.ts                   # Shared types
│   ├── schemas/
│   │   ├── note-types.ts          # MindMap, Derivation, & Network document schemas
│   │   └── layer-catalog.ts      # Built-in PyTorch layer definitions (~26 layers)
│   └── services/
│       ├── code-parser.ts         # Tree-sitter symbol extraction
│       ├── file-system.ts         # Filesystem helpers
│       ├── git-service.ts         # Git commit info
│       ├── index-db.ts            # Note-code mapping database
│       ├── live-server.ts         # Express + WebSocket server
│       ├── note-service.ts        # Note CRUD operations
│       ├── notebook-config.ts     # notebook.json read/write
│       ├── ref-cache.ts           # Per-note @ref mapping cache
│       ├── ref-resolver.ts        # @ref() parser and symbol resolver
│       ├── symbol-index.ts        # Symbol indexing and querying
│       ├── ui-state.ts            # UI state persistence
│       └── workspace.ts           # Last-opened workspace path
├── preload/
│   └── index.ts                   # contextBridge API exposure
└── renderer/
    ├── index.html                 # Entry HTML with CSP
    └── src/
        ├── main.tsx               # React entry, Monaco config, Electron vs browser detection
        ├── App.tsx                # Root component
        ├── contexts/
        │   └── AppContext.tsx      # Global state (useReducer)
        ├── hooks/
        │   ├── useCodeNavigation.ts
        │   ├── useLiveServer.ts
        │   └── useNotes.ts
        ├── services/
        │   ├── monaco-completion.ts  # @ref() autocomplete
        │   └── web-api-client.ts     # REST client for browser mode
        ├── types/
        │   ├── electron.d.ts         # window.electronAPI type declarations
        │   └── index.ts              # AppState, AppAction types
        └── components/
            ├── Layout.tsx            # 4-panel resizable layout
            ├── WorkspaceToolbar.tsx   # Workspace bar and landing page
            ├── ServerStatus.tsx      # Live server status indicator
            ├── AgentDialog.tsx       # AI Agent chat dialog
            ├── NoteDirectory.tsx     # Note file tree (left panel)
            ├── NoteViewport.tsx      # Note editor/viewer (center-left)
            ├── CodeViewport.tsx      # Monaco code viewer (center-right)
            ├── CodeDirectory.tsx     # Code file tree (right panel)
            ├── CodeMappingsPanel.tsx # Resolved @ref links panel
            ├── SymbolPicker.tsx      # Symbol search dialog
            └── editors/
                ├── MdEditor.tsx             # Markdown editor with live preview + embeds
                ├── MindMapRenderer.tsx      # D3 force-directed mind map
                ├── MindMapCanvas.tsx        # Mind map embed rendering
                ├── DerivationRenderer.tsx
                ├── SequenceEditor.tsx       # Mermaid sequence diagram editor
                ├── NetworkEditor.tsx        # 3-panel .net.json editor
                ├── NetworkCanvas.tsx        # D3 SVG block-diagram canvas
                ├── NetworkPalette.tsx       # Draggable layer pill strip
                ├── NetworkPanel.tsx         # Param form + code mapping panel
                ├── NetworkEmbedViewer.tsx   # Static embed for .md
                ├── networkReducer.ts        # State reducer for .net.json
                └── EmbedCard.tsx            # Generic embed card for ![[path]]

agent/                             # Python AI Agent (FastAPI server)
├── server.py                      # Entry point, /health /providers /chat /history endpoints
├── agent_loop.py                  # Tool-use loop with LLM (max 80 steps, streaming SSE)
├── context.py                     # System prompt builder + skill loader
├── memory.py                      # SQLite conversation memory (OpenAI-format messages)
├── requirements.txt               # Python dependencies
├── provider/
│   ├── __init__.py                # Provider interface exports
│   ├── base.py                    # BaseProvider abstract class (chat_stream)
│   └── openai_compat.py           # OpenAI-compatible streaming provider (httpx SSE)
├── tools/
│   ├── registry.py                # ToolRegistry (register, schemas, execute)
│   ├── file_ops.py                # read_file, list_files, search_in_files
│   ├── mindmap_tools.py           # Mind map CRUD tools
│   ├── derive_tools.py            # Derivation tree tools
│   ├── network_tools.py           # Network diagram tools
│   ├── markdown_tools.py          # Markdown document tools
│   ├── file_search_tools.py       # File search tools
│   └── code_mapping_tools.py      # Code mapping tools
└── tests/
    └── test_provider.py           # Provider unit tests

skills/                            # Agent skill definitions (progressive disclosure)
├── code-mapping/SKILL.md
├── derive-tree/SKILL.md
├── markdown/SKILL.md
├── mind-map/SKILL.md
├── network-graph/SKILL.md
└── seq-mermaid/SKILL.md
```

## Configuration

### notebook.json

Each workspace contains a `notebook.json` file:

```json
{
  "name": "My Project",
  "notesPath": "./",
  "codeRepos": [
    {
      "path": "/absolute/path/to/repo",
      "commit": "abc123"
    }
  ]
}
```

### Per-workspace state files

- `ui-state.json` — Last selected note, active code repo, open code file tabs
- `.refs.json` (per note) — Resolved `@ref()` mappings cache
- `.symbols.db` — SQLite index of all parsed code symbols
- `.index.db` — SQLite note-to-code mapping index

### Model Providers (AI Agent)

The AI Agent connects to any OpenAI-compatible API. Providers are configured in `~/.code-note-studio/providers.json`:

```json
[
  {
    "id": "my-provider",
    "name": "Display Name",
    "base_url": "https://api.example.com/v1",
    "api_key": "<your-api-key>",
    "model": "model-name"
  }
]
```

| Field | Description |
|-------|-------------|
| `id` | Internal identifier, passed from the frontend when sending a chat |
| `name` | Display name shown in the model selector dropdown |
| `base_url` | OpenAI-compatible API base URL (`/chat/completions` is appended automatically) |
| `api_key` | API key for authentication (can also be set via `MODEL_API_KEY` environment variable) |
| `model` | Model name string sent in the chat completion request |

Multiple providers can be configured — select between them in the agent dialog's model dropdown. Any OpenAI-compatible service works, including self-hosted models (Ollama, vLLM, etc.).

### layer-catalog.json (per-workspace override)

The project includes a built-in catalog of ~26 PyTorch layer definitions for the neural network diagram editor. You can override or extend it by placing a `layer-catalog.json` in your workspace root. The editor merges workspace-level layers with the built-in catalog, so workspace-specific layers take precedence.

## IPC API

All IPC communication uses `ipcMain.handle` / `ipcRenderer.invoke`:

| Channel | Purpose |
|---------|---------|
| `config:load` / `config:save` | Read/write notebook.json |
| `notes:list` / `notes:create` / `notes:read` / `notes:update` / `notes:delete` / `notes:rename` | Note CRUD |
| `code:list-repo-files` / `code:read-file` | Code file access |
| `code:index-symbols` / `code:query-symbols` | Symbol indexing and search |
| `code:resolve-refs` | Parse and resolve @ref() references |
| `workspace:open` / `workspace:create` | Workspace management |
| `server:start` / `server:stop` / `server:status` | Live server control |
| `agent:start` / `agent:stop` / `agent:get-port` | AI Agent lifecycle |
| `ui-state:load` / `ui-state:save` | UI state persistence |

## Live Server API

When the live server is running, REST endpoints are available:

| Endpoint | Description |
|----------|-------------|
| `GET /api/workspace` | Current workspace path |
| `GET /api/config` | Notebook configuration |
| `GET /api/notes` | List notes (`?filter=md\|mind\|derive\|seq\|net`) |
| `GET /api/notes/*path` | Read note content |
| `GET /api/code/files?repo=<path>` | List code files |
| `GET /api/code/file?path=<path>` | Read code file |
| `GET /api/code/symbols?name=&file=&kind=` | Query symbols |
| `GET /api/code/resolve-refs?content=&notePath=` | Resolve @ref() references |
| `GET /api/ui-state` | Load persisted UI state |

WebSocket events are broadcast on note create/update/delete.

## Agent API

The Python agent runs as a local FastAPI server on a random port. The Electron main process spawns and manages it automatically.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check (returns 200 when ready) |
| `/providers` | GET | List configured model providers `{providers: [{id, name, model}]}` |
| `/chat` | POST | Send a chat message, returns SSE stream. Body: `{message, provider_id, workspace, repos, output_dir}` |
| `/history` | GET | Get conversation history |
| `/history` | DELETE | Clear conversation history |

### Chat SSE Events

The `/chat` endpoint streams these event types:

| Event | Description |
|-------|-------------|
| `token` | Text token from the LLM response |
| `tool_call` | Agent is invoking a tool (includes tool name and arguments) |
| `tool_result` | Result from a completed tool call |
| `error` | Error during processing |
| `done` | Stream complete |

## License

MIT
