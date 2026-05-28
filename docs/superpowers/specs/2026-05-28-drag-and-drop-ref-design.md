# Drag-and-Drop @ref Creation

**Date:** 2026-05-28
**Status:** approved

## Summary

Enhance Code Viewport and Code Directory to support drag-and-drop into Note Viewport
for creating `@ref()` references, markdown file links, and image embeds. Eliminates
the need to open SymbolPicker or manually type `@ref(...)` — double-click a function
name, drag to Note Viewport, done.

## User Decisions

- **Double-click selection:** inline highlight + direct drag (option C)
- **File reference format:** standard markdown link `[name](relative/path)` (option B)
- **Image reference format:** copy to `assets/` dir, insert relative path (option C)
- **Implementation approach:** lightweight HTML5 DnD, no custom drag context (approach A)

## Three Drag Flows

| Flow | Source | Trigger | Result |
|------|--------|---------|--------|
| Symbol | Code Viewport | Double-click to select, then drag | `@ref(rel/path:line:name)` |
| File | Code Directory | Drag file item | `[filename](relative/path)` |
| Image | Code Directory | Drag image item | `![filename](./assets/filename)` |

## Data Flow

### Symbol Drag from Code Viewport

```
User double-clicks function name in read-only Monaco editor
  → Monaco onMouseDown (detail===2)
  → getWordAtPosition() → identifier
  → IPC querySymbols(identifier, activeFilePath)
  → match found → apply Monaco decoration (highlight)
  → store CodeSymbol in useRef
  → set dragEnabled = true

User drags from highlighted area
  → dragstart: dataTransfer "text/plain" = "@ref(relPath:line:displayName)"

Drop on NoteViewport
  → onDrop reads text from dataTransfer
  → MdEditor.insertAtPosition(text, clientX, clientY)
  → Monaco getTargetAtClientPoint(x, y) → position
  → editor.executeEdits() inserts text
```

### File Drag from Code Directory

```
User drags file from tree
  → dragstart: "text/plain" = "[name](relPath)"

Drop on NoteViewport
  → insertAtPosition("[name](relPath)", x, y)
```

### Image Drag from Code Directory

```
User drags image from tree
  → dragstart: dataTransfer includes { filePath, isImage: true }

Drop on NoteViewport
  → IPC copyFileToAssets(sourcePath, workspacePath)
  → returns { relativePath: "./assets/img.png" }
  → insertAtPosition("![img](./assets/img.png)", x, y)
  → on IPC failure: fallback to absolute path
```

## Component Changes

### CodeViewport.tsx

- New refs: `selectedSymbol` (CodeSymbol | null), `decorationIds` (string[])
- New state: `dragEnabled` (boolean)
- `handleEditorMount`: attach Monaco `onMouseDown` listener
  - Check `event.detail === 2` for double-click
  - `model.getWordAtPosition(position)` for identifier
  - `querySymbols(identifier, activeFilePath)` for matching symbols
  - If match: apply inline decoration with CSS class `ref-drag-highlight`,
    store symbol, set `dragEnabled = true`
  - Click elsewhere: clear decoration, clear symbol, `dragEnabled = false`
- Editor container: `draggable={dragEnabled}`, `onDragStart` builds `@ref(...)` text
- New CSS: `.ref-drag-highlight { background: rgba(100,180,255,0.3); border-radius: 2px; cursor: grab; }`

### CodeDirectory.tsx

- `FileTreeItem`: add `draggable="true"` and `onDragStart` for non-directory files
- `onDragStart`: set `text/plain` with appropriate format
  - Images: include `isImage` and `sourcePath` via custom data
  - Other files: `[name](relPath)` as plain text
- `effectAllowed = 'copy'`

### MdEditor.tsx

- Extend `MdEditorHandle` with `insertAtPosition(text, clientX, clientY)`
- Implementation: `editor.getTargetAtClientPoint(x, y)` → `editor.executeEdits()`
- Falls back to `insertAtCursor` if `getTargetAtClientPoint` returns null

### NoteViewport.tsx

- `onDragOver` on container: `preventDefault()` + `dropEffect = 'copy'`
- `onDrop`: read dataTransfer, call `insertAtPosition`
- For images: await `copyFileToAssets` before insert

### Main Process

- New IPC handler `code:copy-file-to-assets`
  - Input: `{ sourcePath: string, workspacePath: string }`
  - Output: `{ relativePath: string }` or `{ error: string }`
  - Copies to `<workspacePath>/assets/`, creates dir if needed
  - Deduplicates: `icon.png` → `icon-1.png` if exists

### Preload

- Expose `copyFileToAssets(sourcePath: string): Promise<{ relativePath: string }>`

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Double-click on unresolvable identifier | `querySymbols` returns [] → no highlight, no drag |
| Drag without prior double-click | `draggable="false"` → browser prevents drag |
| Drop outside editor area | `getTargetAtClientPoint` returns null → fall back to cursor position |
| Image copy fails | Catch in IPC → return error → fallback: insert absolute path |
| Duplicate image filename | IPC deduplicates with numeric suffix |
| Undo after drop | Monaco's native undo stack covers `executeEdits` |

## Testing

### Manual Tests

1. Double-click function name → highlight appears
2. Double-click keyword (`function`, `return`) → no highlight
3. Drag highlighted symbol to Note Viewport → `@ref(...)` at drop position
4. Drag `.ts` file from Code Directory → `[file.ts](path/file.ts)` inserted
5. Drag `.png` file from Code Directory → image copied, `![img](./assets/img.png)` inserted
6. Ctrl+Z undo after drop works
7. Click elsewhere after selection → highlight clears

### IPC Unit Test

- `copy-file-to-assets`: copy success, dedup logic, permission error fallback
