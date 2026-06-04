---
name: derive-tree
description: Create and edit .derive.json derivation tree files. Use when: (1) Creating new derivation documents, (2) Adding derivation steps, (3) Linking steps with derivesFrom relationships, (4) Updating step content/code mappings, (5) Deleting steps. Triggers on .derive.json file operations.
---

# Derive Tree Skill

Operates on `.derive.json` files — flat list of steps with parent-child links via `derivesFrom` / `derivesTo`.

## Node Structure

```json
{
  "id": "uuid",
  "title": "Step title",
  "content": "Step content (markdown)",
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
python scripts/add_step.py file.derive.json --title "Step 1" --content "## Heading"
python scripts/add_step.py file.derive.json --after-step 2 --derives-from <parent-id> --title "Child Step"
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
