# Code Summary Agent Skills — Fixes

**Date**: 2026-06-04

## Issues Fixed

### 1. seq.mermaid skill was missing

The code-summary agent skills covered `.mind.json`, `.derive.json`, `.net.json`, and `.md`, but had no skill for `.seq.mermaid` sequence diagrams. The agent couldn't auto-summarize call chains or message flows into sequence diagrams.

**Fix**: Created `skills/seq-mermaid/` with:
- `SKILL.md` — format docs, script reference, `@ref()` conventions
- `create_seq.py` — creates `.seq.mermaid` with default template
- `append_participant.py` — adds participant declarations
- `append_message.py` — appends message arrows (4 types: solid/dashed/x/async)
- `replace_diagram.py` — bulk content replacement
- 23 tests covering all scripts + integration workflow

### 2. Serial comma consistency

All 4 existing skill `description` frontmatter fields used "Use when: (1) ... (2) ... (3)" without a serial comma before the final item. Updated to consistently include the comma before "and" in compound lists.

### 3. Markdown SKILL.md missing cross-reference guidance

The markdown skill didn't document `![[file]]` embed syntax or `@ref()` code reference syntax — critical notebook features for linking markdown to other notes and source code.

**Fix**: Added **Cross-References** section covering:
- `![[path]]` — wiki-link embeds for `.seq.mermaid`, `.derive.json`, `.mind.json`
- `@ref(repo#file#line#name)` — `#`-delimited code references, repo is project dir basename

### 4. @ref separator: `#` not `:`

Initially documented `@ref()` with `:` as the separator, but `:` conflicts with file paths (e.g., `C:\...`). The actual format uses `#`: `@ref(repo#path#line#name)`.

### 5. @ref placement conventions for seq.mermaid

`@ref()` in sequence diagrams serves two distinct purposes:
- **Participant declarations** → references **classes/types**: `participant @ref(Nilou-main#Engine/.../Array.h#287#alignas) as Array`
- **Message text after `:`** → references **functions/methods**: `App->>Array: Emplace@ref(Nilou-main#Engine/.../Array.h#48#Emplace)`

## Commits

| Commit | Description |
|--------|-------------|
| `51004fd` | feat(seq-mermaid): add seq-mermaid skill with cross-reference docs for markdown |
| `a5a81e3` | fix(docs): use # as @ref separator instead of : |
| `8013b59` | docs: rewrite @ref examples with real-world paths and seq participant/message conventions |
