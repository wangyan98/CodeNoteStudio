# Ref Navigation Reveal in File Tree Design

## Overview

When code navigation is triggered (ref click, CodeMappings panel, SymbolPicker, etc.), the Code Directory file tree should automatically switch to the target file's repository and reveal its location.

Currently `navigateToCode` only opens the file in the Code Viewport and scrolls to the target line. The "Reveal in File Tree" mechanism already exists (commit `3a94905`) but is only triggered manually via the tab context menu.

## Data Flow

```
navigateToCode(filePath, startLine)
  ├── Determine repo for filePath → dispatch SET_CODE_REPO (if different)
  ├── dispatch REVEAL_FILE_IN_TREE
  ├── dispatch OPEN_CODE_FILE
  └── dispatch SET_PENDING_SCROLL

CodeDirectory
  ├── useEffect(codeRepoPath) → reload file list (if repo switched)
  └── useEffect(revealFilePath, loading)
        → skip if loading, retry after files load
        → scroll + highlight → CLEAR
```

## Changes

### 1. `src/renderer/src/hooks/useCodeNavigation.ts`

- Extract `codeRepos` and `codeRepoPath` from context
- Before dispatching `OPEN_CODE_FILE`, match `filePath` against `codeRepos` to find the owning repository
- If the repo differs from current `codeRepoPath`, dispatch `SET_CODE_REPO` to switch
- Dispatch `REVEAL_FILE_IN_TREE` with the absolute `filePath`

### 2. `src/renderer/src/components/CodeDirectory.tsx`

- In the `revealFilePath` useEffect: return early when `loading` is true, do not clear reveal state
- Add `loading` to the effect's dependency array so it re-fires after files load

## Edge Cases

| Scenario | Behavior |
|---|---|
| File in current repo | Reveal directly, no repo switch |
| File in different repo | Switch repo → load files → reveal |
| File not in any known repo | No repo switch, reveal attempt silently no-ops |
| No repo loaded (codeRepoPath is null) | Silent no-op |
| Rapid successive navigations | Each REVEAL_FILE_IN_TREE overwrites the previous |
