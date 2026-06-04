# Workspace Switch Stale Data Fix (2026-06-04)

## Symptom

When using "Open Workspace" to switch from workspace A to workspace B, the note viewport, code viewport, and code directory still displayed files from the previous workspace A.

## Root Cause

Two issues:

### 1. `codeRepos` not cleared in `RESET_WORKSPACE_STATE`

`AppContext.tsx` — the reset action cleared `codeRepoPath` but not `codeRepos`, so the old workspace's repo list remained in context state during the switch.

### 2. `saveUiState` race condition

The save effect in `WorkspaceToolbar.tsx` debounces UI state persistence by 500ms. During a workspace switch:

1. `RESET_WORKSPACE_STATE` fires — state resets, but `workspacePath` still points to the old workspace. Save timer starts (500ms).
2. `openWorkspace(newPath)` — main process sets `currentProjectPath = newPath`.
3. If the save timer fires **during** step 2, `saveUiState` was called using `currentProjectPath!` in the main process, which is now the **new** workspace. This wrote empty reset state to the new workspace's `ui-state.json`, corrupting it.
4. When `restoreUiState()` later loaded that file, it got null/empty and skipped session restoration.

## Fix

- **`codeRepos: []`** added to `RESET_WORKSPACE_STATE` reducer
- **`saveUiState`** now receives `workspacePath` as an explicit parameter from the renderer, captured at the time the debounce timer is set. This ensures the save always targets the correct workspace regardless of `currentProjectPath` state in the main process.

## Files Changed

| File | Change |
|---|---|
| `src/renderer/src/contexts/AppContext.tsx` | Added `codeRepos: []` to `RESET_WORKSPACE_STATE` |
| `src/main/ipc-handlers.ts` | `ui-state:save` handler accepts `workspacePath` param instead of using `currentProjectPath!` |
| `src/preload/index.ts` | `saveUiState` passes `workspacePath` as first arg |
| `src/renderer/src/types/electron.d.ts` | Updated `saveUiState` type signature |
| `src/renderer/src/components/WorkspaceToolbar.tsx` | Save effect captures `workspacePath` in local variable and passes it explicitly; removed auto symbol indexing on open |
