# Rename Reference Update Design

When a note file (`.md`, `.mind.json`, `.derive.json`, `.seq.mermaid`, `.net.json`) is renamed or moved, automatically update `![[path]]` embeds and `[text](path)` markdown links in `.md` and `.mind.json` files that reference the old path.

## Scope

**Source files** (can be renamed): all 5 note types

**Target files** (scanned for references): `.md` and `.mind.json` only

**Reference types updated**:

| Target file type | Patterns matched |
|-----------------|------------------|
| `.md` | `![[oldPath]]` and `[text](oldPath)` |
| `.mind.json` | `![[oldPath]]` in node `title` and `content` fields (recursive tree walk) |

## Architecture

New module `src/main/services/update-references.ts`, single entry point:

```ts
export async function updateReferencesOnRename(
  projectPath: string,
  oldRelativePath: string,
  newRelativePath: string
): Promise<{ updated: number }>
```

Called from `renameNote()` in `note-service.ts` after `fs.rename()` and the existing ref-cache move:

```
renameNote()
  ├── fs.rename(old, new)
  ├── move .refs.json sidecar (existing)
  └── updateReferencesOnRename()  (NEW)
        ├── listNotes() → get all .md and .mind.json files in workspace
        ├── for each file, scan for oldRelativePath
        │     ├── .md → regex match ![[...]] and [...](...)
        │     └── .mind.json → recursive walk of node title/content
        └── rewrite files with matches
```

## Path Matching Rules

- **Exact match**: `oldRelativePath` equals the path in the reference literally
- **Relative path resolution**: when a reference uses a relative path (e.g., `../folder/file.md`), resolve it relative to the referencing file's directory before comparing with `oldRelativePath`
- **Note-type guard**: only replace when the referenced path's extension matches one of the 5 note types (`.md`, `.mind.json`, `.derive.json`, `.seq.mermaid`, `.net.json`)
- **Exclude self**: skip the file being renamed itself (no self-references to update)

## Replacement Rules

- `![[oldPath]]` → `![[newPath]]` (literal text replacement)
- `[text](oldPath)` → `[text](newPath)` (preserve label, replace path)

## Error Handling

- Scan failures (permissions, encoding) → skip file, continue
- Write failures → log error, continue
- If `renameNote()` succeeds (file is moved), reference update failures do not roll back the rename

## Testing

Unit tests in `tests/` using vitest:

1. `.md` file: `![[old/path.md]]` → `![[new/path.md]]`
2. `.md` file: `[label](old/path.md)` → `[label](new/path.md)`
3. `.mind.json` file: `![[old/path.md]]` in node title/content → updated
4. Relative path resolution: `../folder/old.md` → `../folder/new.md`
5. Non-note paths (`.png`, `.js`) are not modified
6. Renamed file itself is not scanned for self-references
