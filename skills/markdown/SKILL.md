---
name: markdown
description: Create and edit .md markdown files with heading-based section manipulation — used in the notebook app for structured project documentation. Use when: (1) Creating new markdown documents, (2) Appending new sections with deduplication, (3) Replacing section content. Triggers on .md file operations in the notebook.
---

# Markdown Skill

Operates on `.md` files — plain text markdown documents with `##` heading sections.

## Purpose

`.md` files in the notebook serve as structured project documentation — architecture write-ups, training logs, model cards, and experiment notes. The heading-based section model (`## heading`) enables programmatic section management: append new sections with duplicate detection, and replace existing sections without touching the rest of the document.

## Cross-References

`.md` files in the notebook support two cross-reference syntaxes for linking to other notes and code.

### Note Embedding

Embed other notebook notes inline. Paths are **relative to the workspace root** (the notes directory), not relative to the current `.md` file.

For `.md` files, use standard markdown link syntax:

```
[fft_ocean_cpp.md](fft_ocean_cpp.md)
[architecture/overview.md](architecture/overview.md)
```

For other notebook file types, use `![[path]]` syntax:

```
![[diagrams/flow.seq.mermaid]]
![[math/proof.derive.json]]
![[architecture/overview.mind.json]]
```

Supported embed targets: `.seq.mermaid`, `.derive.json`, `.mind.json`, `.net.json`, `.md`. The embedded content renders as a read-only preview within the markdown. Use embeds to compose documents that weave together diagrams, derivations, and mind maps.

### Code References: `@ref(repo#file#line#name)`

Link to specific code locations with `#`-separated segments (all optional):

```
@ref(Nilou-main#Engine/Source/Runtime/Core/Public/Containers/Array.h#287#alignas)
@ref(Nilou-main#Engine/Source/Runtime/Core/Public/Math/Vector.h#32#FVector)
@ref(MyClass.getValue)
```

The `#` delimiter avoids conflicts with `:` in file paths. Resolution priority: repo+file+line+name → file+line+name → file+line → file+name → Class.method → name only. Without a repo prefix, scoped to the currently active repo. Unmatched refs render as plain text. Use `@ref()` to connect documentation to the actual implementation.

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/create_md.py <path> [--title]` | Create .md file with `# title` |
| `scripts/append_section.py <path> <heading> <content>` | Append `## heading` section (rejects duplicates) |
| `scripts/replace_section.py <path> <heading> <new-content>` | Replace content under a `## heading` |
| `scripts/insert_embed.py <path> <embed_path>` | Insert `[embed_path](embed_path)` for .md files, `![[embed_path]]` for other types (rejects duplicates) |
| `scripts/delete_embed.py <path> <embed_path>` | Remove matching embed line |
| `scripts/insert_ref.py <path> <ref>` | Insert `@ref(ref)` line (rejects duplicates) |
| `scripts/delete_ref.py <path> <ref>` | Remove matching `@ref(ref)` line |

### create_md.py

```bash
python scripts/create_md.py /path/to/doc.md --title "Architecture Overview"
# => {"ok": true}
```

### append_section.py

```bash
python scripts/append_section.py doc.md "Layers" "- Conv2d: 64@7x7\n- BatchNorm\n- ReLU"
# => {"ok": true}
```

Rejects if a section with the same heading already exists. Use `replace_section.py` to update.

### replace_section.py

```bash
python scripts/replace_section.py doc.md "Layers" "- Conv2d: 128@3x3\n- MaxPool"
# => {"ok": true}
```

Matches `## heading` exactly, replaces content up to the next `##` or EOF.

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
