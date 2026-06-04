---
name: derive-tree
description: Create and edit .derive.json derivation tree files. Use when: (1) Creating new derivation documents, (2) Adding derivation steps, (3) Linking steps with derivesFrom relationships, (4) Updating step content/code mappings, (5) Deleting steps. Triggers on .derive.json file operations.
---

# Derive Tree Skill

Operates on `.derive.json` files — flat list of steps with parent-child links via `derivesFrom` / `derivesTo`.

## Purpose

`.derive.json` is a notebook-specific file format for **mathematical formula derivation**. Each step contains a LaTeX formula (`content`), and steps are linked via `derivesFrom` to show how one formula is derived from another. The resulting tree represents the logical chain of reasoning — starting from assumptions/definitions and building up to the final result.

Typical use cases:
- Breaking down a complex equation derivation into intermediate steps
- Showing how a theorem follows from axioms and prior results
- Tracing the gradient computation graph through chain-rule applications

## Node Structure

```json
{
  "id": "uuid",
  "title": "Step title",
  "content": "Step content (LaTeX formula)",
  "stepNumber": 1,
  "derivesFrom": "parent-id or null",
  "derivesTo": ["child-id-1", "child-id-2"],
  "embedRefs": [],
  "codeMapping": null
}
```

Step numbers are auto-calculated. `derivesTo` is synced automatically.

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/create_derive.py <path>` | Create empty .derive.json |
| `scripts/add_step.py <path> [--after-step N] [--derives-from ID] [--title] [--content]` | Add step with optional parent link |
| `scripts/update_step.py <path> <step-id> (--title\|--content\|--code-mapping) <value>` | Update step fields |
| `scripts/delete_step.py <path> <step-id>` | Delete step, orphans children, renumbers |
| `scripts/set_derives_from.py <path> <step-id> <parent-id\|"null">` | Change parent with cycle detection |

### create_derive.py

```bash
python scripts/create_derive.py /path/to/file.derive.json
# => {"ok": true}
```

### add_step.py

```bash
python scripts/add_step.py file.derive.json --title "Chain Rule" --content "\frac{d}{dx}f(g(x)) = f'(g(x)) \cdot g'(x)"
python scripts/add_step.py file.derive.json --after-step 2 --derives-from <parent-id> --title "Apply Power Rule" --content "\frac{d}{dx}x^n = nx^{n-1}"
# => {"ok": true, "id": "uuid", "stepNumber": 3}
```

Insert position: `--after-step N` (after step number N, 0 = beginning). Default: append to end.

### set_derives_from.py

```bash
python scripts/set_derives_from.py file.derive.json <step-id> <parent-id>
python scripts/set_derives_from.py file.derive.json <step-id> null
# => {"ok": true}
```

Rejects self-links and cycles. Pass `"null"` as parent-id to make it a root node.
