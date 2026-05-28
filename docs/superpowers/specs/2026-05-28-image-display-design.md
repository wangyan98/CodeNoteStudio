# Image Display in Code Viewport

**Date:** 2026-05-28  
**Status:** approved

## Summary

Code Viewport currently only handles text files via Monaco Editor. Image files
(PNG, JPG, JPEG, GIF, WebP, BMP) fail to load because `readCodeFile` reads as
UTF-8 text. Add base64-based image rendering with click-to-zoom.

## Supported Formats

PNG, JPG, JPEG, GIF, WebP, BMP

## Data Flow

1. User clicks an image file in CodeDirectory → dispatches `OPEN_CODE_FILE`
   (existing flow, unchanged)
2. CodeViewport detects the file extension is an image format
3. Calls new IPC `readBinaryFile(filePath)` → main process reads the file and
   returns a base64-encoded string
4. Renders `<img src="data:image/<mime>;base64,...">` instead of Monaco Editor
5. Click on image opens a fullscreen overlay with zoom (scroll wheel), close on
   Esc or click-outside

## File Changes

### Main Process

**`src/main/services/file-system.ts`** — add `readBinaryFile(path)`:
reads file with `fs.readFile` (no encoding), returns base64 string.

**`src/main/ipc-handlers.ts`** — add `code:read-binary-file` handler
that calls `readBinaryFile`.

### Preload & Types

**`src/preload/index.ts`** — expose `readBinaryFile(absolutePath: string): Promise<string>`.

**`src/renderer/src/types/electron.d.ts`** — add `readBinaryFile` type declaration.

### Renderer

**`src/renderer/src/components/CodeViewport.tsx`**:
- Define `IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'])`
- `isImageFile(path)` helper checks extension against the set
- In `loadFileContent`: if image, call `readBinaryFile` instead of `readCodeFile`,
  store in a separate `imageContents` state map
- In render: if active file is an image, render `<img>` with zoom overlay
  instead of Monaco Editor
- Zoom overlay: fullscreen fixed div, image with `object-fit: contain`,
  scroll-wheel zoom via CSS `transform: scale()`, close on Esc/click-outside

**`src/renderer/src/components/CodeViewport.css`**:
- `.image-container` — centers the image, max-width/max-height to fit viewport
- `.image-zoom-overlay` — fixed fullscreen backdrop with centered zoomable image
- `.image-zoom-overlay img` — `object-fit: contain`, `transition: transform 0.15s`

## Edge Cases

- **Corrupted images**: browser handles broken `<img>` natively (shows broken
  icon), no special handling needed
- **Large images**: base64 encoding adds ~33% overhead but is acceptable for
  code-adjacent images (typically screenshots, diagrams). The full-size image is
  only loaded on click.
- **SVG**: not in scope for this change — SVG could be rendered inline or as
  text, but is left for a future iteration
- **GIF animation**: works natively via `<img>` tag
