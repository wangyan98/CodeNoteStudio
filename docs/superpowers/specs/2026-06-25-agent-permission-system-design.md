# Agent Permission System Design

Date: 2026-06-25
Status: Design — approved pending spec review
Related: 2026-06-24-sub-agent-tool-design.md (ToolRegistry async execution, guard pattern precedent)

## Goal

Enforce directory-level access control for the AI Agent: repos are strictly read-only, file mutations are confined to workspace and output_dir, and skill Python scripts execute under a macOS sandbox (`sandbox-exec`) that prevents arbitrary system access.

## Decisions (confirmed in brainstorming)

| Concern | Decision |
|---|---|
| Directory model | Four-zone: repos (read-only), workspace (read-write), output_dir (read-write), skills (read-only internal). Everything else denied. |
| Path traversal defense | `os.path.realpath()` normalization + zone membership check — `../` and symlink escapes are neutralized |
| Permission violation UX | Tool returns `{"ok": False, ...}` AND a system message is injected to remind the Agent of its boundaries (approach B) |
| Skill script sandbox | macOS `sandbox-exec` with a per-call generated profile (approach C) — zero extra dependencies, aligns with Electron desktop app |
| Architecture | Registry-layer guard + AgentLoop secondary check + sandbox last line (approach A) — defense in depth |
| Guard location | New `agent/tools/permissions.py` — `PermissionGuard` class, centralized path classification and access control |

## Approach: defense in depth with PermissionGuard + sandbox-exec

```
                       ┌──────────────────────────────────┐
                       │        PermissionGuard             │
                       │  classify(path) → RO / RW / DENY   │
                       │  check(path, needs_write) → ok|err │
                       └──────────┬───────────────────────┘
                                  │
               ┌──────────────────┼──────────────────┐
               ▼                  ▼                  ▼
        ToolRegistry          AgentLoop           Skill Sandbox
      (handler 前置校验)    (create_* 路径        (sandbox-exec
                             拼接后二次校验)      最后防线)
```

- **Layer 1 — ToolRegistry**: `execute()` validates path arguments against the guard BEFORE invoking the handler. Declarative `path_params` on each tool registration tells the registry which arguments are paths and whether they need write access.
- **Layer 2 — AgentLoop**: After `create_*` tools resolve a relative name to an absolute workspace path, the guard re-checks the resolved path. Catches `../../../etc/passwd` escapes.
- **Layer 3 — macOS sandbox**: Skill Python scripts execute under `sandbox-exec` with a generated profile that allows file-read on repos/skills/python-home and file-write only on workspace/output_dir/tmp. Deny default.

## §1 Module & boundary overview

```
PermissionGuard  ── classify / check ──>  path → zone mapping
        │
ToolRegistry  ── execute() injects path validation ──>
        │              ├ reads path_params from tool registration
        │              └ on deny: returns error + injects system message
        │
AgentLoop  ── secondary check after path resolution ──>
        │              └ create_* name → realpath(workspace/name) → guard.check()
        │
Skill sandbox  ── sandbox-exec wrapper ──>
        │              ├ profile built from guard config at call time
        │              └ deny default: no network, no FS outside allowed zones
```

Existing modules touched:

| Module | Change |
|---|---|
| **New** `agent/tools/permissions.py` | `PermissionGuard` class — zone classification, permission check, error formatting |
| **New** `agent/sandbox/profile.sb` | Template sandbox profile with `<PARAM_*>` placeholders |
| `agent/tools/registry.py` | `register()` gains `path_params`; `execute()` gains pre-flight guard check; `_guard` attribute |
| `agent/tools/mindmap_tools.py` | `_run_skill_script()` wraps subprocess in `sandbox-exec`; `set_skill_guard()` added |
| `agent/tools/file_ops.py` | Existing handlers unchanged (guard applied in registry layer) |
| `agent/agent_loop.py` | `create_*` path resolution: `normpath` → `realpath` + guard re-check |
| `agent/server.py` | `build_registry()` initializes guard and distributes it to registry + skill tools |
| `agent/context.py` | System message template updated to describe permission boundaries |

## §2 PermissionGuard — path classification

File: `agent/tools/permissions.py` (new)

### §2.1 Zone hierarchy

```
Input path (any tool argument)
       │
       ▼
  os.path.realpath() 归一化
       │
       ├── startswith(workspace + "/")  or  == workspace?
       │       └── zone: "workspace"  →  read + write
       │
       ├── startswith(output_dir + "/")  or  == output_dir?
       │       └── zone: "output"     →  read + write
       │
       ├── startswith(any repos[i] + "/")  or  == repos[i]?
       │       └── zone: "repo"       →  read only
       │
       ├── startswith(skills_dir + "/")  or  == skills_dir?
       │       └── zone: "skills"     →  read only (internal)
       │
       └── otherwise
               └── zone: "denied"     →  no access
```

Check order matters: workspace is checked before output_dir (when output_dir is a subdirectory of workspace, workspace's RW wins — same outcome). repos is checked before skills (unlikely to overlap, but repos takes priority as the more restrictive zone).

### §2.2 Core interface

```python
class PermissionGuard:
    def __init__(self, workspace: str, repos: list[str],
                 output_dir: str, skills_dir: str):
        self.workspace = os.path.realpath(workspace)
        self.repos = [os.path.realpath(r) for r in repos]
        self.output_dir = os.path.realpath(output_dir)
        self.skills_dir = os.path.realpath(skills_dir)

    def classify(self, path: str) -> str:
        """Return zone: 'workspace' | 'repo' | 'output' | 'skills' | 'denied'"""
        real = os.path.realpath(path)
        if real == self.workspace or real.startswith(self.workspace + os.sep):
            return "workspace"
        if real == self.output_dir or real.startswith(self.output_dir + os.sep):
            return "output"
        for r in self.repos:
            if real == r or real.startswith(r + os.sep):
                return "repo"
        if real == self.skills_dir or real.startswith(self.skills_dir + os.sep):
            return "skills"
        return "denied"

    def check(self, path: str, needs_write: bool = False) -> dict:
        """Unified entry point. Returns {"ok": True, "zone": ...}
           or {"ok": False, "error": ..., "zone": ...}"""
        zone = self.classify(path)
        if zone == "denied":
            return {
                "ok": False,
                "error": f"Permission denied: '{path}' is outside allowed directories",
                "zone": "denied",
            }
        if needs_write and zone == "repo":
            return {
                "ok": False,
                "error": f"Permission denied: '{path}' is in a read-only repo directory",
                "zone": "repo",
            }
        if needs_write and zone == "skills":
            return {
                "ok": False,
                "error": f"Permission denied: skills directory is read-only",
                "zone": "skills",
            }
        return {"ok": True, "zone": zone}

    def update(self, workspace: str, repos: list[str], output_dir: str) -> None:
        """Update mutable per-request fields. skills_dir is immutable (server-level)."""
        self.workspace = os.path.realpath(workspace)
        self.repos = [os.path.realpath(r) for r in repos]
        self.output_dir = os.path.realpath(output_dir)
```

### §2.3 Design rationale

- **`realpath()` is the single defense against traversal** — `../` sequences and symlinks are resolved before zone membership is tested. A `path = "workspace/../../../etc/passwd"` resolves to `/etc/passwd`, which matches no zone → denied.
- **No glob / extension filtering** — directory-level isolation is sufficient. File-name patterns are a separate concern and would add complexity without meaningful security gain.
- **Subdirectories inherit parent zone** — `workspace/sub/deep/file.md` is workspace. No per-file granularity needed.
- **Check order** — workspace before output_dir ensures the more permissive zone is matched when they overlap. repos before skills is defensive (repos is the more restricted zone).

## §3 ToolRegistry integration — declarative path_params

File: `agent/tools/registry.py` (modified)

### §3.1 Updated `register()` signature

```python
def register(
    self,
    name: str,
    description: str,
    parameters: dict,
    handler: Callable,
    skill: str | None = None,
    path_params: list[dict] | None = None,   # NEW
):
```

`path_params` entries:

```python
{"param": "path",          # JSON Schema field name
 "write": False,           # True = needs write permission
 "required": True}         # If False, None values are skipped
```

### §3.2 Updated `execute()` — pre-flight guard check

```python
async def execute(self, name: str, arguments: dict) -> dict:
    if name not in self.tools:
        raise KeyError(f"Tool '{name}' not registered")

    tool_info = self.tools[name]
    path_params = tool_info.get("path_params", [])

    # Pre-flight permission check
    if self._guard and path_params:
        for pp in path_params:
            value = arguments.get(pp["param"])
            if value is None:
                # Skip guard check. If required=True, the handler will
                # report the missing argument — that's the right UX
                # (missing arg error, not a permission error).
                continue
            result = self._guard.check(value, needs_write=pp.get("write", False))
            if not result["ok"]:
                # Inject system message to remind the agent of boundaries
                if self._host_loop:
                    self._host_loop.memory.add_message(
                        "system",
                        f"[Permission denied] {result['error']}",
                        conversation_id=self._host_loop.conversation_id,
                    )
                return result

    handler = tool_info["handler"]
    result = handler(**arguments)
    if asyncio.iscoroutine(result):
        result = await result
    return result
```

### §3.3 Registration examples (server.py)

```python
# Read-only: path parameter
registry.register(
    name="read_file",
    ...
    path_params=[{"param": "path", "write": False, "required": True}],
    handler=read_file,
)

# Read-only: directory parameter
registry.register(
    name="list_files",
    ...
    path_params=[{"param": "directory", "write": False, "required": True}],
    handler=list_files,
)

# Write tool: name parameter resolves to workspace path
registry.register(
    name="create_md",
    ...
    path_params=[{"param": "name", "write": True, "required": True}],
    handler=...
)

# No path_params — guard not invoked
registry.register(
    name="create_subagent",
    ...
    # no path_params — "tasks" is not a file path
    handler=...
)
```

### §3.4 Design rationale

- **`path_params=None` means no check** — tools like `create_subagent` whose arguments are not file paths simply omit `path_params`.
- **`required=False` + `value=None` → skip** — optional path parameters that aren't provided don't trigger a check.
- **Error returned directly** — handler never executes on permission failure, so no side effects from a denied call.
- **System message injection** — follows the same pattern as `_activate_skills()` (`memory.add_message("system", ...)`); the LLM sees the boundary reminder on its next turn.
- **`_guard` is optional** — when `_guard` is `None` (tests, or guard not initialized), execute() behaves identically to the current implementation. Backward compatible.

## §4 AgentLoop — secondary path check after resolution

File: `agent/agent_loop.py` (modified, lines ~146–148)

### §4.1 Current behavior (problematic)

```python
if tool_name.startswith("create_") and "name" in args and self.workspace:
    resolved = os.path.normpath(os.path.join(self.workspace, args["name"]))
    args = {**args, "name": resolved}
```

`normpath` collapses `../` but does not resolve symlinks or guarantee the final path is within workspace.

### §4.2 New behavior

```python
if tool_name.startswith("create_") and "name" in args and self.workspace:
    resolved = os.path.realpath(os.path.join(self.workspace, args["name"]))
    # Secondary check: resolved path must be in a writable zone
    if self.registry._guard:
        check = self.registry._guard.check(resolved, needs_write=True)
        if not check["ok"]:
            result_str = json.dumps(check, ensure_ascii=False)
            self.memory.add_message(
                "system",
                f"[Permission denied] {check['error']}",
                conversation_id=self.conversation_id,
            )
            self.memory.add_message("tool", result_str,
                                    tool_name=tc["id"],
                                    conversation_id=self.conversation_id)
            yield {
                "type": "tool_result",
                "tool_call_id": tc["id"],
                "name": tool_name,
                "result": check,
            }
            continue  # skip this tool_call, process the next one

    args = {**args, "name": resolved}
```

### §4.3 What this catches

Example: Agent calls `create_md(name="../../../.ssh/authorized_keys")`.

1. Registry layer sees `name="../../../.ssh/authorized_keys"` — this is relative, NOT absolute, so `classify()` resolves it against cwd. If cwd happens to be inside workspace, `realpath` still resolves it outside → denied. But if cwd is `/`, it would be denied by the "denied" zone. The registry layer alone is NOT reliable for relative paths.
2. AgentLoop layer: `os.path.realpath(os.path.join(workspace, "../../../.ssh/authorized_keys"))` → resolves to `/Users/wangyan/.ssh/authorized_keys` → `classify()` → `"denied"` → rejected.

**The AgentLoop layer is essential** because the registry layer validates the raw argument, but `create_*` tools transform `name` into a workspace-relative path.

### §4.4 Design rationale

- **`realpath` replaces `normpath`** — subverts symlink tricks and double-encoding escapes.
- **Same `guard.check()` as registry** — single source of truth for zone membership.
- **`continue` not `return`** — one denied tool_call does not abort the entire turn; other tool_calls in the same turn proceed normally.
- **Guard-gated** — when `self.registry._guard` is `None`, the block is skipped entirely, preserving backward compatibility.

## §5 macOS sandbox — skill script execution

Files: `agent/tools/mindmap_tools.py` (modified), `agent/sandbox/profile.sb` (new)

### §5.1 Sandbox profile template

`<PARAM_*>` markers are Python-side template placeholders — they are NOT
sandbox-exec built-in variables. `_build_sandbox_profile()` does plain string
replacement before writing the profile to a temp file. The file that
`sandbox-exec` actually reads contains only concrete paths.

File: `agent/sandbox/profile.sb`

```lisp
(version 1)

;; —— Read-only: skills, Python, system libraries ——
(allow file-read* (subpath "<PARAM_SKILLS_DIR>"))
(allow file-read* (subpath "<PARAM_PYTHON_HOME>"))
(allow file-read* (subpath "/usr/lib"))
(allow file-read* (subpath "/System/Library"))
(allow file-read* (subpath "/Library/Frameworks"))
(allow file-read* (subpath "/Applications/Xcode.app"))
(allow file-read* (subpath "/private/var/select"))
(allow file-read* (subpath "/dev"))

;; —— Read-only: repos (generated at runtime) ——
<PARAM_REPOS_RULES>

;; —— Read-write ——
(allow file-write* (subpath "<PARAM_WORKSPACE>"))
(allow file-write* (subpath "<PARAM_OUTPUT_DIR>"))
(allow file-write* (subpath "/tmp"))
(allow file-write* (subpath "/private/tmp"))
(allow file-write* (subpath "/dev"))

;; —— Process execution ——
(allow process-exec (subpath "<PARAM_PYTHON_HOME>"))

;; —— Basic operations ——
(allow signal)
(allow sysctl-read)
(allow mach-lookup)

;; —— Deny everything else (no network, no arbitrary FS) ——
(deny default)
```

### §5.2 Profile generation

```python
SANDBOX_PROFILE_TEMPLATE = Path(__file__).resolve().parents[1] / "sandbox" / "profile.sb"

def _build_sandbox_profile(workspace: str, repos: list[str], output_dir: str) -> str:
    """Fill the template with concrete paths for the current guard config."""
    template = SANDBOX_PROFILE_TEMPLATE.read_text()
    repos_rules = "\n".join(
        f'(allow file-read* (subpath "{r}"))' for r in repos
    )
    return (template
        .replace("<PARAM_SKILLS_DIR>", str(SKILLS_DIR))
        .replace("<PARAM_PYTHON_HOME>", str(Path(sys.executable).parent.parent))
        .replace("<PARAM_WORKSPACE>", workspace)
        .replace("<PARAM_OUTPUT_DIR>", output_dir)
        .replace("<PARAM_REPOS_RULES>", repos_rules))
```

### §5.3 Updated `_run_skill_script()`

```python
_guard: "PermissionGuard | None" = None

def set_skill_guard(guard: "PermissionGuard") -> None:
    global _guard
    _guard = guard

def _run_skill_script(*args: str) -> dict:
    script_path = SKILLS_DIR / args[0]

    if _guard:
        profile = _build_sandbox_profile(
            _guard.workspace,
            [os.path.realpath(r) for r in _guard.repos],
            _guard.output_dir,
        )
        with tempfile.NamedTemporaryFile(mode="w", suffix=".sb", delete=False) as f:
            f.write(profile)
            profile_path = f.name
        cmd = [
            "/usr/bin/sandbox-exec", "-f", profile_path,
            sys.executable, str(script_path), *list(args[1:]),
        ]
    else:
        cmd = [sys.executable, str(script_path)] + list(args[1:])
        profile_path = None

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    finally:
        if profile_path:
            os.unlink(profile_path)

    if result.returncode != 0:
        return {"ok": False, "error": result.stderr.strip() or result.stdout.strip()}
    try:
        return json.loads(result.stdout.strip())
    except json.JSONDecodeError:
        return {"ok": False, "error": result.stdout.strip()}
```

### §5.4 Guard propagation

`set_skill_guard()` is called once during server startup (`server.py` `build_registry()`), after the guard is constructed and before any requests are served. Since `_run_skill_script` is imported by all `*_tools.py` modules (markdown, mindmap, derive, network, code-mapping, file-search), a single `set_skill_guard()` call protects every skill script uniformly.

### §5.5 Design rationale

- **Temporary profile, cleaned up in `finally`** — no profile files left on disk.
- **No guard → direct execution** — test suites and non-macOS environments don't need sandbox-exec. The guard is only set in production server startup.
- **`/usr/bin/sandbox-exec`** — absolute path, always present on macOS. No PATH dependency.
- **`deny default`** — whitelist-only approach. Even if the sandbox profile is missing a `<PARAM_*>` replacement, the default deny prevents access rather than silently allowing it.
- **No network access** — `deny default` implicitly blocks network. Skill scripts are pure file-transform functions and don't need network.

## §6 Wiring — server.py startup

File: `agent/server.py` (modified, `build_registry()`)

```python
def build_registry(guard: PermissionGuard | None = None) -> ToolRegistry:
    registry = ToolRegistry()
    registry._guard = guard

    # File ops — read-only path params
    registry.register(name="read_file", ...,
        path_params=[{"param": "path", "write": False, "required": True}],
        handler=read_file)
    # ... (same pattern for list_files, search_in_files, grep)

    # Skill tools — write path params on create_*
    register_mindmap_tools(registry)      # each handler declares its own path_params
    register_markdown_tools(registry)
    # ... etc.

    return registry
```

In `create_app()`:

```python
skills_dir = str(Path(__file__).resolve().parent.parent / "skills")
guard = PermissionGuard(
    workspace=os.getcwd(),  # placeholder; overridden per-request (see §6.2)
    repos=[],
    output_dir=os.getcwd(),
    skills_dir=skills_dir,
)
registry = build_registry(guard=guard)
set_skill_guard(guard)

# At request time (inside /chat endpoint):
# Update guard with the actual workspace/repos/output_dir from the request body
# before the AgentLoop runs.
```

### §6.1 Per-request guard update

Since `workspace`, `repos`, and `output_dir` are per-request (from the chat POST body), not per-server, the guard needs to be updated before each run:

```python
# In agent/tools/permissions.py
class PermissionGuard:
    def update(self, workspace: str, repos: list[str], output_dir: str) -> None:
        """Update mutable fields for the current request context."""
        self.workspace = os.path.realpath(workspace)
        self.repos = [os.path.realpath(r) for r in repos]
        self.output_dir = os.path.realpath(output_dir)
```

Called in the `/chat` endpoint before `agent.run(message)`:

```python
guard.update(workspace=workspace, repos=repos, output_dir=output_dir)
```

Note: `skills_dir` is immutable (server-level config, never changes per-request).

### §6.2 System message update

The system message template in `context.py` should describe the permission boundaries so the Agent understands what it can and cannot do:

```
## Permissions
- **Repos** (read-only): You may read and search code in {repos} but must NOT
  attempt to write, create, or modify files there. Write operations on repo paths
  will be rejected.
- **Workspace** (read-write): You may create, edit, and delete files in {workspace}.
- **Output** (read-write): Generated documents are placed in {output_dir}.
- **Skills** (internal): Skill scripts are loaded and executed automatically.
  You do not need to (and cannot) read or write skill files directly.
- **Everything else**: Access to paths outside these directories is denied.
```

## §7 Error handling summary

| Scenario | Layer that catches it | User-visible behavior |
|---|---|---|
| Agent tries `read_file("/etc/passwd")` | ToolRegistry (pre-flight) | `{"ok": False, "error": "Permission denied: '/etc/passwd' is outside allowed directories"}` + system message |
| Agent tries `create_md("../../../.ssh/key")` | AgentLoop (after path resolution) | Same error format + system message; tool_call skipped |
| Skill script calls `open("/etc/passwd")` | macOS sandbox | `subprocess` returns non-zero; tool result = `{"ok": False, "error": "sandbox-exec: ..."}` |
| Skill script writes outside workspace | macOS sandbox | Same as above |
| Agent tries `grep(repos_dir, ...)` | ToolRegistry — passes (read on repo is OK) | Normal result |
| Agent tries `create_md("notes.md")` in workspace | Both layers pass | Normal behavior |

## §8 What this does NOT cover

- **Network access by the Agent server itself** — the Agent server (FastAPI/httpx) needs network to call LLM APIs. This design does not restrict the server process, only the skill subprocesses.
- **Token-level path filtering in LLM responses** — if the LLM hallucinates file contents, there's no filesystem-level guard. The guard only controls actual tool execution.
- **`.git` directory protection** — repos are fully readable, including `.git/`. This is intentional (code analysis may need git metadata). If this becomes a concern, add a `deny file-read* (subpath ".../.git")` rule in the sandbox profile.
- **Sub-agent permission inheritance** — sub-agents inherit the parent's guard config unchanged (they reuse `host_loop.registry`). No additional scoping is applied.

## §9 Testing strategy

| Test type | What | File |
|---|---|---|
| Unit: PermissionGuard | `classify()` for each zone; `check()` for read/write; edge cases (symlink, `../`, absolute vs relative) | `agent/tests/test_permissions.py` (new) |
| Unit: ToolRegistry | `execute()` with guard → denied; `execute()` without guard → passes; `execute()` with `path_params=None` → skips | `agent/tests/test_registry.py` (modified) |
| Unit: sandbox profile | `_build_sandbox_profile()` generates valid `.sb` syntax with filled params | `agent/tests/test_sandbox.py` (new) |
| Integration | Full AgentLoop run with guard: repo write attempt → denied + system message; workspace write → allowed | `agent/tests/test_agent_loop.py` (modified) |
| Integration: skill sandbox | `_run_skill_script()` with guard → runs under sandbox-exec; output appears in workspace | `agent/tests/test_skill_sandbox.py` (new) |
| Manual | `sandbox-exec -f profile.sb python3 -c "open('/etc/passwd')"` → Permission denied | — |

## §10 Migration & rollout

- **No breaking changes to existing tools** — all current tool registrations continue to work. `path_params` is optional.
- **Guard is opt-in at the server level** — `build_registry(guard=None)` preserves current behavior for tests and non-macOS environments.
- **Rollout order**: (1) PermissionGuard + unit tests, (2) ToolRegistry integration, (3) AgentLoop secondary check, (4) sandbox-exec wrapping, (5) system message update.
