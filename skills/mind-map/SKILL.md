---
name: mind-map
description: Create and edit .mind.json mind map files in the notebook app. Use when: (1) Creating new mind maps, (2) Adding nodes to a mind map tree, (3) Updating node titles/content/code mappings, (4) Deleting nodes. Triggers on .mind.json file operations.
---

# Mind Map Skill

Operates on `.mind.json` files — tree-structured documents with a root node and recursive children.

## Node Structure

```json
{
  "id": "uuid",
  "title": "Node title",
  "content": "Markdown content",
  "children": [...],
  "codeMapping": { "raw": "...", "functionName": "...", "filePath": "...", "startLine": 1, "endLine": 10 }
}
```

`codeMapping` is optional. When set, it links the node to a specific code location.

## Scripts

All scripts print JSON to stdout: `{"ok": true, ...}` on success or `{"ok": false, "error": "..."}` on failure.

| Script | Purpose |
|--------|---------|
| `scripts/create_mindmap.py <path>` | Create a new .mind.json with a root node |
| `scripts/add_node.py <path> <parent-id> [--title] [--content]` | Add a child node, prints new node ID |
| `scripts/update_node.py <path> <node-id> (--title\|--content\|--code-mapping) <value>` | Set fields on a node |
| `scripts/delete_node.py <path> <node-id>` | Delete a node and its subtree |

### create_mindmap.py

```bash
python scripts/create_mindmap.py /path/to/file.mind.json
# => {"ok": true, "id": "uuid-of-root"}
```

Idempotent: does nothing if a valid .mind.json already exists.

### add_node.py

```bash
python scripts/add_node.py file.mind.json <parent-id> --title "Functions" --content "## Overview"
# => {"ok": true, "id": "uuid-of-new-node"}
```

Searches the entire tree recursively for the parent node by ID.

### update_node.py

```bash
python scripts/update_node.py file.mind.json <node-id> --title "New Title"
python scripts/update_node.py file.mind.json <node-id> --code-mapping '{"raw":"def foo():","functionName":"foo","filePath":"a.py","startLine":1,"endLine":3}'
```

At least one of `--title`, `--content`, `--code-mapping` must be provided.

### delete_node.py

```bash
python scripts/delete_node.py file.mind.json <node-id>
# => {"ok": true}
```

Removes the node and all descendants. If the root is deleted, replaces with a fresh empty root.
