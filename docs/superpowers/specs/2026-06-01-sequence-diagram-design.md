# Sequence Diagram (.seq.mermaid) — Design Spec

## Summary

Add a new `.seq.mermaid` file type for sequence diagrams using Mermaid.js syntax. Files are standalone (with a dedicated split-view editor) and embeddable in `.md` notes via `![[path/to/diagram.seq.mermaid]]` wiki-link syntax.

## File type

- Extension: `.seq.mermaid`
- Content: plain text (Mermaid sequence diagram syntax)
- Storage: `readTextFile` / `writeTextFile` — same path as `.md`
- `NoteType`: `'seq'`

## Schema

No JSON schema. Plain text, like `.md`. A Mermaid sequence diagram example:

```
sequenceDiagram
    Alice->>Bob: Hello Bob!
    Bob->>Alice: Hi Alice!
```

## Changes — Main Process

### `src/main/types.ts`
- Add `'seq'` to `NoteFileType` union

### `src/main/services/note-service.ts`
- `getNoteType()`: add `.seq.mermaid` → `'seq'`
- `createNote()`: `case 'seq'` writes a default template string
- `readNote()`: `.seq.mermaid` reads as text (falls through to `readTextFile`)
- No schema validation needed (plain text)

## Changes — Renderer

### `src/renderer/src/types/index.ts`
- Add `'seq'` to `NoteType` union

### `src/renderer/src/components/NoteDirectory.tsx`
- Icon: `'seq'` → a sequence-specific emoji
- Filter: add `{ label: 'Seq', value: 'seq' }`
- `typeOptions`: add `{ label: '.seq.mermaid', value: 'seq', suffix: '.seq.mermaid' }`

### `src/renderer/src/components/NoteViewport.tsx`
- Import `SequenceEditor`
- `case 'seq'`: render `<SequenceEditor>` with content as string
- `typeLabels` add `seq: 'Seq'`

### `src/renderer/src/components/editors/MdEditor.tsx`
- `inferEmbedType()`: add `.seq.mermaid` → `'seq'`
- Embed rendering: add `'seq'` case that reads file and renders a `SequenceDiagramViewer`

### `src/renderer/src/components/editors/EmbedCard.tsx`
- Add `seq: 'Sequence Diagram'` to `typeLabels`

## New Files

### `src/renderer/src/components/editors/SequenceEditor.tsx`
- Vertical split: Monaco editor (top) + Mermaid SVG preview (bottom)
- Resizable divider between panels
- Auto-save with 300ms debounce, Ctrl+S immediate save
- Save status indicator
- Pattern follows MindMapEditor / DerivationEditor conventions

### `src/renderer/src/components/editors/SequenceEditor.css`
- Split layout styling
- Preview container with horizontal scroll for wide diagrams

### `src/renderer/src/components/editors/SequenceDiagramViewer.tsx`
- Read-only component for MD embed rendering
- Takes file content as prop, renders with Mermaid.js
- Error boundary for invalid syntax

## New Dependency

- `mermaid` (npm) — MIT license, used for `sequenceDiagram` rendering to SVG

## Error handling

- Invalid Mermaid syntax: show error message in preview panel instead of crashing
- Missing embedded file: show "Failed to load" placeholder in MD preview
