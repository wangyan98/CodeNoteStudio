# Grep Tool for Agent

Add a regex-based `grep` tool to the agent's tool registry for code exploration — finding function signatures, class definitions, imports, and other code patterns across repositories.

## Motivation

The agent currently has `search_in_files` (case-insensitive substring match) and `search_files` (file name + content lookup). Neither supports regex patterns or context lines, which limits the agent's ability to answer questions like "find all async function definitions" or "show me every class that inherits from BaseModel."

A dedicated `grep` tool fills this gap without changing the existing tools.

## Design

### Function: `grep()` in `agent/tools/file_ops.py`

```python
def grep(
    directory: str,
    pattern: str,
    file_pattern: str = "*",
    context_before: int = 0,
    context_after: int = 0,
    max_results: int = 50,
) -> dict:
```

**Behavior:**
- Walks `directory` via `os.walk`, skipping `.`-prefixed dirs and `__pycache__`
- Filters files by `file_pattern` (fnmatch glob, e.g. `*.py`, `*.ts`)
- For each file, reads lines and runs `re.search(pattern, line)` — matches anywhere in the line
- When a match is found, records the matching line + up to `context_before`/`context_after` lines around it
- Context lines are capped at 200 characters each
- Returns matches up to `max_results`, with truncation info if the limit is hit

**Output shape:**
```json
{
    "ok": true,
    "matches": [
        {
            "file": "/abs/path/to/file.py",
            "line_number": 42,
            "line": "    def foo(bar: int) -> str:",
            "context_before": [
                {"line_number": 41, "line": ""},
                {"line_number": 40, "line": "class MyClass(BaseModel):"}
            ],
            "context_after": [
                {"line_number": 43, "line": "        ..."}
            ]
        }
    ],
    "count": 12
}
```

Context arrays are only present when the corresponding `context_before`/`context_after` > 0. Lines within context are listed in ascending line-number order (context_before[0] is closest to the match, then further away; context_after[0] is closest).

### Registration in `agent/server.py`

```python
registry.register(
    name="grep",
    description=(
        "Search for a regex pattern in files under a directory. "
        "Returns matching lines with optional context before and after. "
        "Use for finding function signatures, class definitions, imports, "
        "and other code patterns."
    ),
    parameters={
        "type": "object",
        "properties": {
            "directory": {
                "type": "string",
                "description": "Directory to search in (absolute path)",
            },
            "pattern": {
                "type": "string",
                "description": "Regex pattern to search for",
            },
            "file_pattern": {
                "type": "string",
                "description": "File glob filter, e.g. '*.py' or '*.ts' (default '*')",
            },
            "context_before": {
                "type": "integer",
                "description": "Lines to show before each match (default 0)",
            },
            "context_after": {
                "type": "integer",
                "description": "Lines to show after each match (default 0)",
            },
            "max_results": {
                "type": "integer",
                "description": "Max matches to return (default 50)",
            },
        },
        "required": ["directory", "pattern"],
    },
    handler=grep,
)
```

### Distinction from `search_in_files`

| | `search_in_files` | `grep` |
|---|---|---|
| Matching | Substring, case-insensitive | Regex |
| Context lines | No | Yes (`context_before`/`context_after`) |
| File filter | `file_pattern` param | `file_pattern` param |
| Use case | Quick loose searches | Precise code exploration |

`search_in_files` stays unchanged. The agent's system prompt will list both tools and the LLM will choose based on the task.

### Error handling

- **Invalid regex** — `re.error` caught, returns `{"ok": False, "error": "Invalid regex: <details>"}`
- **Not a directory** — returns `{"ok": False, "error": "Not a directory: <directory>"}`
- **Unreadable files** — skipped silently (same convention as `search_in_files`)
- **Binary/encoding errors** — `errors="replace"` on open, no crash
- **Permission denied** — skip directory silently (same convention as existing tools)

### Context window safety

The agent loop already enforces `MAX_TOOL_RESULT_CHARS = 8000`. Additionally, `grep()` caps individual context lines at 200 characters to prevent a single match from consuming the result budget.

### Tests

Add to `agent/tests/`. Create a temp directory with known files, then assert:
- Basic regex match (function signatures, class patterns)
- Context lines present and correctly ordered
- `file_pattern` filtering works
- Invalid regex returns proper error
- Missing directory returns proper error
- Truncation when `max_results` is exceeded
- Binary file handling (no crash)
