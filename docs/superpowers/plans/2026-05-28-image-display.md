# Image Display in Code Viewport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render PNG/JPG/GIF/WebP/BMP image files in Code Viewport with click-to-zoom overlay.

**Architecture:** Main process reads image files as base64 via a new IPC handler. CodeViewport detects image extensions and renders `<img>` tags with data URIs instead of Monaco Editor. A fullscreen overlay provides scroll-wheel zoom on click.

**Tech Stack:** Electron IPC, React + TypeScript, CSS transforms

---

### Task 1: Add readBinaryFile to file-system service

**Files:**
- Modify: `src/main/services/file-system.ts`

- [ ] **Step 1: Add readBinaryFile function**

Append after the `readTextFile` function at line 16:

```typescript
export async function readBinaryFile(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath)
  return buffer.toString('base64')
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/main/services/file-system.ts
git commit -m "feat: add readBinaryFile for base64 image loading"
```

---

### Task 2: Add IPC handler for binary file reading

**Files:**
- Modify: `src/main/ipc-handlers.ts`

- [ ] **Step 1: Register code:read-binary-file handler**

Insert after the `code:read-file` handler (around line 119):

```typescript
  ipcMain.handle('code:read-binary-file', async (_event, absolutePath: string) => {
    const { readBinaryFile } = await import('./services/file-system')
    return readBinaryFile(absolutePath)
  })
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (preload/index.ts may show an error until Task 3 — that's expected)

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc-handlers.ts
git commit -m "feat: add code:read-binary-file IPC handler"
```

---

### Task 3: Expose readBinaryFile in preload and type declarations

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/types/electron.d.ts`

- [ ] **Step 1: Add to preload API object**

In `src/preload/index.ts`, add after `readCodeFile` (around line 35):

```typescript
  readBinaryFile: (absolutePath: string) => ipcRenderer.invoke('code:read-binary-file', absolutePath),
```

- [ ] **Step 2: Add type declaration**

In `src/renderer/src/types/electron.d.ts`, add after `readCodeFile` type (around line 29):

```typescript
      readBinaryFile: (absolutePath: string) => Promise<string>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/renderer/src/types/electron.d.ts
git commit -m "feat: expose readBinaryFile to renderer via preload"
```

---

### Task 4: Add image rendering and zoom overlay to CodeViewport

**Files:**
- Modify: `src/renderer/src/components/CodeViewport.tsx`
- Modify: `src/renderer/src/components/CodeViewport.css`

- [ ] **Step 1: Add image constants and helpers**

Add at the top of `CodeViewport.tsx`, after the imports (after line 7):

```typescript
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'])

const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
}

function getImageExt(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() || ''
}

function isImageFile(filePath: string): boolean {
  return IMAGE_EXTS.has(getImageExt(filePath))
}

function getMimeType(filePath: string): string {
  return MIME_MAP[getImageExt(filePath)] || 'image/png'
}
```

- [ ] **Step 2: Add zoom state**

Add after `editorRef` (after line 15):

```typescript
  const [zoomedImage, setZoomedImage] = useState<string | null>(null)
  const [zoomLevel, setZoomLevel] = useState(1)
```

- [ ] **Step 3: Modify loadFileContent to handle images**

Replace the `loadFileContent` callback (lines 41-49) with:

```typescript
  const loadFileContent = useCallback(async (filePath: string) => {
    if (fileContents.has(filePath)) return
    try {
      const img = isImageFile(filePath)
      const content = img
        ? await window.electronAPI.readBinaryFile(filePath)
        : await window.electronAPI.readCodeFile(filePath)
      setFileContents((prev) => new Map(prev).set(filePath, content))
    } catch {
      setFileContents((prev) => new Map(prev).set(filePath, '// Error loading file'))
    }
  }, [fileContents])
```

- [ ] **Step 4: Add zoom overlay keyboard handler**

Add after the existing `handleEditorMount` callback (after line 72):

```typescript
  useEffect(() => {
    if (!zoomedImage) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setZoomedImage(null)
        setZoomLevel(1)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [zoomedImage])
```

- [ ] **Step 5: Add image rendering in the editor area**

Replace the editor container section (lines 154-177, the `<div className="code-editor-container">` block) with:

```tsx
        {/* Editor or Image */}
        <div className="code-editor-container">
          {contentLoaded && activeFile && isImageFile(activeFile.path) ? (
            <div className="image-container">
              <img
                src={`data:${getMimeType(activeFile.path)};base64,${content || ''}`}
                alt={activeFile.name}
                className="image-preview"
                onClick={() => setZoomedImage(content || '')}
              />
            </div>
          ) : contentLoaded ? (
            <Editor
              height="100%"
              language={activeFile.language}
              value={content || ''}
              theme="vs-dark"
              options={{
                readOnly: true,
                minimap: { enabled: true },
                fontSize: 12,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                folding: true,
                renderLineHighlight: 'line',
                glyphMargin: true
              }}
              onMount={handleEditorMount}
            />
          ) : (
            <div style={{ padding: 16, color: 'var(--placeholder-color)' }}>Loading...</div>
          )}
        </div>

        {/* Zoom overlay */}
        {zoomedImage && (
          <div
            className="image-zoom-overlay"
            onClick={() => { setZoomedImage(null); setZoomLevel(1) }}
          >
            <img
              src={`data:${getMimeType(activeFile?.path || '');base64,${zoomedImage}}`}
              alt="zoom preview"
              className="image-zoom-content"
              style={{ transform: `scale(${zoomLevel})` }}
              onClick={(e) => e.stopPropagation()}
              onWheel={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setZoomLevel((prev) => {
                  const delta = e.deltaY > 0 ? -0.1 : 0.1
                  return Math.max(0.1, Math.min(5, prev + delta))
                })
              }}
            />
          </div>
        )}
```

- [ ] **Step 6: Fix activeFile check in zoom overlay**

The `activeFile?.path` in the zoom overlay needs a fallback for the MIME type. Update the overlay `<img>` src line to:

```tsx
            src={`data:${activeFile ? getMimeType(activeFile.path) : 'image/png'};base64,${zoomedImage}`}
```

- [ ] **Step 7: Add CSS for image display**

Append to `src/renderer/src/components/CodeViewport.css`:

```css
.image-container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: #1e1e1e;
  padding: 16px;
}

.image-preview {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  cursor: pointer;
  border-radius: 4px;
  transition: opacity 0.15s;
}

.image-preview:hover {
  opacity: 0.9;
}

.image-zoom-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  cursor: pointer;
}

.image-zoom-content {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  cursor: default;
  transition: transform 0.15s ease-out;
}
```

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/components/CodeViewport.tsx src/renderer/src/components/CodeViewport.css
git commit -m "feat: render images in CodeViewport with click-to-zoom overlay"
```

---

### Task 5: Handle image files in CodeDirectory language mapping

**Files:**
- Modify: `src/renderer/src/components/CodeDirectory.tsx`

- [ ] **Step 1: Add image extensions to langMap**

In `handleFileSelect` (around line 138), update `langMap` to include image extensions so the language isn't `'plaintext'` for images. This is cosmetic — the actual image detection happens in CodeViewport via `isImageFile`. But for consistency, map image extensions to descriptive labels:

```typescript
    const langMap: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
      py: 'python', rs: 'rust', go: 'go', cpp: 'cpp', c: 'c',
      css: 'css', html: 'html', json: 'json', md: 'markdown',
      png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
      webp: 'image', bmp: 'image', svg: 'image'
    }
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/CodeDirectory.tsx
git commit -m "feat: map image file extensions in CodeDirectory"
```
