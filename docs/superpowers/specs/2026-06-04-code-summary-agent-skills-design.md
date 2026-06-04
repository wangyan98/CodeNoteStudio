# Code Summary Agent Skills — Design Spec

## Overview

Create Claude Code skills that enable an LLM-driven agent to auto-summarize project code by writing into this notebook app's file formats: `.mind.json`, `.derive.json`, `.net.json`, and `.md`. Each file type gets its own skill with Python scripts for deterministic CRUD operations. A shared Python library provides schemas and I/O. Existing TypeScript code receives minimal, surgical refactors only where needed to support the new operations.

## Architecture

```
note/
├── skills/                             # NEW — all skill code, isolated for review
│   ├── lib/                            # Shared Python library
│   │   ├── schemas.py                  # Dataclass models (mirrors note-types.ts)
│   │   ├── file_utils.py              # JSON/text I/O + typed loaders/savers
│   │   └── tests/
│   │       ├── test_schemas.py
│   │       └── test_file_utils.py
│   ├── mind-map/                       # Claude Code skill: .mind.json
│   │   ├── SKILL.md
│   │   ├── scripts/
│   │   │   ├── create_mindmap.py
│   │   │   ├── add_node.py
│   │   │   ├── update_node.py
│   │   │   └── delete_node.py
│   │   └── tests/
│   │       ├── test_create_mindmap.py
│   │       ├── test_add_node.py
│   │       ├── test_update_node.py
│   │       ├── test_delete_node.py
│   │       └── test_mindmap_integration.py
│   ├── derive-tree/                    # Claude Code skill: .derive.json
│   │   ├── SKILL.md
│   │   ├── scripts/
│   │   │   ├── create_derive.py
│   │   │   ├── add_step.py
│   │   │   ├── update_step.py
│   │   │   ├── delete_step.py
│   │   │   └── set_derives_from.py
│   │   └── tests/
│   │       ├── test_create_derive.py
│   │       ├── test_add_step.py
│   │       ├── test_update_step.py
│   │       ├── test_delete_step.py
│   │       ├── test_set_derives_from.py
│   │       └── test_derive_integration.py
│   ├── network-graph/                  # Claude Code skill: .net.json
│   │   ├── SKILL.md
│   │   ├── scripts/
│   │   │   ├── create_network.py
│   │   │   ├── add_layer.py
│   │   │   ├── add_block.py
│   │   │   ├── add_node_to_block.py
│   │   │   ├── add_connection.py
│   │   │   ├── update_node.py
│   │   │   ├── delete_node.py
│   │   │   └── delete_connection.py
│   │   └── tests/
│   │       ├── test_create_network.py
│   │       ├── test_add_layer.py
│   │       ├── test_add_block.py
│   │       ├── test_add_connection.py
│   │       ├── test_delete_node.py
│   │       └── test_network_integration.py
│   └── markdown/                       # Claude Code skill: .md
│       ├── SKILL.md
│       ├── scripts/
│       │   ├── create_md.py
│       │   ├── append_section.py
│       │   └── replace_section.py
│       └── tests/
│           ├── test_create_md.py
│           ├── test_append_section.py
│           ├── test_replace_section.py
│           └── test_markdown_integration.py
```

**Why Python scripts:** deterministic cycle detection, step renumbering, and validation — avoiding Claude re-implementing these each time. Python is user's primary language.

**Why separate skills per file type:** each skill stays focused and independently reviewable. Claude only loads the SKILL.md it needs.

## Shared Library (`skills/lib/`)

### schemas.py

Dataclass models that mirror `src/main/schemas/note-types.ts`. JSON field mapping uses camelCase to match the existing file format.

```python
@dataclass
class CodeMapping:
    raw: str
    functionName: str
    filePath: str
    startLine: int
    endLine: int

@dataclass
class MindMapNode:
    id: str
    title: str
    content: str
    children: list['MindMapNode']
    codeMapping: CodeMapping | None = None

@dataclass
class MindMapDocument:
    type: Literal['mind'] = 'mind'
    version: Literal[1] = 1
    root: MindMapNode

@dataclass
class DerivationNode:
    id: str
    title: str
    content: str
    stepNumber: int
    derivesFrom: str | None
    derivesTo: list[str]
    embedRefs: list[str]
    codeMapping: CodeMapping | None = None

@dataclass
class DerivationDocument:
    type: Literal['derive'] = 'derive'
    version: Literal[1] = 1
    nodes: list[DerivationNode]

@dataclass
class GraphNode:
    id: str
    kind: Literal['input', 'output', 'layer', 'block']
    label: str
    layerType: str | None = None
    params: dict[str, Any] | None = None
    repeat: int | None = None
    children: list['GraphNode'] | None = None

@dataclass
class GraphEdge:
    id: str
    source: str
    target: str
    label: str | None = None
    style: Literal['forward', 'skip'] = 'forward'

@dataclass
class NetworkDocument:
    type: Literal['net'] = 'net'
    version: Literal[1, 2] = 2
    name: str
    nodes: list[GraphNode]
    edges: list[GraphEdge]
```

Each document type has a `create_*_document()` factory function and an `is_valid_*()` validator. Validation checks `type`, `version`, and required structural fields.

### file_utils.py

```python
def read_json(path: str) -> Any
def write_json(path: str, data: Any) -> None
def read_text(path: str) -> str
def write_text(path: str, content: str) -> None
def ensure_dir(path: str) -> None

# Typed loaders — validate on read
def load_mindmap(path: str) -> MindMapDocument
def save_mindmap(path: str, doc: MindMapDocument) -> None
def load_derive(path: str) -> DerivationDocument
def save_derive(path: str, doc: DerivationDocument) -> None
def load_network(path: str) -> NetworkDocument
def save_network(path: str, doc: NetworkDocument) -> None
```

`ensure_dir` is called automatically before writes. All scripts output JSON to stdout: `{"ok": true, "id": "..."}` on success, `{"ok": false, "error": "..."}` on failure.

### Shared lib tests

- `test_schemas.py` — round-trip JSON serialization/deserialization for every document type; validation rejects malformed documents
- `test_file_utils.py` — creates temp files, writes, reads back, verifies content; creates nested directories

## Mind Map Skill (`skills/mind-map/`)

### SKILL.md

Frontmatter triggers on `.mind.json` file creation or editing. Body describes the recursive node tree structure, `codeMapping` attachment points, and script reference.

### Scripts

**create_mindmap.py** `<path>`
- Creates `.mind.json` with a root node (title="New Mind Map")
- Does nothing if file already exists
- Output: `{"ok": true, "id": "<root-id>"}`

**add_node.py** `<path> <parent-id> [--title "..."] [--content "..."]`
- Appends a child to the parent node's `children` array
- Returns new node UUID
- Rejects unknown parent-id

**update_node.py** `<path> <node-id> (--title|--content|--code-mapping) <value>`
- `--code-mapping` accepts JSON: `'{"raw":"...","functionName":"...","filePath":"...","startLine":1,"endLine":10}'`
- Rejects unknown node-id

**delete_node.py** `<path> <node-id>`
- Removes the node from its parent's `children` array (recursive tree search)
- If root is deleted, replaces with a fresh empty root node

### Tests

- `test_create_mindmap.py` — creates valid document; verifies type/version/root; idempotent on re-run
- `test_add_node.py` — adds child to root; adds to specific parent; rejects unknown parent
- `test_update_node.py` — updates title, content, codeMapping; rejects unknown node
- `test_delete_node.py` — deletes leaf; deletes subtree; replaces root
- `test_mindmap_integration.py` — create → add nodes → update → delete → verify final structure

## Derive Tree Skill (`skills/derive-tree/`)

### SKILL.md

Describes the flat-node list with `derivesFrom`/`derivesTo` parent links, automatic step numbering, and cycle prevention.

### Scripts

**create_derive.py** `<path>`
- Creates empty `.derive.json` (`nodes: []`)
- Output: `{"ok": true}`

**add_step.py** `<path> [--after-step N] [--derives-from ID] [--title "..."] [--content "..."]`
- Inserts after step number N (default: end of list)
- Optionally sets `derivesFrom` parent link
- Updates parent's `derivesTo`, recalculates all step numbers
- Output: `{"ok": true, "id": "<new-id>", "stepNumber": N}`

**update_step.py** `<path> <step-id> (--title|--content|--code-mapping) <value>`
- Rejects unknown step-id

**delete_step.py** `<path> <step-id>`
- Removes the step; orphans its children (sets `derivesFrom` → null)
- Recalculates step numbers

**set_derives_from.py** `<path> <step-id> <parent-id | "null">`
- Changes parent link; updates both old and new parent's `derivesTo`
- Rejects self-links (`step-id == parent-id`)
- Rejects cycles (walks descendants of step-id, rejects if parent-id appears)
- Pass `"null"` to make it a root node

### Tests

- `test_create_derive.py` — creates empty document
- `test_add_step.py` — appends; inserts at position; sets derivesFrom; updates parent derivesTo; renumbers correctly
- `test_update_step.py` — updates fields, codeMapping
- `test_delete_step.py` — removes step; orphans children; renumbers
- `test_set_derives_from.py` — changes parent; sets root; rejects self-link; rejects cycle
- `test_derive_integration.py` — full workflow: create → add 3 steps → link chain → unlink middle → verify

## Network Graph Skill (`skills/network-graph/`)

### SKILL.md

Describes the v2 graph model: nodes have `kind` (input/output/layer/block), edges have `style` (forward/skip), blocks can nest.

### Scripts

**create_network.py** `<path> [--name "..."]`
- Creates `.net.json` (v2) with default input → output structure
- Output: `{"ok": true, "inputId": "...", "outputId": "..."}`

**add_layer.py** `<path> <layer-type> [--name "..."] [--params '{"...":"..."}']`
- Inserts layer node before the output node
- Updates edges: previous→output becomes previous→layer→output
- Output: `{"ok": true, "id": "<layer-id>"}`

**add_block.py** `<path> <name> [--repeat N]`
- Creates a block node (kind='block') with empty children
- Output: `{"ok": true, "id": "<block-id>"}`

**add_node_to_block.py** `<path> <block-id> <node-id>`
- Moves a node into the block's `children` array
- Removes the node from top-level `nodes`

**add_connection.py** `<path> <from-id> <to-id> [--style forward|skip] [--label "..."]`
- Adds an edge; deduplicates if same source→target already exists
- Output: `{"ok": true, "id": "<edge-id>"}`

**update_node.py** `<path> <node-id> (--label|--params|--code-mapping) <value>`
**delete_node.py** `<path> <node-id>`
- Removes node + all incident edges (any edge where source or target matches)
**delete_connection.py** `<path> <edge-id>`

### Tests

- `test_create_network.py` — default input/output structure
- `test_add_layer.py` — inserts correctly; edge rewiring
- `test_add_block.py` — creates block with repeat
- `test_add_connection.py` — forward; skip style; deduplication
- `test_delete_node.py` — removes node + incident edges
- `test_network_integration.py` — build a 3-layer sequential network, verify edges and order

## Markdown Skill (`skills/markdown/`)

### SKILL.md

Heading-based section manipulation. Simplest of the four — plain text, no JSON schema.

### Scripts

**create_md.py** `<path> [--title "..."]`
- Creates `# title\n\n`
- Output: `{"ok": true}`

**append_section.py** `<path> <heading> <content>`
- Appends `## heading\n\ncontent\n\n` to EOF
- Rejects if a `## heading` with the same name already exists (by exact match)

**replace_section.py** `<path> <heading> <new-content>`
- Finds `## heading` line, replaces everything until next `##` or EOF
- Returns error if heading not found

### Tests

- `test_create_md.py` — creates with title; creates without title
- `test_append_section.py` — adds section; duplicate heading rejected; multiple sections accumulate
- `test_replace_section.py` — updates existing; rejects unknown heading; preserves other sections
- `test_markdown_integration.py` — create → append 3 sections → replace one → verify

## Script Conventions

All scripts follow the same conventions:
- Exit code 0 on success, 1 on error
- JSON to stdout: `{"ok": true, ...}` or `{"ok": false, "error": "..."}`
- `--help` on every script via argparse
- Idempotent where possible (create on existing file is a no-op)
- Use `uuid4` for all new IDs
- Imports from `skills.lib` via relative path manipulation or `PYTHONPATH`

## Existing TypeScript Refactors

Minimal, surgical changes — only what's needed to keep the Python skills working with the same file format:

1. **No schema changes needed** — the Python schemas mirror the existing TypeScript types exactly
2. **If a missing operation is discovered** during implementation (e.g., the derive-tree reducer lacks a standalone "clear derivesFrom" operation), add it as a new reducer action type — do not restructure existing reducers

## Testing Strategy

- **Unit tests per script** — each script tested in isolation via `subprocess.run()` against temp files
- **Integration tests per skill** — multi-step workflow tests that exercise the full script suite
- **Schema tests** — round-trip JSON validation for all document types
- **Run all with** `python -m pytest skills/` from the repo root
- Tests are self-contained (create temp dirs, clean up after)

## Out of Scope

- The "agent" (Claude Code prompt/chain) that orchestrates the summarization — this design covers only the skills and scripts the agent will use
- UI changes in the Electron app
- Packaging the skills via `package_skill.py` (done post-implementation)
