# Bug Fix Summary — 2026-06-03 (Session 2)

## Fix 1: net.json embed rendering mismatch (f7c6073)

**Problem:** `net.json` rendered in markdown embeds looked completely different from the editor. The embed used a flat HTML list that ignored graph edges, skip connections, and layout — it just showed nodes in topological order with `↓` between each.

**Root cause:** `NetworkEmbedViewer` had a separate HTML-based renderer that didn't share any code with `NetworkCanvas` (D3 + dagre SVG).

**Fix:** Added `readOnly` prop to `NetworkCanvas` (hides port dots, disables drag-connect/selection/drop). `NetworkEmbedViewer` now renders `<NetworkCanvas readOnly>` for v2 docs instead of the HTML list. This guarantees embed rendering stays in sync with the editor automatically.

**Files:** `NetworkCanvas.tsx`, `NetworkEmbedViewer.tsx`, `MdEditor.tsx`, `NoteViewport.tsx`

## Fix 2: derive.json missing code navigation (10dad6d)

**Problems:**

1. **No jump icon on DAG diagrams** — `onNavigateToCode` was passed to `DerivationEditor` but never wired to any visible UI element.
2. **CodeMappingField hidden behind click** — the field only appeared after clicking a step to select it, making it undiscoverable.
3. **SymbolPicker scope broken** — `CodeMappingField` didn't pass `activeFilePath` to `SymbolPicker`, so `local` scope always showed all symbols regardless of which file was open in CodeViewport.

**Root cause:** The implementation plan (Task 6) added the `CodeMappingField` behind a toggle and never connected `onNavigateToCode` to the DAG visualization.

**Fix:**
- Always show `CodeMappingField` on every step card (removed `selectedStepId` gate)
- Added `→` jump icon to DAG pills (`MiniDagTree`/`KatexMiniPill` in editor, `DerivationDagViewer`/`DagPill` in embeds) that navigates to code on click
- `CodeMappingField` now reads active file from `AppContext` and passes it to `SymbolPicker` so local-scope filtering works against the currently open file
- Added missing `DerivationDocument` import in `MdEditor`

**Files:** `DerivationEditor.tsx`, `DerivationDagViewer.tsx`, `DerivationDagViewer.css`, `CodeMappingField.tsx`, `MdEditor.tsx`
