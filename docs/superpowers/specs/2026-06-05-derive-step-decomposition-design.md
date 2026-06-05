# Design: Derive Skill — Formula Decomposition with Multiple Steps

## Context

The `derive-tree` skill creates `.derive.json` files for step-by-step formula derivations. Steps form a DAG via `derivesFrom`/`derivesTo` relationships. The agent has tools (`create_derive`, `add_step`, `update_step`, `delete_step`, `set_derives_from`) that fully support multi-step, multi-file derivations.

**Problem**: The agent's system prompt gives no guidance on HOW to decompose formulas. Agents dump entire derivations into a single step's `content` field instead of breaking formulas into a tree of steps.

## Design

Modify `agent/context.py` to add a dedicated derivation guideline in `SYSTEM_TEMPLATE`.

### Change: Single file

**File**: `agent/context.py` — add a new guideline (~item 2.5 in Guidelines) for derivation decomposition.

### Guideline Content

```
2.5 **Formula derivation**: When creating derivation trees, follow these rules:
   - **Top-down decomposition**: When a formula has multiple terms (e.g., L = L_d + L_i + k),
     FIRST create a parent step with the full formula, THEN create one sibling step per term,
     each deriving from the parent via --derives-from.
   - **Sibling steps**: Terms of the same formula are siblings — they share the same derivesFrom
     parent. Do NOT chain them sequentially unless one term is literally derived from another.
   - **Title vs Content**: The `--title` field holds the derivation explanation/description.
     The `--content` field holds ONLY the LaTeX formula.
   - **Recursion stop conditions**: Stop decomposing when a term is:
     (a) a base constant/definition with no further decomposition, OR
     (b) maps to concrete code (function/variable) and has no further mathematical expansion.
     Otherwise, continue recursively: create a step for the sub-term and decompose it.
   - **Multiple files**: Create separate .derive.json files for unrelated formula topics
     (e.g., docs/output/lighting.derive.json vs docs/output/water.derive.json).

   Example — user asks "推导 L = L_d + L_i + k":
     create_derive("docs/output/lighting.derive.json")
     add_step(path, title="全局光照 = 直接光 + 间接光 + 环境光", content="L = L_d + L_i + k")
       → step id = "parent-1"
     add_step(path, title="直接光照项", content="L_d", derives_from="parent-1")
     add_step(path, title="间接光照项", content="L_i", derives_from="parent-1")
     add_step(path, title="环境光常数项", content="k", derives_from="parent-1")
     # L_d might further decompose, L_i might further decompose, k is a constant → stop.
```

### Current Text (for reference)

```
- **Derivation trees**: create_derive, add_step, update_step, delete_step, set_derives_from — create .derive.json documents for step-by-step derivations
```

This single line will be replaced with the guideline above.

## Non-Goals

- No new tools or scripts — existing `add_step` with `--derives-from` is sufficient
- No batch creation tool — can revisit if agent call overhead proves excessive
- No change to the derive data model or UI components

## Testing

- Manual: ask agent to derive a multi-term formula, verify it creates multiple steps with correct `derivesFrom` relationships
- Existing tests in `skills/derive-tree/tests/` remain valid as tool behavior is unchanged
