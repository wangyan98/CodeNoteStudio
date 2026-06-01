# Note Embedding in Markdown — Design Spec

## Context

Users can create three types of notes: `.md` (markdown), `.mind.json` (mind maps), and `.derive.json` (derivation trees). Currently there is no way to reference one note from within another — each note type lives in isolation. The user wants to embed derive and mind notes inside markdown notes, rendered in-place and read-only, so markdown can serve as a "composition document" that weaves together derivations, mind maps, and prose.

## Feature Summary

- In markdown files, use `![[relative/path/to/note.xxx.json]]` to embed another note
- Supported embed targets: `.derive.json`, `.mind.json` (not `.md`)
- Embedded content renders as a **full read-only view** using the existing renderer components
- Embedded content is **not editable** in the markdown context
- Clicking the embed header navigates to the source note for editing

## Syntax & Parsing

### Syntax

```
![[relative/path/to/note.derive.json]]
```

- Wiki-link style: `![[` ... `]]`
- Path is relative to the project's notes root directory
- Must be a block-level element (on its own line)
- Only `.derive.json` and `.mind.json` extensions are supported

### Parsing in renderMarkdown

In `MdEditor.tsx`'s `renderMarkdown()` function:

1. After fenced code block processing, before paragraph wrapping
2. Regex: `/^!\[\[([^\]]+)\]\]$/gm` — matches entire lines of `![[path]]`
3. Replace each match with an HTML placeholder:
   ```html
   <div class="note-embed-placeholder" data-note-path="math/theorem.derive.json" data-note-type="derive"></div>
   ```
4. The note type is inferred from the file extension
5. Unrecognized extensions → leave the text as-is (no embedding)

## Rendering Pipeline

### Phase 1: Placeholder Injection (string level)

`renderMarkdown()` converts markdown to HTML as before, with the additional step of replacing `![[...]]` lines with placeholder divs. The placeholders carry `data-note-path` and `data-note-type` attributes.

### Phase 2: Hydration (React level)

After the preview HTML is injected via `dangerouslySetInnerHTML`, a `useEffect` in `MdEditor` scans the DOM for `.note-embed-placeholder` elements and hydrates each one:

1. **Load**: Call `window.electronAPI.readNote(workspacePath, notePath)` to load the referenced note
2. **Error state**: If the note doesn't exist or fails to load, render an error card showing the path and error message
3. **Loading state**: Show a subtle loading indicator while the note is being fetched
4. **Render**: Use `createRoot` to render the appropriate read-only component into the placeholder div:
   - `derive` → `<DerivationRenderer document={...} />`
   - `mind` → `<MindMapRenderer document={...} />`
5. **Container**: Wrap the rendered content in a `.note-embed-container` div

### Embed Container

```
┌──────────────────────────────────────┐
│ 📐 derive  main-theorem              │  ← clickable header
│ math/theorem.derive.json             │
├──────────────────────────────────────┤
│ (1) Assumption                       │
│     E = mc²                         │  ← rendered content (read-only)
│                                      │
│ (2) Derivation                       │
│     ← derives from step 1           │
└──────────────────────────────────────┘
```

- Subtle border + rounded corners to visually distinguish from surrounding prose
- Header bar with type badge and note path (clickable → navigates to source)
- Content area renders the full read-only view

### Click Behavior

Clicking the embed header dispatches a note selection action to switch the NoteViewport to the source note, opening it in its native editor (DerivationEditor or MindMapEditor).

## Components Modified

| File | Change |
|------|--------|
| `src/renderer/src/components/editors/MdEditor.tsx` | Add embed parsing to `renderMarkdown`. Add `useEffect` for placeholder hydration. Add embed container styles in render. |
| `src/renderer/src/components/editors/MdEditor.css` | Add `.note-embed-container`, `.note-embed-header`, `.note-embed-placeholder` styles |
| `src/renderer/src/components/editors/DerivationRenderer.tsx` | Already exists — no changes needed, reused as-is |
| `src/renderer/src/components/editors/MindMapRenderer.tsx` | May need minor adjustments to work inside a fixed-width container (currently uses ResizeObserver on parent) |

## Edge Cases

- **Note not found**: Render error card with file path, do not block the rest of the preview
- **Nested embeds**: Not supported. If a derive note embeds another note, only the top-level embed is rendered in markdown context (the renderers don't render embedRefs anyway)
- **Circular embeds**: Not possible (embeds are read-only, no edit capability to create cycles)
- **Large mind maps**: MindMapRenderer already handles resize; the embed container should provide a minimum height and let the D3 tree scale
- **Live server / web mode**: The web API client would need a `readNote` endpoint (or reuse the existing `/api/notes/*` endpoint). The same hydration logic works in both Electron and web mode.

## Verification

1. Create a markdown note with `![[path/to/test.derive.json]]`
2. Enter preview mode — verify the derivation renders inline with steps and LaTeX
3. Click the embed header — verify it navigates to the derive note for editing
4. Test with a mind map embed — verify D3 tree renders in the embed container
5. Test error case: embed a non-existent file — verify error card renders without breaking preview
6. Run existing MD editor tests to verify no regressions
