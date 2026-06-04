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

### Note Embedding: `![[path]]`

Embed other notebook notes inline using wiki-link syntax on its own line:

```
![[relative/path/to/diagram.seq.mermaid]]
![[math/proof.derive.json]]
![[architecture/overview.mind.json]]
```

Supported embed targets: `.seq.mermaid`, `.derive.json`, `.mind.json`. The embedded content renders as a read-only preview within the markdown. Use embeds to compose documents that weave together diagrams, derivations, and mind maps.

### Code References: `@ref(repo:file:line:name)`

Link to specific code locations. The first segment is the repo (project directory basename), followed by file path, line number, and symbol name — all colon-separated and optional:

```
@ref(backend:src/utils.cpp:42:parse)
@ref(project-name:src/main.cpp:15)
@ref(server:lib/tokenizer.py:tokenize)
@ref(MyClass.getValue)
```

Resolution priority: repo+file+line+name → file+line+name → file+line → file+name → Class.method → name only. Without a repo prefix, scoped to the currently active repo. Unmatched refs render as plain text. Use `@ref()` to connect documentation to the actual implementation.

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/create_md.py <path> [--title]` | Create .md file with `# title` |
| `scripts/append_section.py <path> <heading> <content>` | Append `## heading` section (rejects duplicates) |
| `scripts/replace_section.py <path> <heading> <new-content>` | Replace content under a `## heading` |

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
