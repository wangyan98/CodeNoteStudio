# Derive Step Decomposition — Agent Prompt Enhancement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the agent's system prompt so it decomposes formulas top-down into multiple derivation steps instead of dumping everything into one step.

**Architecture:** Single-file change — replace the one-line "Derivation trees" description in `SYSTEM_TEMPLATE` (in `agent/context.py`) with a detailed guideline that teaches the agent to decompose formulas into sibling steps with proper title/content separation, recursion stop conditions, and multi-file management.

**Tech Stack:** Python string template (no new dependencies)

---

### Task 1: Add derivation decomposition guideline to agent system prompt

**Files:**
- Modify: `agent/context.py:11`

- [ ] **Step 1: Replace the derivation trees line in SYSTEM_TEMPLATE**

In `agent/context.py`, replace line 11:

```python
    - **Derivation trees**: create_derive, add_step, update_step, delete_step, set_derives_from — create .derive.json documents for step-by-step derivations
```

with the expanded guideline:

```python
    - **Derivation trees**: create_derive, add_step, update_step, delete_step, set_derives_from — create .derive.json documents for step-by-step derivations.
      When creating derivation trees, follow these rules:
      * **Top-down decomposition**: When a formula has multiple terms (e.g., L = L_d + L_i + k),
        FIRST create a parent step with the full formula, THEN create one sibling step per term,
        each deriving from the parent via --derives-from.
      * **Sibling steps for parallel terms**: Terms of the same formula are siblings — they share the
        same derivesFrom parent. Do NOT chain them sequentially unless one term is literally derived
        from another.
      * **Title vs Content**: The `--title` field holds the derivation explanation/description.
        The `--content` field holds ONLY the LaTeX formula.
      * **Recursion stop conditions**: Stop decomposing when a term is:
        (a) a base constant/definition with no further mathematical expansion, OR
        (b) maps to concrete code (function/variable) and has no further expansion.
        Otherwise continue: create a step for the sub-term and check if it can decompose further.
      * **Multiple files**: Create separate .derive.json files for unrelated formula topics
        (e.g., docs/output/lighting.derive.json vs docs/output/water.derive.json).

      Example — user asks "推导 L = L_d + L_i + k":
        create_derive("docs/output/lighting.derive.json")
        add_step(path, title="全局光照 = 直接光 + 间接光 + 环境光", content="L = L_d + L_i + k")
          → let parent_id = returned step id
        add_step(path, title="直接光照项", content="L_d", derives_from=parent_id)
        add_step(path, title="间接光照项", content="L_i", derives_from=parent_id)
        add_step(path, title="环境光常数项", content="k", derives_from=parent_id)
        # L_d and L_i may decompose further; k is a constant → stop.
```

- [ ] **Step 2: Verify the file is valid Python syntax**

```bash
python3 -c "import ast; ast.parse(open('agent/context.py').read()); print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Verify the template renders without errors**

```bash
python3 -c "
from agent.context import build_system_message
msg = build_system_message('/tmp/test', ['/some/repo'], '/tmp/out')
assert 'L = L_d + L_i + k' in msg
assert 'sibling' in msg
assert 'derives_from' in msg
print('OK')
"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add agent/context.py
git commit -m "$(cat <<'EOF'
feat(agent): add formula decomposition guideline to derive tree prompt

Teach the agent to decompose formulas top-down into multiple sibling
steps with derivesFrom relationships, rather than dumping all formulas
into a single step's content field.
EOF
)"
```
