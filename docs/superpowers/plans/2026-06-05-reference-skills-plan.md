# Reference Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `![[path]]` embed and `@ref()` reference insertion/deletion tools to the markdown skill, and create a new code-mapping skill for setting/deleting CodeMapping on nodes across mind-map, derive-tree, and network-graph documents.

**Architecture:** Four new markdown scripts follow the existing `append_section.py` pattern (positional args + duplicate detection). Two new code-mapping scripts follow the `update_node.py` pattern (document-type dispatch via extension). Each script gets a test file and an agent tool registration.

**Tech Stack:** Python 3, argparse, pytest, tempfile

---

### Task 1: insert_embed — Append `![[path]]` to .md files

**Files:**
- Create: `skills/markdown/scripts/insert_embed.py`
- Create: `skills/markdown/tests/test_insert_embed.py`

- [ ] **Step 1: Write the failing test**

```python
# skills/markdown/tests/test_insert_embed.py
import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"

def run_script(*args):
    result = subprocess.run([sys.executable, str(SCRIPTS / "insert_embed.py"), *args], capture_output=True, text=True)
    return result.returncode, result.stdout.strip()

def _make_md(path):
    with open(path, 'w') as f:
        f.write("# Doc\n\n## Section\n\ncontent\n")

def test_inserts_embed_at_end():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md(path)
        code, out = run_script(path, "diagrams/flow.seq.mermaid")
        assert code == 0, out
        content = open(path).read()
        assert "![[diagrams/flow.seq.mermaid]]\n" in content

def test_rejects_duplicate_embed():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md(path)
        run_script(path, "diagrams/flow.seq.mermaid")
        code, out = run_script(path, "diagrams/flow.seq.mermaid")
        assert code == 1, out
        assert "already exists" in json.loads(out)["error"].lower()

def test_preserves_existing_content():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md(path)
        run_script(path, "diagrams/flow.seq.mermaid")
        content = open(path).read()
        assert "## Section" in content
        assert "content" in content

def test_file_not_found():
    code, out = run_script("/nonexistent/path.md", "diagrams/flow.seq.mermaid")
    assert code == 1
    assert "not found" in json.loads(out)["error"].lower()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/wangyan/Desktop/note && .venv/bin/python -m pytest skills/markdown/tests/test_insert_embed.py -v`
Expected: FAIL — `No such file or directory` for `insert_embed.py`

- [ ] **Step 3: Write insert_embed.py**

```python
#!/usr/bin/env python3
"""Insert an ![[embed_path]] reference into a .md file."""
import argparse, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import resolve_path

EMBED_PREFIX = "![["
EMBED_SUFFIX = "]]"

def main():
    parser = argparse.ArgumentParser(description="Insert an embed reference into a .md file")
    parser.add_argument("path", help="Path to the .md file")
    parser.add_argument("embed_path", help="Path to the note to embed (relative to workspace root)")
    args = parser.parse_args()

    args.path = resolve_path(args.path, ".md")

    if not os.path.exists(args.path):
        print(json.dumps({"ok": False, "error": f"File not found: {args.path}"}))
        sys.exit(1)

    embed_line = f"{EMBED_PREFIX}{args.embed_path}{EMBED_SUFFIX}\n"

    with open(args.path, 'r', encoding='utf-8') as f:
        content = f.read()

    if embed_line.strip() in content:
        print(json.dumps({"ok": False, "error": f"Embed already exists: {args.embed_path}"}))
        sys.exit(1)

    with open(args.path, 'a', encoding='utf-8') as f:
        if not content.endswith('\n'):
            f.write('\n')
        f.write(embed_line)

    print(json.dumps({"ok": True}))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/wangyan/Desktop/note && .venv/bin/python -m pytest skills/markdown/tests/test_insert_embed.py -v`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add skills/markdown/scripts/insert_embed.py skills/markdown/tests/test_insert_embed.py
git commit -m "feat: add insert_embed script for ![[path]] references in .md files"
```

---

### Task 2: delete_embed — Remove `![[path]]` from .md files

**Files:**
- Create: `skills/markdown/scripts/delete_embed.py`
- Create: `skills/markdown/tests/test_delete_embed.py`

- [ ] **Step 1: Write the failing test**

```python
# skills/markdown/tests/test_delete_embed.py
import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"

def run_script(*args):
    result = subprocess.run([sys.executable, str(SCRIPTS / "delete_embed.py"), *args], capture_output=True, text=True)
    return result.returncode, result.stdout.strip()

def _make_md_with_embeds(path):
    with open(path, 'w') as f:
        f.write("# Doc\n\n![[one.seq.mermaid]]\n![[two.mind.json]]\n\ncontent\n")

def test_deletes_embed():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md_with_embeds(path)
        code, out = run_script(path, "one.seq.mermaid")
        assert code == 0, out
        content = open(path).read()
        assert "![[one.seq.mermaid]]" not in content
        assert "![[two.mind.json]]" in content

def test_embed_not_found():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md_with_embeds(path)
        code, out = run_script(path, "nonexistent.seq.mermaid")
        assert code == 1
        error = json.loads(out)["error"].lower()
        assert "not found" in error or "no matching" in error

def test_deletes_last_embed():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        with open(path, 'w') as f:
            f.write("# Doc\n\n![[only.seq.mermaid]]\n")
        code, out = run_script(path, "only.seq.mermaid")
        assert code == 0, out
        content = open(path).read()
        assert "![[only.seq.mermaid]]" not in content
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/wangyan/Desktop/note && .venv/bin/python -m pytest skills/markdown/tests/test_delete_embed.py -v`
Expected: FAIL

- [ ] **Step 3: Write delete_embed.py**

```python
#!/usr/bin/env python3
"""Delete an ![[embed_path]] reference from a .md file."""
import argparse, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import resolve_path

def main():
    parser = argparse.ArgumentParser(description="Delete an embed reference from a .md file")
    parser.add_argument("path", help="Path to the .md file")
    parser.add_argument("embed_path", help="The embed path to remove")
    args = parser.parse_args()

    args.path = resolve_path(args.path, ".md")

    if not os.path.exists(args.path):
        print(json.dumps({"ok": False, "error": f"File not found: {args.path}"}))
        sys.exit(1)

    embed_line = f"![[{args.embed_path}]]"

    with open(args.path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    new_lines = [line for line in lines if embed_line not in line]

    if len(new_lines) == len(lines):
        print(json.dumps({"ok": False, "error": f"Embed not found: {args.embed_path}"}))
        sys.exit(1)

    # Clean up trailing empty lines left by deletion
    while new_lines and new_lines[-1].strip() == "":
        new_lines.pop()
    if new_lines:
        new_lines.append("\n")

    with open(args.path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)

    print(json.dumps({"ok": True}))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/wangyan/Desktop/note && .venv/bin/python -m pytest skills/markdown/tests/test_delete_embed.py -v`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add skills/markdown/scripts/delete_embed.py skills/markdown/tests/test_delete_embed.py
git commit -m "feat: add delete_embed script to remove ![[path]] references"
```

---

### Task 3: insert_ref — Append `@ref(...)` to .md files

**Files:**
- Create: `skills/markdown/scripts/insert_ref.py`
- Create: `skills/markdown/tests/test_insert_ref.py`

- [ ] **Step 1: Write the failing test**

```python
# skills/markdown/tests/test_insert_ref.py
import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"

def run_script(*args):
    result = subprocess.run([sys.executable, str(SCRIPTS / "insert_ref.py"), *args], capture_output=True, text=True)
    return result.returncode, result.stdout.strip()

def _make_md(path):
    with open(path, 'w') as f:
        f.write("# Doc\n\n## Section\n\ncontent\n")

def test_inserts_ref_at_end():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md(path)
        code, out = run_script(path, "Nilou-main#Engine/Source/Runtime/Core/Public/Containers/Array.h#287")
        assert code == 0, out
        content = open(path).read()
        assert "@ref(Nilou-main#Engine/Source/Runtime/Core/Public/Containers/Array.h#287)" in content

def test_rejects_duplicate_ref():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md(path)
        run_script(path, "MyClass.getValue")
        code, out = run_script(path, "MyClass.getValue")
        assert code == 1, out
        assert "already exists" in json.loads(out)["error"].lower()

def test_ref_with_all_segments():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md(path)
        code, out = run_script(path, "Nilou-main#Engine/Source/Runtime/Core/Public/Math/Vector.h#32#FVector")
        assert code == 0, out
        content = open(path).read()
        assert "@ref(Nilou-main#Engine/Source/Runtime/Core/Public/Math/Vector.h#32#FVector)" in content

def test_file_not_found():
    code, out = run_script("/nonexistent/path.md", "SomeClass.method")
    assert code == 1
    assert "not found" in json.loads(out)["error"].lower()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/wangyan/Desktop/note && .venv/bin/python -m pytest skills/markdown/tests/test_insert_ref.py -v`
Expected: FAIL

- [ ] **Step 3: Write insert_ref.py**

```python
#!/usr/bin/env python3
"""Insert an @ref(...) code reference into a .md file."""
import argparse, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import resolve_path

def main():
    parser = argparse.ArgumentParser(description="Insert a code reference into a .md file")
    parser.add_argument("path", help="Path to the .md file")
    parser.add_argument("ref", help="Reference string (e.g. repo#file#line#name)")
    args = parser.parse_args()

    args.path = resolve_path(args.path, ".md")

    if not os.path.exists(args.path):
        print(json.dumps({"ok": False, "error": f"File not found: {args.path}"}))
        sys.exit(1)

    ref_line = f"@ref({args.ref})\n"

    with open(args.path, 'r', encoding='utf-8') as f:
        content = f.read()

    if args.ref in content:
        print(json.dumps({"ok": False, "error": f"Reference already exists: {args.ref}"}))
        sys.exit(1)

    with open(args.path, 'a', encoding='utf-8') as f:
        if not content.endswith('\n'):
            f.write('\n')
        f.write(ref_line)

    print(json.dumps({"ok": True}))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/wangyan/Desktop/note && .venv/bin/python -m pytest skills/markdown/tests/test_insert_ref.py -v`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add skills/markdown/scripts/insert_ref.py skills/markdown/tests/test_insert_ref.py
git commit -m "feat: add insert_ref script for @ref() code references in .md files"
```

---

### Task 4: delete_ref — Remove `@ref()` from .md files

**Files:**
- Create: `skills/markdown/scripts/delete_ref.py`
- Create: `skills/markdown/tests/test_delete_ref.py`

- [ ] **Step 1: Write the failing test**

```python
# skills/markdown/tests/test_delete_ref.py
import json, os, subprocess, sys, tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"

def run_script(*args):
    result = subprocess.run([sys.executable, str(SCRIPTS / "delete_ref.py"), *args], capture_output=True, text=True)
    return result.returncode, result.stdout.strip()

def _make_md_with_refs(path):
    with open(path, 'w') as f:
        f.write("# Doc\n\n@ref(RepoA#file.h#10)\n@ref(RepoB#file.cpp#50)\n\ncontent\n")

def test_deletes_ref():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md_with_refs(path)
        code, out = run_script(path, "RepoA#file.h#10")
        assert code == 0, out
        content = open(path).read()
        assert "@ref(RepoA#file.h#10)" not in content
        assert "@ref(RepoB#file.cpp#50)" in content

def test_ref_not_found():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        _make_md_with_refs(path)
        code, out = run_script(path, "Nonexistent#file.h")
        assert code == 1
        assert "not found" in json.loads(out)["error"].lower()

def test_ref_partial_match_not_deleted():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.md")
        with open(path, 'w') as f:
            f.write("@ref(RepoA#file.h#10)\n@ref(RepoA#file.h#100)\n")
        code, out = run_script(path, "RepoA#file.h#10")
        assert code == 0, out
        content = open(path).read()
        assert "@ref(RepoA#file.h#100)" in content
        assert "@ref(RepoA#file.h#10)" not in content
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/wangyan/Desktop/note && .venv/bin/python -m pytest skills/markdown/tests/test_delete_ref.py -v`
Expected: FAIL

- [ ] **Step 3: Write delete_ref.py**

```python
#!/usr/bin/env python3
"""Delete an @ref(...) code reference from a .md file."""
import argparse, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import resolve_path

def main():
    parser = argparse.ArgumentParser(description="Delete a code reference from a .md file")
    parser.add_argument("path", help="Path to the .md file")
    parser.add_argument("ref", help="The ref string to remove (without @ref() wrapper)")
    args = parser.parse_args()

    args.path = resolve_path(args.path, ".md")

    if not os.path.exists(args.path):
        print(json.dumps({"ok": False, "error": f"File not found: {args.path}"}))
        sys.exit(1)

    ref_pattern = f"@ref({args.ref})"

    with open(args.path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    new_lines = [line for line in lines if ref_pattern not in line]

    if len(new_lines) == len(lines):
        print(json.dumps({"ok": False, "error": f"Reference not found: {args.ref}"}))
        sys.exit(1)

    while new_lines and new_lines[-1].strip() == "":
        new_lines.pop()
    if new_lines:
        new_lines.append("\n")

    with open(args.path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)

    print(json.dumps({"ok": True}))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/wangyan/Desktop/note && .venv/bin/python -m pytest skills/markdown/tests/test_delete_ref.py -v`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add skills/markdown/scripts/delete_ref.py skills/markdown/tests/test_delete_ref.py
git commit -m "feat: add delete_ref script to remove @ref() code references"
```

---

### Task 5: Register markdown embed/ref tools in agent

**Files:**
- Modify: `agent/tools/markdown_tools.py`

- [ ] **Step 1: Add 4 new tool registrations to register_markdown_tools**

In `register_markdown_tools()`, append after the existing `replace_section` registration:

```python
    registry.register(
        name="insert_embed",
        description="Insert an ![[path]] embed reference into a .md file. Embeds another notebook note inline. Path is relative to workspace root. Supported targets: .seq.mermaid, .derive.json, .mind.json, .net.json, .md.",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .md file"},
                "embed_path": {"type": "string", "description": "Path to the note to embed (relative to workspace root, e.g. 'diagrams/flow.seq.mermaid')"},
            },
            "required": ["path", "embed_path"],
        },
        handler=lambda path, embed_path: _run_skill_script(
            "markdown/scripts/insert_embed.py", path, embed_path
        ),
    )

    registry.register(
        name="delete_embed",
        description="Delete an ![[path]] embed reference from a .md file",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .md file"},
                "embed_path": {"type": "string", "description": "The embed path to remove"},
            },
            "required": ["path", "embed_path"],
        },
        handler=lambda path, embed_path: _run_skill_script(
            "markdown/scripts/delete_embed.py", path, embed_path
        ),
    )

    registry.register(
        name="insert_ref",
        description="Insert an @ref() code reference into a .md file. Links to specific code locations with #-separated segments: @ref(repo#file#line#name). All segments are optional. Without repo prefix, scoped to current repo.",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .md file"},
                "ref": {"type": "string", "description": "Reference string (e.g. 'repo#file.h#287' or 'MyClass.getValue')"},
            },
            "required": ["path", "ref"],
        },
        handler=lambda path, ref: _run_skill_script(
            "markdown/scripts/insert_ref.py", path, ref
        ),
    )

    registry.register(
        name="delete_ref",
        description="Delete an @ref() code reference from a .md file",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .md file"},
                "ref": {"type": "string", "description": "The ref string to remove (without @ref() wrapper)"},
            },
            "required": ["path", "ref"],
        },
        handler=lambda path, ref: _run_skill_script(
            "markdown/scripts/delete_ref.py", path, ref
        ),
    )
```

- [ ] **Step 2: Run existing markdown tool tests to check no regressions**

Run: `cd /Users/wangyan/Desktop/note && .venv/bin/python -m pytest skills/markdown/tests/ -v`
Expected: All existing tests still PASS

- [ ] **Step 3: Commit**

```bash
git add agent/tools/markdown_tools.py
git commit -m "feat: register insert_embed, delete_embed, insert_ref, delete_ref agent tools"
```

---

### Task 6: Update markdown SKILL.md documentation

**Files:**
- Modify: `skills/markdown/SKILL.md`

- [ ] **Step 1: Add 4 new rows to the Scripts table**

After the `replace_section.py` row in the table, add:

```markdown
| `scripts/insert_embed.py <path> <embed_path>` | Insert `![[embed_path]]` line (rejects duplicates) |
| `scripts/delete_embed.py <path> <embed_path>` | Remove matching `![[embed_path]]` line |
| `scripts/insert_ref.py <path> <ref>` | Insert `@ref(ref)` line (rejects duplicates) |
| `scripts/delete_ref.py <path> <ref>` | Remove matching `@ref(ref)` line |
```

- [ ] **Step 2: Add usage sections for each new script after the replace_section section**

After the `replace_section.py` usage section, append:

```markdown
### insert_embed.py

```bash
python scripts/insert_embed.py doc.md diagrams/flow.seq.mermaid
# => {"ok": true}
```

### delete_embed.py

```bash
python scripts/delete_embed.py doc.md diagrams/flow.seq.mermaid
# => {"ok": true}
```

### insert_ref.py

```bash
python scripts/insert_ref.py doc.md Nilou-main#Engine/Source/Array.h#287
# => {"ok": true}
```

### delete_ref.py

```bash
python scripts/delete_ref.py doc.md Nilou-main#Engine/Source/Array.h#287
# => {"ok": true}
```

- [ ] **Step 3: Commit**

```bash
git add skills/markdown/SKILL.md
git commit -m "docs: document new embed and ref scripts in markdown SKILL.md"
```

---

### Task 7: set_code_mapping — Set codeMapping on any document node

**Files:**
- Create: `skills/code-mapping/SKILL.md`
- Create: `skills/code-mapping/scripts/set_code_mapping.py`
- Create: `skills/code-mapping/tests/test_set_code_mapping.py`

- [ ] **Step 1: Create SKILL.md**

```markdown
---
name: code-mapping
description: Set or delete codeMapping on nodes in .mind.json, .derive.json, and .net.json documents. Code mappings link nodes to specific source code locations.
---

# Code Mapping Skill

Operates on `.mind.json`, `.derive.json`, and `.net.json` documents. Sets or deletes CodeMapping metadata on individual nodes.

## Cross-References

Code mappings link nodes to source code locations:

```json
{
  "raw": "@ref(Nilou-main#Engine/Source/Array.h#287)",
  "functionName": "alignas",
  "filePath": "Engine/Source/Runtime/Core/Public/Containers/Array.h",
  "startLine": 287,
  "endLine": 287
}
```

The `raw` field stores the original reference string. All five fields are required.

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/set_code_mapping.py <path> <node_id>` | Set codeMapping on a node |
| `scripts/delete_code_mapping.py <path> <node_id>` | Remove codeMapping from a node |

### set_code_mapping.py

```bash
python scripts/set_code_mapping.py doc.mind.json abc123 \
  --raw "@ref(Nilou-main#Engine/Source/Array.h#287)" \
  --function-name "Array" \
  --file-path "Engine/Source/Runtime/Core/Public/Containers/Array.h" \
  --start-line 287 \
  --end-line 350
# => {"ok": true}
```

Supports `.mind.json`, `.derive.json`, and `.net.json` — detected by file extension.

### delete_code_mapping.py

```bash
python scripts/delete_code_mapping.py doc.mind.json abc123
# => {"ok": true}
```

Fails if no codeMapping exists on the node.
```

- [ ] **Step 2: Write the failing test for set_code_mapping**

```python
# skills/code-mapping/tests/test_set_code_mapping.py
import json, os, subprocess, sys, tempfile, uuid
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import create_mindmap_document, save_mindmap, write_json
from lib.schemas import (
    create_derive_document, DerivationNode,
    create_network_document,
)

def run_script(*args):
    result = subprocess.run([sys.executable, str(SCRIPTS / "set_code_mapping.py"), *args], capture_output=True, text=True)
    return result.returncode, result.stdout.strip()

def test_sets_mindmap_node_code_mapping():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        doc = create_mindmap_document("Test")
        node_id = doc.root.id
        save_mindmap(path, doc)

        code, out = run_script(
            path, node_id,
            "--raw", "@ref(Repo#file.h#10)",
            "--function-name", "main",
            "--file-path", "file.h",
            "--start-line", "10",
            "--end-line", "20",
        )
        assert code == 0, out
        result = json.loads(out)
        assert result["ok"] is True

        # Verify on disk
        with open(path) as f:
            data = json.load(f)
        assert data["root"]["codeMapping"]["raw"] == "@ref(Repo#file.h#10)"
        assert data["root"]["codeMapping"]["functionName"] == "main"

def test_sets_derive_node_code_mapping():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        doc = create_derive_document()
        node = DerivationNode(
            id=str(uuid.uuid4()), title="Step 1", content="x = 1",
            stepNumber=1, derivesFrom=None, derivesTo=[], embedRefs=[]
        )
        doc.nodes.append(node)
        write_json(path, {"type": "derive", "version": 1, "nodes": [
            {"id": node.id, "title": node.title, "content": node.content,
             "stepNumber": node.stepNumber, "derivesFrom": None, "derivesTo": [], "embedRefs": []}
        ]})

        code, out = run_script(
            path, node.id,
            "--raw", "@ref(Repo#src.py#5)",
            "--function-name", "calc",
            "--file-path", "src.py",
            "--start-line", "5",
            "--end-line", "10",
        )
        assert code == 0, out

        with open(path) as f:
            data = json.load(f)
        assert data["nodes"][0]["codeMapping"]["functionName"] == "calc"

def test_sets_network_node_code_mapping():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.net.json")
        doc = create_network_document("Net")
        # Use the input node
        node_id = doc.nodes[0].id
        write_json(path, {"type": "net", "version": 2, "name": "Net",
            "nodes": [{"id": node_id, "kind": "input", "label": "Input"}],
            "edges": []})

        code, out = run_script(
            path, node_id,
            "--raw", "@ref(Repo#model.py#42)",
            "--function-name", "forward",
            "--file-path", "model.py",
            "--start-line", "42",
            "--end-line", "60",
        )
        assert code == 0, out

        with open(path) as f:
            data = json.load(f)
        assert data["nodes"][0]["codeMapping"]["functionName"] == "forward"

def test_node_not_found():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        doc = create_mindmap_document("Test")
        save_mindmap(path, doc)

        code, out = run_script(
            path, "nonexistent-id",
            "--raw", "@ref(Repo#file.h#10)",
            "--function-name", "main",
            "--file-path", "file.h",
            "--start-line", "10",
            "--end-line", "20",
        )
        assert code == 1
        assert "not found" in json.loads(out)["error"].lower()
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/wangyan/Desktop/note && .venv/bin/python -m pytest skills/code-mapping/tests/test_set_code_mapping.py -v`
Expected: FAIL

- [ ] **Step 4: Write set_code_mapping.py**

```python
#!/usr/bin/env python3
"""Set codeMapping on a node in any supported document type."""
import argparse, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import (
    load_mindmap, save_mindmap,
    load_derive, save_derive,
    load_network, save_network,
    resolve_path, read_json, write_json,
)
from lib.schemas import CodeMapping

EXTENSION_LOADERS = {
    ".mind.json": ("mindmap", lambda p: load_mindmap(p)),
    ".derive.json": ("derive", lambda p: load_derive(p)),
    ".net.json": ("net", lambda p: load_network(p)),
}

EXTENSION_SAVERS = {
    "mindmap": lambda p, d: save_mindmap(p, d),
    "derive": lambda p, d: save_derive(p, d),
    "net": lambda p, d: save_network(p, d),
}

def _find_node_in_mindmap(root, node_id):
    if root.id == node_id:
        return root
    for child in root.children:
        found = _find_node_in_mindmap(child, node_id)
        if found:
            return found
    return None

def _find_node_in_derive(nodes, node_id):
    return next((n for n in nodes if n.id == node_id), None)

def _find_node_in_network(nodes, node_id):
    def search(ns):
        for n in ns:
            if n.id == node_id:
                return n
            if n.children:
                found = search(n.children)
                if found:
                    return found
        return None
    return search(nodes)

def main():
    parser = argparse.ArgumentParser(description="Set codeMapping on a document node")
    parser.add_argument("path", help="Path to the document")
    parser.add_argument("node_id", help="ID of the target node")
    parser.add_argument("--raw", required=True, help="Raw reference text")
    parser.add_argument("--function-name", required=True)
    parser.add_argument("--file-path", required=True)
    parser.add_argument("--start-line", type=int, required=True)
    parser.add_argument("--end-line", type=int, required=True)
    args = parser.parse_args()

    # Detect document type from extension
    doc_type = None
    loader = None
    for ext, (dtype, fn) in EXTENSION_LOADERS.items():
        if args.path.endswith(ext):
            doc_type = dtype
            loader = fn
            break

    if doc_type is None:
        print(json.dumps({"ok": False, "error": f"Unsupported file type: {args.path}. Expected .mind.json, .derive.json, or .net.json"}))
        sys.exit(1)

    if not os.path.exists(args.path):
        print(json.dumps({"ok": False, "error": f"File not found: {args.path}"}))
        sys.exit(1)

    doc = loader(args.path)
    cm = CodeMapping(
        raw=args.raw,
        functionName=args.function_name,
        filePath=args.file_path,
        startLine=args.start_line,
        endLine=args.end_line,
    )

    if doc_type == "mindmap":
        node = _find_node_in_mindmap(doc.root, args.node_id)
    elif doc_type == "derive":
        node = _find_node_in_derive(doc.nodes, args.node_id)
    else:  # net
        node = _find_node_in_network(doc.nodes, args.node_id)

    if node is None:
        print(json.dumps({"ok": False, "error": f"Node not found: {args.node_id}"}))
        sys.exit(1)

    node.codeMapping = cm
    EXTENSION_SAVERS[doc_type](args.path, doc)
    print(json.dumps({"ok": True}))
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/wangyan/Desktop/note && .venv/bin/python -m pytest skills/code-mapping/tests/test_set_code_mapping.py -v`
Expected: 4 PASS

- [ ] **Step 6: Commit**

```bash
git add skills/code-mapping/
git commit -m "feat: add code-mapping skill with set_code_mapping script"
```

---

### Task 8: delete_code_mapping — Remove codeMapping from any document node

**Files:**
- Create: `skills/code-mapping/scripts/delete_code_mapping.py`
- Create: `skills/code-mapping/tests/test_delete_code_mapping.py`

- [ ] **Step 1: Write the failing test**

```python
# skills/code-mapping/tests/test_delete_code_mapping.py
import json, os, subprocess, sys, tempfile, uuid
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import create_mindmap_document, save_mindmap, write_json
from lib.schemas import CodeMapping, DerivationNode, create_derive_document

def run_script(*args):
    result = subprocess.run([sys.executable, str(SCRIPTS / "delete_code_mapping.py"), *args], capture_output=True, text=True)
    return result.returncode, result.stdout.strip()

def test_deletes_mindmap_code_mapping():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        doc = create_mindmap_document("Test")
        doc.root.codeMapping = CodeMapping(
            raw="@ref(Repo#file.h#10)", functionName="main",
            filePath="file.h", startLine=10, endLine=20
        )
        save_mindmap(path, doc)

        code, out = run_script(path, doc.root.id)
        assert code == 0, out

        with open(path) as f:
            data = json.load(f)
        assert data["root"].get("codeMapping") is None

def test_deletes_derive_code_mapping():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.derive.json")
        node_id = str(uuid.uuid4())
        write_json(path, {"type": "derive", "version": 1, "nodes": [{
            "id": node_id, "title": "S1", "content": "x",
            "stepNumber": 1, "derivesFrom": None, "derivesTo": [], "embedRefs": [],
            "codeMapping": {"raw": "@ref(Repo#a.py#1)", "functionName": "f",
                            "filePath": "a.py", "startLine": 1, "endLine": 3}
        }]})

        code, out = run_script(path, node_id)
        assert code == 0, out

        with open(path) as f:
            data = json.load(f)
        assert data["nodes"][0].get("codeMapping") is None

def test_no_code_mapping_to_delete():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "test.mind.json")
        doc = create_mindmap_document("Test")
        save_mindmap(path, doc)

        code, out = run_script(path, doc.root.id)
        assert code == 1
        assert "no code mapping" in json.loads(out)["error"].lower()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/wangyan/Desktop/note && .venv/bin/python -m pytest skills/code-mapping/tests/test_delete_code_mapping.py -v`
Expected: FAIL

- [ ] **Step 3: Write delete_code_mapping.py**

```python
#!/usr/bin/env python3
"""Delete codeMapping from a node in any supported document type."""
import argparse, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from lib.file_utils import (
    load_mindmap, save_mindmap,
    load_derive, save_derive,
    load_network, save_network,
)

EXTENSION_LOADERS = {
    ".mind.json": ("mindmap", lambda p: load_mindmap(p)),
    ".derive.json": ("derive", lambda p: load_derive(p)),
    ".net.json": ("net", lambda p: load_network(p)),
}

EXTENSION_SAVERS = {
    "mindmap": lambda p, d: save_mindmap(p, d),
    "derive": lambda p, d: save_derive(p, d),
    "net": lambda p, d: save_network(p, d),
}

def _find_node_in_mindmap(root, node_id):
    if root.id == node_id:
        return root
    for child in root.children:
        found = _find_node_in_mindmap(child, node_id)
        if found:
            return found
    return None

def _find_node_in_derive(nodes, node_id):
    return next((n for n in nodes if n.id == node_id), None)

def _find_node_in_network(nodes, node_id):
    def search(ns):
        for n in ns:
            if n.id == node_id:
                return n
            if n.children:
                found = search(n.children)
                if found:
                    return found
        return None
    return search(nodes)

def main():
    parser = argparse.ArgumentParser(description="Delete codeMapping from a document node")
    parser.add_argument("path", help="Path to the document")
    parser.add_argument("node_id", help="ID of the target node")
    args = parser.parse_args()

    doc_type = None
    loader = None
    for ext, (dtype, fn) in EXTENSION_LOADERS.items():
        if args.path.endswith(ext):
            doc_type = dtype
            loader = fn
            break

    if doc_type is None:
        print(json.dumps({"ok": False, "error": f"Unsupported file type: {args.path}"}))
        sys.exit(1)

    if not os.path.exists(args.path):
        print(json.dumps({"ok": False, "error": f"File not found: {args.path}"}))
        sys.exit(1)

    doc = loader(args.path)

    if doc_type == "mindmap":
        node = _find_node_in_mindmap(doc.root, args.node_id)
    elif doc_type == "derive":
        node = _find_node_in_derive(doc.nodes, args.node_id)
    else:
        node = _find_node_in_network(doc.nodes, args.node_id)

    if node is None:
        print(json.dumps({"ok": False, "error": f"Node not found: {args.node_id}"}))
        sys.exit(1)

    if node.codeMapping is None:
        print(json.dumps({"ok": False, "error": "Node has no code mapping to delete"}))
        sys.exit(1)

    node.codeMapping = None
    EXTENSION_SAVERS[doc_type](args.path, doc)
    print(json.dumps({"ok": True}))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/wangyan/Desktop/note && .venv/bin/python -m pytest skills/code-mapping/tests/test_delete_code_mapping.py -v`
Expected: 3 PASS

- [ ] **Step 5: Run all code-mapping tests together**

Run: `cd /Users/wangyan/Desktop/note && .venv/bin/python -m pytest skills/code-mapping/tests/ -v`
Expected: 7 PASS

- [ ] **Step 6: Commit**

```bash
git add skills/code-mapping/scripts/delete_code_mapping.py skills/code-mapping/tests/test_delete_code_mapping.py
git commit -m "feat: add delete_code_mapping script to code-mapping skill"
```

---

### Task 9: Register code-mapping tools in agent and server

**Files:**
- Create: `agent/tools/code_mapping_tools.py`
- Modify: `agent/server.py`

- [ ] **Step 1: Write code_mapping_tools.py**

```python
from .registry import ToolRegistry
from .mindmap_tools import _run_skill_script


def register_code_mapping_tools(registry: ToolRegistry):
    registry.register(
        name="set_code_mapping",
        description="Set a codeMapping on a node in any document (.mind.json, .derive.json, .net.json). Links the node to specific source code. Use this after creating a node with add_node/add_step/add_layer when the node corresponds to specific code.",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the document"},
                "node_id": {"type": "string", "description": "ID of the target node"},
                "raw": {"type": "string", "description": "Raw reference text, e.g. @ref(Repo#file.h#287)"},
                "function_name": {"type": "string", "description": "Function or class name in the code"},
                "file_path": {"type": "string", "description": "File path from repo root"},
                "start_line": {"type": "integer", "description": "Start line number"},
                "end_line": {"type": "integer", "description": "End line number"},
            },
            "required": ["path", "node_id", "raw", "function_name", "file_path", "start_line", "end_line"],
        },
        handler=lambda path, node_id, raw, function_name, file_path, start_line, end_line: _run_skill_script(
            "code-mapping/scripts/set_code_mapping.py",
            path, node_id,
            "--raw", raw,
            "--function-name", function_name,
            "--file-path", file_path,
            "--start-line", str(start_line),
            "--end-line", str(end_line),
        ),
    )

    registry.register(
        name="delete_code_mapping",
        description="Remove the codeMapping from a node in any document",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the document"},
                "node_id": {"type": "string", "description": "ID of the target node"},
            },
            "required": ["path", "node_id"],
        },
        handler=lambda path, node_id: _run_skill_script(
            "code-mapping/scripts/delete_code_mapping.py", path, node_id
        ),
    )
```

- [ ] **Step 2: Register in server.py**

Add import after the existing imports:
```python
from tools.code_mapping_tools import register_code_mapping_tools
```

Add the registration call after `register_file_search_tools(registry)`:
```python
    register_code_mapping_tools(registry)
```

- [ ] **Step 3: Verify server imports work**

Run: `cd /Users/wangyan/Desktop/note && .venv/bin/python -c "from agent.server import build_registry; r = build_registry(); print('Tools:', sorted(r.tools.keys()))"`
Expected: Output lists `delete_code_mapping`, `set_code_mapping`, plus all existing tools

- [ ] **Step 4: Commit**

```bash
git add agent/tools/code_mapping_tools.py agent/server.py
git commit -m "feat: register set_code_mapping and delete_code_mapping agent tools"
```

---

### Task 10: Add guidance hints to add_node/add_step/add_layer/add_block tool descriptions

**Files:**
- Modify: `agent/tools/mindmap_tools.py`
- Modify: `agent/tools/derive_tools.py`
- Modify: `agent/tools/network_tools.py`

- [ ] **Step 1: Update add_node description in mindmap_tools.py**

Change the `add_node` description from:
```
"Add a child node to a mind map node"
```
to:
```
"Add a child node to a mind map node. IMPORTANT: If this node represents specific code (a function, class, or file location), call set_code_mapping immediately after with the returned node id."
```

- [ ] **Step 2: Update add_step description in derive_tools.py**

Change the `add_step` description from:
```
"Add a step to a derivation tree"
```
to:
```
"Add a step to a derivation tree. IMPORTANT: If this step has corresponding source code, call set_code_mapping immediately after with the returned step id."
```

- [ ] **Step 3: Update add_layer description in network_tools.py**

Change the `add_layer` description from:
```
"Add a layer to a network graph"
```
to:
```
"Add a layer to a network graph. IMPORTANT: If this layer maps to specific code, call set_code_mapping immediately after with the returned node id."
```

- [ ] **Step 4: Register add_block tool in network_tools.py (currently missing)**

The `add_block` and `add_node_to_block` scripts exist but are not registered as agent tools. Add them to `register_network_tools`:

```python
    registry.register(
        name="add_block",
        description="Add a block node (container for sub-layers) to a network graph. IMPORTANT: If this block maps to specific code, call set_code_mapping immediately after with the returned node id.",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the .net.json file"},
                "name": {"type": "string", "description": "Block name"},
                "repeat": {"type": "integer", "description": "Repeat count (optional)"},
            },
            "required": ["path", "name"],
        },
        handler=lambda path, name, repeat=None: _add_block(path, name, repeat),
    )
```

And add the helper:
```python
def _add_block(path, name, repeat=None):
    args = ["network-graph/scripts/add_block.py", path, name]
    if repeat is not None:
        args.extend(["--repeat", str(repeat)])
    return _run_skill_script(*args)
```

- [ ] **Step 5: Commit**

```bash
git add agent/tools/mindmap_tools.py agent/tools/derive_tools.py agent/tools/network_tools.py
git commit -m "feat: add set_code_mapping hints to add_* tool descriptions, register add_block tool"
```

---

### Task 11: Run full test suite

- [ ] **Step 1: Run all skill tests**

```bash
cd /Users/wangyan/Desktop/note && .venv/bin/python -m pytest skills/ -v
```

Expected: All tests pass, including the new markdown and code-mapping tests.

- [ ] **Step 2: Run all agent tests**

```bash
cd /Users/wangyan/Desktop/note && .venv/bin/python -m pytest agent/tests/ -v
```

Expected: All existing tests pass.

- [ ] **Step 3: Verify tool listing**

```bash
cd /Users/wangyan/Desktop/note && .venv/bin/python -c "
from agent.server import build_registry
r = build_registry()
names = sorted(r.tools.keys())
expected = ['add_block','add_layer','add_node','add_step','append_section','create_derive',
            'create_md','create_mindmap','create_network','create_seq','delete_code_mapping',
            'delete_embed','delete_node','delete_ref','delete_step','insert_embed','insert_ref',
            'list_files','list_preset_layers','read_file','replace_diagram','replace_section',
            'search_files','search_in_files','set_code_mapping','update_node']
missing = [n for n in expected if n not in names]
extra = [n for n in names if n not in expected]
print(f'Tools: {len(names)}')
if missing: print(f'MISSING: {missing}')
if extra: print(f'EXTRA: {extra}')
if not missing and not extra: print('All expected tools present')
"
```
