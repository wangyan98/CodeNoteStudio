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
