# Reorder-to-Reparent Transition Bug Fix (2026-06-04)

## Symptom

When dragging node A from above towards sibling node B:

1. **Connection line disappears:** As A gets very close to B, the parent→B connection line visually disconnects.
2. **B jumps above A:** When A finally overlaps B, B teleports upward, making it impossible to reparent A under B from above (only possible from below).

## Root Cause

In the `.on('drag')` handler, the condition guarding `clearDragHighlight()` was:

```typescript
if (dragTargetNodeId) {
  clearDragHighlight()
  // ... re-apply dragged node positions
}
```

For `'reorder'` actions, `dragTargetNodeId` is **never set** — only `dragTargetAction` and `dragInsertIndex` are assigned. This meant:

- **Tick N** (reorder detected): `shiftSiblingsForInsert()` shifts sibling B and B's lines down by 32px. `dragTargetNodeId` stays `null`.
- **Tick N+1**: `if (dragTargetNodeId)` is `false` → `clearDragHighlight()` is skipped. B and B's lines remain at the shifted position.
- The parent's vertical line recalculation (lines 1043–1070) only accounts for the dragged node's `dy`, not for siblings shifted by `shiftSiblingsForInsert()`. The vertical line span doesn't reach B's shifted position → B's connection appears broken.
- When the user drags A far enough to finally overlap the shifted B, reparent is detected (`dragTargetNodeId = B`). On the next tick, `clearDragHighlight()` finally runs, snapping B back to its original position (32px upward) — the visible "jump."

## Fix

Changed the `clearDragHighlight()` guard to also trigger when the previous action was reorder:

```typescript
// Before:
if (dragTargetNodeId) {

// After:
if (dragTargetNodeId || dragTargetAction) {
```

This ensures siblings shifted by `shiftSiblingsForInsert()` are reset to their original positions at the start of every drag tick, preventing position drift and allowing smooth reorder→reparent transitions.

**Files changed:** `src/renderer/src/components/editors/MindMapCanvas.tsx` (line 1004)
