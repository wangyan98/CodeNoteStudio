# Agent Permission System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce directory-level access control: repos read-only, workspace/output_dir read-write, skill scripts sandboxed via macOS `sandbox-exec`.

**Architecture:** Three-layer defense — `PermissionGuard` classifies paths into four zones (workspace/output/repo/skills), `ToolRegistry.execute()` rejects violations before handler invocation, and `AgentLoop` re-checks paths after `create_*` workspace resolution. Skill subprocesses run under `sandbox-exec` with per-call generated profiles.

**Tech Stack:** Python 3 stdlib (`os`, `subprocess`, `tempfile`, `json`), macOS `/usr/bin/sandbox-exec`. Zero new dependencies.

## Global Constraints

- No new pip packages — stdlib + macOS built-ins only
- `_guard` is always optional — `None` means backward-compatible (no check), used in tests
- `path_params=None` on registration means skip guard for that tool
- `skills_dir` is server-level immutable; `workspace`/`repos`/`output_dir` are per-request mutable via `guard.update()`
- All path parameters in `required` lists of tool JSON schemas → path_params entries match
- Test database uses `:memory:` (existing pattern)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `agent/tools/permissions.py` | **Create** | `PermissionGuard` — zone classification, `check()`, `update()` |
| `agent/sandbox/profile.sb` | **Create** | Sandbox template with `<PARAM_*>` placeholders |
| `agent/tools/registry.py` | **Modify** | `register()` gains `path_params`; `execute()` gains pre-flight guard check |
| `agent/tools/mindmap_tools.py` | **Modify** | `_run_skill_script()` wraps sandbox-exec; add `_guard` + `set_skill_guard()` |
| `agent/agent_loop.py` | **Modify** | `create_*` path resolution: `normpath→realpath` + guard re-check |
| `agent/server.py` | **Modify** | `build_registry()` builds guard, sets it on registry + skill tools; `/chat` endpoint calls `guard.update()` |
| `agent/context.py` | **Modify** | System message gains `## Permissions` section |
| `agent/tools/file_search_tools.py` | **Modify** | Remove duplicate `_run_skill_script`; import from mindmap_tools (dedup) |
| `agent/tests/test_permissions.py` | **Create** | Unit tests for `classify()`, `check()`, `update()`, edge cases |
| `agent/tests/test_registry.py` | **Modify** | Tests for `execute()` with guard deny, guard skip, `path_params=None` |
| `agent/tests/test_sandbox.py` | **Create** | Profile generation test; `_run_skill_script` with guard |
| `agent/tests/test_agent_loop.py` | **Modify** | Integration: repo write denied, workspace write allowed, system message injected |

---

### Task 1: PermissionGuard class

**Files:**
- Create: `agent/tools/permissions.py`
- Create: `agent/tests/test_permissions.py`

**Interfaces:**
- Produces: `PermissionGuard(workspace, repos, output_dir, skills_dir)` — constructor, all paths realpath'd
- Produces: `guard.classify(path: str) -> str` — returns `"workspace" | "repo" | "output" | "skills" | "denied"`
- Produces: `guard.check(path: str, needs_write: bool = False) -> dict` — returns `{"ok": True, "zone": "..."}` or `{"ok": False, "error": "...", "zone": "..."}`
- Produces: `guard.update(workspace, repos, output_dir) -> None` — mutates per-request fields (skills_dir unchanged)

- [ ] **Step 1: Write failing tests for PermissionGuard**

Create `agent/tests/test_permissions.py`:

```python
import os
import tempfile
import pytest
from tools.permissions import PermissionGuard


class TestPermissionGuardClassify:
    """Zone classification tests."""

    @pytest.fixture
    def guard(self):
        ws = os.path.realpath("/tmp/test-ws")
        repo = os.path.realpath("/tmp/test-repo")
        out = os.path.realpath("/tmp/test-out")
        skills = os.path.realpath("/tmp/test-skills")
        return PermissionGuard(
            workspace=ws,
            repos=[repo],
            output_dir=out,
            skills_dir=skills,
        )

    def test_classify_workspace_path(self, guard):
        p = os.path.join(guard.workspace, "notes", "doc.md")
        assert guard.classify(p) == "workspace"

    def test_classify_workspace_root_exact_match(self, guard):
        assert guard.classify(guard.workspace) == "workspace"

    def test_classify_repo_path(self, guard):
        repo = guard.repos[0]
        p = os.path.join(repo, "src", "main.py")
        assert guard.classify(p) == "repo"

    def test_classify_repo_root_exact_match(self, guard):
        assert guard.classify(guard.repos[0]) == "repo"

    def test_classify_output_path(self, guard):
        p = os.path.join(guard.output_dir, "docs", "readme.md")
        assert guard.classify(p) == "output"

    def test_classify_skills_path(self, guard):
        p = os.path.join(guard.skills_dir, "mind-map", "SKILL.md")
        assert guard.classify(p) == "skills"

    def test_classify_denied_etc_passwd(self, guard):
        assert guard.classify("/etc/passwd") == "denied"

    def test_classify_denied_home_dir(self, guard):
        home = os.path.expanduser("~")
        # If home happens to equal one of the allowed dirs, pick something else
        p = os.path.join(home, ".ssh", "id_rsa")
        # Only assert denied if not accidentally in an allowed zone
        if not any(
            p.startswith(d + os.sep) or p == d
            for d in [guard.workspace, guard.output_dir]
            + [guard.repos[0], guard.skills_dir]
        ):
            assert guard.classify(p) == "denied"

    def test_classify_resolves_symlink(self, guard):
        """Symlinked path resolves to real path before classification."""
        with tempfile.TemporaryDirectory() as tmpdir:
            link = os.path.join(tmpdir, "link_to_passwd")
            os.symlink("/etc/passwd", link)
            # The symlink target (/etc/passwd) should resolve to denied
            result = guard.classify(link)
            # realpath resolves the symlink → /etc/passwd → denied
            assert result == "denied"

    def test_classify_dotdot_traversal(self, guard):
        """../ escapes are resolved before zone check."""
        p = os.path.join(guard.workspace, "..", "..", "etc", "passwd")
        assert guard.classify(p) == "denied"

    def test_classify_workspace_wins_over_output_when_overlapping(self):
        """When output_dir is subdir of workspace, workspace matches first."""
        ws = os.path.realpath("/tmp/test-ws-overlap")
        out = os.path.join(ws, "output")
        guard = PermissionGuard(
            workspace=ws, repos=[], output_dir=out, skills_dir="/tmp/sk"
        )
        # A file in output/ should match workspace first (both are RW, same outcome)
        p = os.path.join(out, "file.md")
        zone = guard.classify(p)
        assert zone in ("workspace", "output")  # either is fine for RW

    def test_classify_multiple_repos(self):
        """Multiple repos are all checked."""
        ws = os.path.realpath("/tmp/ws-multi")
        r1 = os.path.realpath("/tmp/repo-a")
        r2 = os.path.realpath("/tmp/repo-b")
        guard = PermissionGuard(
            workspace=ws, repos=[r1, r2],
            output_dir=ws, skills_dir="/tmp/sk"
        )
        assert guard.classify(os.path.join(r1, "a.py")) == "repo"
        assert guard.classify(os.path.join(r2, "b.py")) == "repo"


class TestPermissionGuardCheck:
    """Permission check tests."""

    @pytest.fixture
    def guard(self):
        return PermissionGuard(
            workspace=os.path.realpath("/tmp/ws-check"),
            repos=[os.path.realpath("/tmp/repo-check")],
            output_dir=os.path.realpath("/tmp/out-check"),
            skills_dir=os.path.realpath("/tmp/skills-check"),
        )

    def test_check_read_workspace_ok(self, guard):
        result = guard.check(
            os.path.join(guard.workspace, "file.md"), needs_write=False
        )
        assert result["ok"] is True
        assert result["zone"] == "workspace"

    def test_check_write_workspace_ok(self, guard):
        result = guard.check(
            os.path.join(guard.workspace, "file.md"), needs_write=True
        )
        assert result["ok"] is True

    def test_check_read_repo_ok(self, guard):
        result = guard.check(
            os.path.join(guard.repos[0], "src", "main.py"), needs_write=False
        )
        assert result["ok"] is True
        assert result["zone"] == "repo"

    def test_check_write_repo_denied(self, guard):
        result = guard.check(
            os.path.join(guard.repos[0], "src", "main.py"), needs_write=True
        )
        assert result["ok"] is False
        assert "read-only repo" in result["error"]
        assert result["zone"] == "repo"

    def test_check_write_skills_denied(self, guard):
        result = guard.check(
            os.path.join(guard.skills_dir, "script.py"), needs_write=True
        )
        assert result["ok"] is False
        assert "skills" in result["error"]

    def test_check_read_denied_etc(self, guard):
        result = guard.check("/etc/passwd", needs_write=False)
        assert result["ok"] is False
        assert "outside allowed" in result["error"]
        assert result["zone"] == "denied"

    def test_check_write_denied_etc(self, guard):
        result = guard.check("/etc/passwd", needs_write=True)
        assert result["ok"] is False


class TestPermissionGuardUpdate:
    """Per-request guard.update() tests."""

    def test_update_changes_workspace(self):
        guard = PermissionGuard(
            workspace="/tmp/old-ws", repos=[],
            output_dir="/tmp/old-out", skills_dir="/tmp/sk"
        )
        guard.update(
            workspace="/tmp/new-ws", repos=["/tmp/new-repo"],
            output_dir="/tmp/new-out"
        )
        assert guard.workspace == os.path.realpath("/tmp/new-ws")
        assert guard.repos == [os.path.realpath("/tmp/new-repo")]
        assert guard.output_dir == os.path.realpath("/tmp/new-out")

    def test_update_preserves_skills_dir(self):
        guard = PermissionGuard(
            workspace="/tmp/ws", repos=[],
            output_dir="/tmp/out", skills_dir="/tmp/orig-skills"
        )
        guard.update(workspace="/tmp/ws2", repos=[], output_dir="/tmp/out2")
        assert guard.skills_dir == os.path.realpath("/tmp/orig-skills")

    def test_update_then_classify_uses_new_zones(self):
        guard = PermissionGuard(
            workspace="/tmp/ws1", repos=["/tmp/repo1"],
            output_dir="/tmp/out1", skills_dir="/tmp/sk"
        )
        guard.update(
            workspace="/tmp/ws2", repos=["/tmp/repo2"],
            output_dir="/tmp/out2"
        )
        assert guard.classify(os.path.join("/tmp/ws2", "f.md")) == "workspace"
        assert guard.classify(os.path.join("/tmp/ws1", "f.md")) == "denied"
        assert guard.classify(os.path.join("/tmp/repo2", "f.py")) == "repo"
        assert guard.classify(os.path.join("/tmp/repo1", "f.py")) == "denied"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/wangyan/Desktop/note/agent && python -m pytest tests/test_permissions.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'tools.permissions'`

- [ ] **Step 3: Write minimal PermissionGuard implementation**

Create `agent/tools/permissions.py`:

```python
import os


class PermissionGuard:
    """Classifies file paths into access zones and enforces read/write permissions.

    Four zones:
      - workspace: read + write (user's notebook directory)
      - output:    read + write (generated document output directory)
      - repo:      read only   (attached code repositories)
      - skills:    read only   (internal skill scripts)
      - denied:    no access   (everything else)
    """

    def __init__(
        self,
        workspace: str,
        repos: list[str],
        output_dir: str,
        skills_dir: str,
    ):
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/wangyan/Desktop/note/agent && python -m pytest tests/test_permissions.py -v`
Expected: PASS (all 18 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/wangyan/Desktop/note
git add agent/tools/permissions.py agent/tests/test_permissions.py
git commit -m "feat: add PermissionGuard — four-zone path classification and access control"
```

---

### Task 2: Sandbox profile template + profile generation

**Files:**
- Create: `agent/sandbox/profile.sb`
- Create: `agent/tests/test_sandbox.py`
- Modify: `agent/tools/mindmap_tools.py` — add `_build_sandbox_profile()` and `set_skill_guard()`; update `_run_skill_script()` imports

**Interfaces:**
- Produces: `set_skill_guard(guard: PermissionGuard) -> None` — module-level setter called once at server startup
- Produces: `_build_sandbox_profile(workspace, repos, output_dir) -> str` — fills template, returns profile string
- Produces: `_run_skill_script(*args)` — updated to use sandbox-exec when `_guard` is set

- [ ] **Step 1: Create sandbox profile template**

Create `agent/sandbox/profile.sb`:

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

- [ ] **Step 2: Write failing test for profile generation**

Create `agent/tests/test_sandbox.py`:

```python
import os
import sys
import tempfile
from pathlib import Path
import pytest


class TestSandboxProfile:
    """Tests for _build_sandbox_profile — verifies template filling."""

    def test_build_profile_fills_all_placeholders(self):
        """Generated profile must contain zero <PARAM_* markers."""
        from tools.mindmap_tools import _build_sandbox_profile

        profile = _build_sandbox_profile(
            workspace="/tmp/ws",
            repos=["/tmp/repo-a", "/tmp/repo-b"],
            output_dir="/tmp/out",
        )
        assert "<PARAM_" not in profile, (
            f"Profile still contains unfilled placeholders: "
            f"{[l for l in profile.split(chr(10)) if '<PARAM_' in l]}"
        )

    def test_build_profile_includes_repo_rules(self):
        """Each repo gets its own (allow file-read* ...) rule."""
        from tools.mindmap_tools import _build_sandbox_profile

        profile = _build_sandbox_profile(
            workspace="/tmp/ws",
            repos=["/tmp/repo-a", "/tmp/repo-b"],
            output_dir="/tmp/out",
        )
        assert '(allow file-read* (subpath "/tmp/repo-a"))' in profile
        assert '(allow file-read* (subpath "/tmp/repo-b"))' in profile

    def test_build_profile_includes_workspace_write(self):
        from tools.mindmap_tools import _build_sandbox_profile

        profile = _build_sandbox_profile(
            workspace="/tmp/ws",
            repos=[],
            output_dir="/tmp/out",
        )
        assert '(allow file-write* (subpath "/tmp/ws"))' in profile

    def test_build_profile_no_repos_produces_empty_rules(self):
        """Empty repos list should result in no extra repo rules."""
        from tools.mindmap_tools import _build_sandbox_profile

        profile = _build_sandbox_profile(
            workspace="/tmp/ws", repos=[], output_dir="/tmp/out"
        )
        # repos line should be empty (just the placeholder replaced)
        lines = profile.split("\n")
        repos_section_start = lines.index(";; —— Read-only: repos (generated at runtime) ——")
        next_line = lines[repos_section_start + 1]
        # Next line after the comment should be empty (or the next section comment)
        assert next_line == "" or next_line.startswith(";;")

    def test_build_profile_has_version_and_deny_default(self):
        from tools.mindmap_tools import _build_sandbox_profile

        profile = _build_sandbox_profile(
            workspace="/tmp/ws", repos=[], output_dir="/tmp/out"
        )
        assert profile.startswith("(version 1)")
        assert "(deny default)" in profile


class TestSetSkillGuard:
    """Tests for set_skill_guard module-level setter."""

    def test_set_and_read_guard(self):
        from tools.mindmap_tools import set_skill_guard, _guard
        from tools.permissions import PermissionGuard

        g = PermissionGuard(
            workspace="/tmp/ws", repos=[],
            output_dir="/tmp/out", skills_dir="/tmp/sk"
        )
        set_skill_guard(g)
        try:
            assert _guard is g
        finally:
            set_skill_guard(None)  # cleanup

    def test_set_guard_none(self):
        from tools.mindmap_tools import set_skill_guard, _guard

        set_skill_guard(None)
        assert _guard is None
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /Users/wangyan/Desktop/note/agent && python -m pytest tests/test_sandbox.py -v`
Expected: FAIL — `ImportError: cannot import name '_build_sandbox_profile'`

- [ ] **Step 4: Add `_build_sandbox_profile` and `set_skill_guard` to mindmap_tools.py**

Modify `agent/tools/mindmap_tools.py`:

Add at top, after existing imports:

```python
import os
import tempfile
import sys
from pathlib import Path
```

Add after `SKILLS_DIR` definition (line 7), before `register_mindmap_tools`:

```python
SANDBOX_PROFILE_TEMPLATE = Path(__file__).resolve().parents[1] / "sandbox" / "profile.sb"

_guard = None  # type: ignore  # PermissionGuard | None


def set_skill_guard(guard) -> None:
    """Set the global PermissionGuard for sandboxed skill execution.
    
    Called once during server startup. When None (default), skill scripts
    execute directly without sandboxing (backward compatible for tests).
    """
    global _guard
    _guard = guard


def _build_sandbox_profile(workspace: str, repos: list[str], output_dir: str) -> str:
    """Fill the sandbox template with concrete paths for the current guard config."""
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

Now replace `_run_skill_script` (lines 88-97) with the sandbox-aware version:

```python
def _run_skill_script(*args: str) -> dict:
    script_path = SKILLS_DIR / args[0]

    if _guard:
        profile = _build_sandbox_profile(
            _guard.workspace,
            [os.path.realpath(r) for r in _guard.repos],
            _guard.output_dir,
        )
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".sb", delete=False
        ) as f:
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

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/wangyan/Desktop/note/agent && python -m pytest tests/test_sandbox.py -v`
Expected: PASS (all 6 tests)

- [ ] **Step 6: Verify existing skill tool tests still pass** (no guard = direct execution)

Run: `cd /Users/wangyan/Desktop/note/agent && python -m pytest tests/test_skill_tools.py -v`
Expected: PASS (unchanged behavior when `_guard` is None)

- [ ] **Step 7: Deduplicate `_run_skill_script` in file_search_tools.py**

`agent/tools/file_search_tools.py` has its own copy of the old `_run_skill_script`. Replace with import from mindmap_tools:

In `agent/tools/file_search_tools.py`, delete lines 1-18 (the `_run_skill_script` definition and `SKILLS_DIR` / imports it uses) and replace with:

```python
from pathlib import Path
from .registry import ToolRegistry
from .mindmap_tools import _run_skill_script

SKILLS_DIR = Path(__file__).resolve().parents[2] / "skills"
```

Verify the file now reads:

```python
from pathlib import Path
from .registry import ToolRegistry
from .mindmap_tools import _run_skill_script

SKILLS_DIR = Path(__file__).resolve().parents[2] / "skills"


def register_file_search_tools(registry):
    registry.register(
        name="search_files",
        ...  # unchanged
```

- [ ] **Step 8: Commit**

```bash
cd /Users/wangyan/Desktop/note
git add agent/sandbox/profile.sb agent/tools/mindmap_tools.py agent/tools/file_search_tools.py agent/tests/test_sandbox.py
git commit -m "feat: add macOS sandbox-exec wrapping for skill scripts + profile template"
```

---

### Task 3: ToolRegistry path_params integration

**Files:**
- Modify: `agent/tools/registry.py` — `register()` gains `path_params`, `execute()` gains pre-flight check
- Modify: `agent/tools/mindmap_tools.py` — add `path_params` to all registrations
- Modify: `agent/tools/markdown_tools.py` — add `path_params` to all registrations
- Modify: `agent/tools/derive_tools.py` — add `path_params` to all registrations
- Modify: `agent/tools/network_tools.py` — add `path_params` to all registrations
- Modify: `agent/tools/code_mapping_tools.py` — add `path_params` to all registrations
- Modify: `agent/tests/test_registry.py` — add guard-related tests

**Interfaces:**
- Modifies: `registry.register()` signature — adds optional `path_params: list[dict] | None = None`
- Modifies: `registry.execute()` — if `_guard` and `path_params`, validate before handler
- Consumes: `PermissionGuard.check(path, needs_write) -> dict`

- [ ] **Step 1: Write failing tests for registry guard integration**

Append to `agent/tests/test_registry.py`:

```python
import os
import pytest
from tools.registry import ToolRegistry
from tools.permissions import PermissionGuard


class FakeMemory:
    """Minimal fake for system message injection."""
    def __init__(self):
        self.messages = []

    def add_message(self, role, content, conversation_id=None):
        self.messages.append({"role": role, "content": content})


class FakeHostLoopWithMemory:
    is_subagent = False
    conversation_id = "test-conv"

    def __init__(self):
        self.memory = FakeMemory()


class TestRegistryWithGuard:
    """Tests for ToolRegistry.execute() with PermissionGuard integration."""

    @pytest.fixture
    def guard(self):
        return PermissionGuard(
            workspace=os.path.realpath("/tmp/test-ws"),
            repos=[os.path.realpath("/tmp/test-repo")],
            output_dir=os.path.realpath("/tmp/test-out"),
            skills_dir=os.path.realpath("/tmp/test-skills"),
        )

    @pytest.fixture
    def host(self):
        return FakeHostLoopWithMemory()

    @pytest.fixture
    def registry(self, guard, host):
        reg = ToolRegistry()
        reg._guard = guard
        reg._host_loop = host
        return reg

    @pytest.mark.asyncio
    async def test_read_allowed_in_repo(self, registry):
        """Reading a file inside a repo should succeed."""
        registry.register(
            name="safe_read",
            description="Read file",
            parameters={
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
            handler=lambda path: {"ok": True, "content": "data"},
            path_params=[{"param": "path", "write": False, "required": True}],
        )
        result = await registry.execute(
            "safe_read", {"path": "/tmp/test-repo/src/main.py"}
        )
        assert result["ok"] is True

    @pytest.mark.asyncio
    async def test_write_denied_in_repo(self, registry):
        """Writing a file inside a repo should be denied."""
        registry.register(
            name="bad_write",
            description="Write file",
            parameters={
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
            handler=lambda path: {"ok": True},
            path_params=[{"param": "path", "write": True, "required": True}],
        )
        result = await registry.execute(
            "bad_write", {"path": "/tmp/test-repo/src/main.py"}
        )
        assert result["ok"] is False
        assert "read-only repo" in result["error"]

    @pytest.mark.asyncio
    async def test_denied_injects_system_message(self, registry, host):
        """Permission denial should inject a system message via host_loop."""
        registry.register(
            name="outside_read",
            description="Read file",
            parameters={
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
            handler=lambda path: {"ok": True},
            path_params=[{"param": "path", "write": False, "required": True}],
        )
        await registry.execute("outside_read", {"path": "/etc/passwd"})
        assert len(host.memory.messages) == 1
        assert host.memory.messages[0]["role"] == "system"
        assert "Permission denied" in host.memory.messages[0]["content"]

    @pytest.mark.asyncio
    async def test_no_path_params_skips_guard(self, registry):
        """Tools without path_params should not be checked."""
        registry.register(
            name="no_path_tool",
            description="No path params",
            parameters={
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
            },
            handler=lambda query: {"ok": True, "query": query},
            # no path_params
        )
        result = await registry.execute("no_path_tool", {"query": "hello"})
        assert result["ok"] is True

    @pytest.mark.asyncio
    async def test_no_guard_passes_through(self, registry):
        """When _guard is None, execute() behaves like before."""
        registry._guard = None
        registry.register(
            name="unchecked",
            description="Any path",
            parameters={
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
            handler=lambda path: {"ok": True, "path": path},
            path_params=[{"param": "path", "write": True, "required": True}],
        )
        result = await registry.execute("unchecked", {"path": "/etc/passwd"})
        assert result["ok"] is True  # no guard → no check

    @pytest.mark.asyncio
    async def test_missing_required_path_skips_guard(self, registry):
        """When a required path param is None, skip guard → handler reports error."""
        registry.register(
            name="needs_path",
            description="Needs a path",
            parameters={
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
            handler=lambda path: (
                {"ok": True} if path else {"ok": False, "error": "path is required"}
            ),
            path_params=[{"param": "path", "write": False, "required": True}],
        )
        # Call without the 'path' argument → value is None → guard skipped
        # handler gets None and returns its own error
        import asyncio
        result = await registry.execute("needs_path", {})
        assert result["ok"] is False
        assert result["error"] == "path is required"

    @pytest.mark.asyncio
    async def test_optional_path_param_none_skipped(self, registry):
        """Optional path params with value None are skipped."""
        registry.register(
            name="optional_path",
            description="Has optional path",
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "msg": {"type": "string"},
                },
                "required": ["msg"],
            },
            handler=lambda msg, path=None: {"ok": True, "msg": msg},
            path_params=[{"param": "path", "write": False, "required": False}],
        )
        result = await registry.execute("optional_path", {"msg": "hello"})
        assert result["ok"] is True

    @pytest.mark.asyncio
    async def test_write_allowed_in_workspace(self, registry):
        """Writing a file inside workspace should succeed."""
        registry.register(
            name="create_in_ws",
            description="Create file in workspace",
            parameters={
                "type": "object",
                "properties": {"name": {"type": "string"}},
                "required": ["name"],
            },
            handler=lambda name: {"ok": True, "path": name},
            path_params=[{"param": "name", "write": True, "required": True}],
        )
        result = await registry.execute(
            "create_in_ws", {"name": "/tmp/test-ws/notes/doc.md"}
        )
        assert result["ok"] is True

    @pytest.mark.asyncio
    async def test_write_allowed_in_output(self, registry):
        """Writing a file inside output_dir should succeed."""
        registry.register(
            name="create_in_out",
            description="Create file in output",
            parameters={
                "type": "object",
                "properties": {"name": {"type": "string"}},
                "required": ["name"],
            },
            handler=lambda name: {"ok": True, "path": name},
            path_params=[{"param": "name", "write": True, "required": True}],
        )
        result = await registry.execute(
            "create_in_out", {"name": "/tmp/test-out/report.md"}
        )
        assert result["ok"] is True
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/wangyan/Desktop/note/agent && python -m pytest tests/test_registry.py::TestRegistryWithGuard -v`
Expected: All FAIL — `TypeError: register() got an unexpected keyword argument 'path_params'`

- [ ] **Step 3: Update ToolRegistry.register() and execute()**

Modify `agent/tools/registry.py`:

Replace the `register` method:

```python
    def register(
        self,
        name: str,
        description: str,
        parameters: dict,
        handler: Callable,
        skill: str | None = None,
        path_params: list[dict] | None = None,
    ):
        self.tools[name] = {
            "name": name,
            "description": description,
            "parameters": parameters,
            "handler": handler,
            "skill": skill,
            "path_params": path_params,
        }
```

Replace the `execute` method:

```python
    async def execute(self, name: str, arguments: dict) -> dict:
        if name not in self.tools:
            raise KeyError(f"Tool '{name}' not registered")

        tool_info = self.tools[name]
        path_params = tool_info.get("path_params")

        # Pre-flight permission check
        if self._guard and path_params:
            for pp in path_params:
                value = arguments.get(pp["param"])
                if value is None:
                    # Skip guard check. If required=True, the handler will
                    # report the missing argument — that's the right UX
                    # (missing arg error, not a permission error).
                    continue
                result = self._guard.check(
                    value, needs_write=pp.get("write", False)
                )
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

- [ ] **Step 4: Run registry tests to verify they pass**

Run: `cd /Users/wangyan/Desktop/note/agent && python -m pytest tests/test_registry.py -v`
Expected: All tests PASS (original 7 + 9 new = 16)

- [ ] **Step 5: Add path_params to all tool registrations**

In `agent/tools/mindmap_tools.py`, update each `registry.register` call:

```python
# create_mindmap — name becomes workspace-relative path (write)
registry.register(
    name="create_mindmap",
    ...
    path_params=[{"param": "name", "write": True, "required": True}],
    handler=...,
)

# add_node — path to existing .mind.json (write: modifies the file)
registry.register(
    name="add_node",
    ...
    path_params=[{"param": "path", "write": True, "required": True}],
    handler=...,
)

# update_node — path to existing .mind.json (write)
registry.register(
    name="update_node",
    ...
    path_params=[{"param": "path", "write": True, "required": True}],
    handler=...,
)

# delete_node — path to existing .mind.json (write)
registry.register(
    name="delete_node",
    ...
    path_params=[{"param": "path", "write": True, "required": True}],
    handler=...,
)
```

In `agent/tools/markdown_tools.py`, update each `registry.register` call:

```python
# create_md — name becomes workspace-relative path (write)
registry.register(
    name="create_md",
    ...
    path_params=[{"param": "name", "write": True, "required": True}],
    handler=...,
)

# append_section — path to existing .md (write)
registry.register(
    name="append_section",
    ...
    path_params=[{"param": "path", "write": True, "required": True}],
    handler=...,
)

# replace_section — path to existing .md (write)
registry.register(
    name="replace_section",
    ...
    path_params=[{"param": "path", "write": True, "required": True}],
    handler=...,
)

# insert_embed — path to existing .md (write)
registry.register(
    name="insert_embed",
    ...
    path_params=[{"param": "path", "write": True, "required": True}],
    handler=...,
)

# delete_embed — path to existing .md (write)
registry.register(
    name="delete_embed",
    ...
    path_params=[{"param": "path", "write": True, "required": True}],
    handler=...,
)

# insert_ref — path to existing .md (write)
registry.register(
    name="insert_ref",
    ...
    path_params=[{"param": "path", "write": True, "required": True}],
    handler=...,
)

# delete_ref — path to existing .md (write)
registry.register(
    name="delete_ref",
    ...
    path_params=[{"param": "path", "write": True, "required": True}],
    handler=...,
)
```

In `agent/tools/derive_tools.py`:

```python
# create_derive — name (write)
registry.register(
    name="create_derive",
    ...
    path_params=[{"param": "name", "write": True, "required": True}],
    handler=...,
)

# add_step — path to existing .derive.json (write)
registry.register(
    name="add_step",
    ...
    path_params=[{"param": "path", "write": True, "required": True}],
    handler=...,
)
```

In `agent/tools/network_tools.py`:

```python
# create_network — name (write)
registry.register(
    name="create_network",
    ...
    path_params=[{"param": "name", "write": True, "required": True}],
    handler=...,
)

# add_layer — path (write)
registry.register(
    name="add_layer",
    ...
    path_params=[{"param": "path", "write": True, "required": True}],
    handler=...,
)

# add_block — path (write)
registry.register(
    name="add_block",
    ...
    path_params=[{"param": "path", "write": True, "required": True}],
    handler=...,
)

# list_preset_layers — no path params
registry.register(
    name="list_preset_layers",
    ...
    # no path_params
    handler=...,
)
```

In `agent/tools/file_search_tools.py`:

```python
# search_files — directory is read-only (reads files for search, no mutation)
def register_file_search_tools(registry):
    registry.register(
        name="search_files",
        ...
        path_params=[{"param": "directory", "write": False, "required": True}],
        handler=...,
    )
```

In `agent/tools/code_mapping_tools.py`:

```python
# set_code_mapping — path (write)
registry.register(
    name="set_code_mapping",
    ...
    path_params=[{"param": "path", "write": True, "required": True}],
    handler=...,
)

# delete_code_mapping — path (write)
registry.register(
    name="delete_code_mapping",
    ...
    path_params=[{"param": "path", "write": True, "required": True}],
    handler=...,
)
```

- [ ] **Step 6: Run all existing tests to verify nothing broke**

Run: `cd /Users/wangyan/Desktop/note/agent && python -m pytest tests/ -v --ignore=tests/test_permissions.py --ignore=tests/test_sandbox.py`
Expected: All existing tests still PASS (no guard set on registries created in tests = backward compatible)

- [ ] **Step 7: Commit**

```bash
cd /Users/wangyan/Desktop/note
git add agent/tools/registry.py agent/tools/mindmap_tools.py agent/tools/markdown_tools.py agent/tools/derive_tools.py agent/tools/network_tools.py agent/tools/code_mapping_tools.py agent/tests/test_registry.py
git commit -m "feat: add path_params to ToolRegistry — pre-flight guard check on execute()"
```

---

### Task 4: AgentLoop secondary check + server.py wiring

**Files:**
- Modify: `agent/agent_loop.py` — `create_*` path resolution: `normpath→realpath` + guard re-check
- Modify: `agent/server.py` — build guard, wire to registry + skill tools, per-request `guard.update()`

**Interfaces:**
- Consumes: `self.registry._guard.check(resolved, needs_write=True)` in AgentLoop
- Produces: `registries and tools get guard reference at startup`

- [ ] **Step 1: Update AgentLoop path resolution**

In `agent/agent_loop.py`, find lines 146-148:

```python
            if tool_name.startswith("create_") and "name" in args and self.workspace:
                resolved = os.path.normpath(os.path.join(self.workspace, args["name"]))
                args = {**args, "name": resolved}
```

Replace with:

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
                        self.memory.add_message(
                            "tool",
                            result_str,
                            tool_name=tc["id"],
                            conversation_id=self.conversation_id,
                        )
                        yield {
                            "type": "tool_result",
                            "tool_call_id": tc["id"],
                            "name": tool_name,
                            "result": check,
                        }
                        continue  # skip this tool_call, process the next one

                args = {**args, "name": resolved}
```

- [ ] **Step 2: Write AgentLoop integration test**

Create a new test class in `agent/tests/test_agent_loop.py`. Find the last line of the existing file and append:

```python
import os


class TestAgentLoopWithGuard:
    """Integration tests: AgentLoop with PermissionGuard."""

    @pytest.fixture
    def guard(self):
        from tools.permissions import PermissionGuard
        return PermissionGuard(
            workspace=os.path.realpath("/tmp/ws-grd"),
            repos=[os.path.realpath("/tmp/repo-grd")],
            output_dir=os.path.realpath("/tmp/out-grd"),
            skills_dir=os.path.realpath("/tmp/sk-grd"),
        )

    @pytest.fixture
    def registry_with_guard(self, guard):
        from tools.registry import ToolRegistry
        reg = ToolRegistry()
        reg._guard = guard
        reg.register(
            name="echo",
            description="Echo back",
            parameters={
                "type": "object",
                "properties": {"message": {"type": "string"}},
                "required": ["message"],
            },
            handler=lambda message: {"ok": True, "echo": message},
            # no path_params — echo is not a file tool
        )
        reg.register(
            name="create_zone_reader",
            description="A fake create_* tool for testing guard",
            parameters={
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["name"],
            },
            handler=lambda name, content="": {"ok": True, "path": name, "content": content},
            path_params=[{"param": "name", "write": True, "required": True}],
        )
        return reg

    @pytest.fixture
    def memory(self):
        from memory import ConversationMemory
        return ConversationMemory(":memory:")

    @pytest.mark.asyncio
    async def test_create_tool_in_workspace_succeeds(self, registry_with_guard, memory):
        """create_* tool targeting workspace should succeed."""
        provider = FakeProvider([
            [
                {
                    "type": "tool_call",
                    "tool_call": {
                        "id": "call_1",
                        "function": {
                            "name": "create_zone_reader",
                            "arguments": {
                                "name": "notes.md",
                                "content": "hello",
                            },
                        },
                    },
                },
                {"type": "done"},
            ],
            [
                {"type": "text", "content": "Done."},
                {"type": "done"},
            ],
        ])

        agent = AgentLoop(
            provider=provider,
            registry=registry_with_guard,
            memory=memory,
            workspace="/tmp/ws-grd",
            repos=["/tmp/repo-grd"],
            output_dir="/tmp/out-grd",
            max_steps=5,
        )

        events = []
        async for event in agent.run("create a note"):
            events.append(event)

        tool_results = [e for e in events if e["type"] == "tool_result"]
        assert len(tool_results) == 1
        assert tool_results[0]["result"]["ok"] is True
        # path should be resolved to an absolute path inside workspace
        assert tool_results[0]["result"]["path"].startswith("/tmp/ws-grd")

    @pytest.mark.asyncio
    async def test_create_tool_outside_workspace_denied(self, registry_with_guard, memory):
        """create_* tool with ../ escape should be denied by AgentLoop guard."""
        provider = FakeProvider([
            [
                {
                    "type": "tool_call",
                    "tool_call": {
                        "id": "call_1",
                        "function": {
                            "name": "create_zone_reader",
                            "arguments": {
                                "name": "../../../etc/malicious.sh",
                                "content": "bad",
                            },
                        },
                    },
                },
                {"type": "done"},
            ],
            [
                {"type": "text", "content": "OK."},
                {"type": "done"},
            ],
        ])

        agent = AgentLoop(
            provider=provider,
            registry=registry_with_guard,
            memory=memory,
            workspace="/tmp/ws-grd",
            repos=["/tmp/repo-grd"],
            output_dir="/tmp/out-grd",
            max_steps=5,
        )

        events = []
        async for event in agent.run("create a note outside"):
            events.append(event)

        tool_results = [e for e in events if e["type"] == "tool_result"]
        # One tool_result event for the denied call
        denied = [tr for tr in tool_results if tr["result"].get("ok") is False]
        assert len(denied) == 1
        assert "Permission denied" in denied[0]["result"]["error"]

    @pytest.mark.asyncio
    async def test_no_guard_skips_checks(self, registry_with_guard, memory):
        """When registry._guard is None, create_* tools work unvalidated."""
        registry_with_guard._guard = None

        provider = FakeProvider([
            [
                {
                    "type": "tool_call",
                    "tool_call": {
                        "id": "call_1",
                        "function": {
                            "name": "create_zone_reader",
                            "arguments": {
                                "name": "../../../etc/somefile",
                                "content": "test",
                            },
                        },
                    },
                },
                {"type": "done"},
            ],
            [
                {"type": "text", "content": "Done."},
                {"type": "done"},
            ],
        ])

        agent = AgentLoop(
            provider=provider,
            registry=registry_with_guard,
            memory=memory,
            workspace="/tmp/ws-grd",
            repos=["/tmp/repo-grd"],
            output_dir="/tmp/out-grd",
            max_steps=5,
        )

        events = []
        async for event in agent.run("create anything"):
            events.append(event)

        tool_results = [e for e in events if e["type"] == "tool_result"]
        assert len(tool_results) == 1
        # Without guard, the tool executes (path will be resolved via realpath
        # but not checked — the handler just echoes it back)
        assert tool_results[0]["result"]["ok"] is True
```

- [ ] **Step 3: Run the new tests**

Run: `cd /Users/wangyan/Desktop/note/agent && python -m pytest tests/test_agent_loop.py::TestAgentLoopWithGuard -v`
Expected: PASS (3 tests)

- [ ] **Step 4: Run all agent tests to verify nothing broke**

Run: `cd /Users/wangyan/Desktop/note/agent && python -m pytest tests/ -v`
Expected: All tests PASS

- [ ] **Step 5: Wire guard in server.py**

Modify `agent/server.py` `build_registry()` signature and body:

```python
from tools.permissions import PermissionGuard
from tools.mindmap_tools import set_skill_guard


def build_registry(guard: PermissionGuard | None = None) -> ToolRegistry:
    registry = ToolRegistry()
    registry._guard = guard

    # File ops — read-only
    registry.register(
        name="read_file",
        description="Read a file from disk. Returns up to max_lines (default 500). Use start_line/end_line to read specific ranges.",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Absolute path to the file"},
                "start_line": {"type": "integer", "description": "Start line (1-based, default 1)"},
                "end_line": {"type": "integer", "description": "End line (inclusive, default auto-capped at start_line+max_lines)"},
                "max_lines": {"type": "integer", "description": "Max lines to return (default 500)"},
            },
            "required": ["path"],
        },
        handler=read_file,
        path_params=[{"param": "path", "write": False, "required": True}],
    )

    registry.register(
        name="list_files",
        description="List files in a directory recursively. Limited to max_results (default 200).",
        parameters={
            "type": "object",
            "properties": {
                "directory": {"type": "string", "description": "Directory path to list"},
                "pattern": {"type": "string", "description": "Filename glob pattern (default *)"},
                "max_results": {"type": "integer", "description": "Max entries to return (default 200)"},
            },
            "required": ["directory"],
        },
        handler=list_files,
        path_params=[{"param": "directory", "write": False, "required": True}],
    )

    registry.register(
        name="search_in_files",
        description="Search for a string pattern in files under a directory (case-insensitive). Limited to max_results (default 50).",
        parameters={
            "type": "object",
            "properties": {
                "directory": {"type": "string", "description": "Directory to search in"},
                "query": {"type": "string", "description": "Search query string"},
                "file_pattern": {"type": "string", "description": "File glob pattern (default *.py)"},
                "max_results": {"type": "integer", "description": "Max matches to return (default 50)"},
            },
            "required": ["directory", "query"],
        },
        handler=search_in_files,
        path_params=[{"param": "directory", "write": False, "required": True}],
    )

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
        path_params=[{"param": "directory", "write": False, "required": True}],
    )

    # File search tools (directory is read-only path param — registrations
    # inside register_file_search_tools already have path_params added in Task 3)
    register_file_search_tools(registry)
    # Skill tools (create_* have write path params — already added in Task 3)
    register_mindmap_tools(registry)
    register_derive_tools(registry)
    register_network_tools(registry)
    register_markdown_tools(registry)
    register_code_mapping_tools(registry)

    return registry
```

In `create_app()`, after the `providers = load_providers()` line (line 146), add guard construction:

```python
    # Build the PermissionGuard with server-level skills_dir.
    # workspace/repos/output_dir are per-request and updated in /chat.
    skills_dir = str(Path(__file__).resolve().parent.parent / "skills")
    guard = PermissionGuard(
        workspace=os.getcwd(),   # placeholder; overridden per-request
        repos=[],
        output_dir=os.getcwd(),
        skills_dir=skills_dir,
    )
    registry = build_registry(guard=guard)
    set_skill_guard(guard)
```

Replace the existing line `registry = build_registry()` (line 145) with the above block.

In the `/chat` endpoint, before `agent.run(message)` (inside the `async def event_stream():` closure, before the `async for` loop), add `guard.update()`:

```python
        # Update guard with this request's actual workspace/repos/output_dir
        guard.update(workspace=workspace, repos=repos, output_dir=output_dir)

        # Bind this AgentLoop as the host for create_subagent calls in this round.
        registry.set_host_loop(agent)
```

Insert `guard.update(...)` right before `registry.set_host_loop(agent)`.

- [ ] **Step 6: Run server tests to verify wiring**

Run: `cd /Users/wangyan/Desktop/note/agent && python -m pytest tests/test_server.py -v`
Expected: All tests PASS (guard is constructed with cwd placeholders in tests — no file ops to real paths)

- [ ] **Step 7: Commit**

```bash
cd /Users/wangyan/Desktop/note
git add agent/agent_loop.py agent/server.py agent/tests/test_agent_loop.py
git commit -m "feat: AgentLoop secondary guard check + server.py guard wiring"
```

---

### Task 5: System message update

**Files:**
- Modify: `agent/context.py` — add `## Permissions` section to SYSTEM_TEMPLATE

**Interfaces:**
- Modifies: `SYSTEM_TEMPLATE` string — adds permissions section after `## Available Tools`

- [ ] **Step 1: Update SYSTEM_TEMPLATE in context.py**

In `agent/context.py`, find the `SYSTEM_TEMPLATE` string (line 13). After the `## Available Tools` line (around line 21), insert a Permissions section before `## Guidelines`:

In the template, add after `{tools_section}` and before `## Guidelines`:

```
## Permissions
- **Repos** (read-only): You may read and search code in the attached repositories but must NOT attempt to write, create, or modify files there. Write operations on repo paths will be rejected automatically.
- **Workspace** (read-write): You may create, edit, and delete files in the workspace directory.
- **Output** (read-write): Generated documents may be placed in the output directory.
- **Skills** (internal): Skill scripts are loaded automatically when tools are first used. You do not need to (and cannot) read or write skill files directly.
- **Everything else**: Access to paths outside the above directories is denied.
```

The updated `SYSTEM_TEMPLATE` should read:

```python
SYSTEM_TEMPLATE = """You are a code analysis assistant. You help users understand code repositories by searching, reading files, and generating structured documentation.

## Current Context
- Workspace: {workspace}
- Code Repositories: {repos}
- Output directory for generated docs: {output_dir}
- Active file in Code Viewport: {active_file}

## Available Tools
{tools_section}

## Permissions
- **Repos** (read-only): You may read and search code in the attached repositories but must NOT attempt to write, create, or modify files there. Write operations on repo paths will be rejected automatically.
- **Workspace** (read-write): You may create, edit, and delete files in the workspace directory.
- **Output** (read-write): Generated documents may be placed in the output directory.
- **Skills** (internal): Skill scripts are loaded automatically when tools are first used. You do not need to (and cannot) read or write skill files directly.
- **Everything else**: Access to paths outside the above directories is denied.

## Guidelines
1. When asked to analyze code, first use search_in_files and read_file to understand the relevant source files.
2. Then choose the most appropriate document type(s) to present your findings.
3. **Organize by topic**: Always group related documents into a topic-specific subdirectory under the workspace. Infer the topic from the user's question — e.g., for a lighting derivation use `lighting/`, for a ResNet architecture use `resnet/`, for project structure use `architecture/`. Never dump files directly into the workspace root.
4. Be thorough but concise. Focus on what the user asked about.

## Markdown Workflow — Process Before Summary
When the user asks for a final analysis/report in markdown:
- **Do NOT** jump straight to creating one big summary .md file.
- **First**, create separate intermediate .md files for each sub-topic or module you analyze
  under a topic subdirectory (e.g., `auth/module_a_analysis.md`, `auth/data_flow.md`).
  Append sections to each as you dig deeper.
- **Only after** all sub-topics have been explored and their intermediate .md files are
  complete, create the final summary .md file that synthesizes the key findings.
- This ensures the final summary is well-grounded in detailed analysis rather than
  superficial one-pass impressions.

5. After generating documents, summarize what you created and where.
"""
```

- [ ] **Step 2: Verify context test still passes**

Run: `cd /Users/wangyan/Desktop/note/agent && python -m pytest tests/test_context.py -v`
Expected: PASS (test may need update if it checks for exact template length — adjust if needed)

- [ ] **Step 3: Commit**

```bash
cd /Users/wangyan/Desktop/note
git add agent/context.py
git commit -m "docs: add Permissions section to agent system message template"
```

---

### Task 6: End-to-end smoke test

**Files:**
- Modified: manual verification only — no new files

- [ ] **Step 1: Run the full test suite**

Run: `cd /Users/wangyan/Desktop/note/agent && python -m pytest tests/ -v`
Expected: All tests PASS

- [ ] **Step 2: Manual sandbox-exec validation**

Run a one-liner to confirm sandbox-exec works on this macOS:

```bash
echo '(version 1) (deny default)' > /tmp/test-deny.sb
/usr/bin/sandbox-exec -f /tmp/test-deny.sb python3 -c "open('/etc/passwd')" 2>&1; echo "Exit: $?"
rm /tmp/test-deny.sb
```

Expected: Non-zero exit code (sandbox denies the operation)

- [ ] **Step 3: Commit any remaining changes**

```bash
cd /Users/wangyan/Desktop/note
git status
# If clean, done. Otherwise commit remaining files.
```

---

### Task 7: Final verification — full test suite

- [ ] **Step 1: Run complete test suite from project root**

```bash
cd /Users/wangyan/Desktop/note/agent && python -m pytest tests/ -v --tb=short
```

Expected: All tests green.

- [ ] **Step 2: Verify git status is clean**

```bash
cd /Users/wangyan/Desktop/note && git status
```
