# Sequence Diagram Viewer Zoom — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Ctrl+wheel zoom (centered on cursor position) to the SequenceDiagramViewer rendered viewport, ranging 0.3×–3.0×.

**Architecture:** SVG element resize approach (refinement over spec's CSS transform) — measure natural SVG dimensions after render, then modify the SVG's `width`/`height` attributes on zoom. SVG vector scaling is crisp at any zoom level. The scroll container (overflow:auto) automatically handles scroll extent. No wrapper/inner divs, no CSS transforms needed.

**Tech Stack:** React 18, TypeScript, Mermaid.js, raw DOM manipulation for SVG attributes

---

### Task 1: Add zoom refs and SVG natural size measurement

**Files:**
- Modify: `src/renderer/src/components/editors/SequenceDiagramViewer.tsx:32-149`

- [ ] **Step 1: Rename containerRef → scrollContainerRef and add zoom refs**

At the top of `SequenceDiagramViewer`, replace `containerRef` with `scrollContainerRef` and add zoom refs:

```tsx
export function SequenceDiagramViewer({ content, notePath }: SequenceDiagramViewerProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)  // rename from containerRef
  const [error, setError] = useState<string | null>(null)
  const [svg, setSvg] = useState<string | null>(null)
  const { navigateToCode } = useCodeNavigation()
  const refMapRef = useRef<Map<string, { displayName: string; refText: string }>>(new Map())
  const zoomRef = useRef(1)                                  // NEW
  const svgNaturalSizeRef = useRef({ width: 0, height: 0 })  // NEW
```

- [ ] **Step 2: Replace all `containerRef` references with `scrollContainerRef`**

In the post-processing `useEffect`:
```tsx
// Line 83: change containerRef.current → scrollContainerRef.current
const svgEl = scrollContainerRef.current?.querySelector('svg')
```

In `handleLocate`:
```tsx
// Line 151-152: change containerRef.current → scrollContainerRef.current
if (scrollContainerRef.current) {
  scrollContainerRef.current.scrollTo({ left: 0, behavior: 'smooth' })
}
```

In the JSX return (SVG path):
```tsx
// Line 175-179: change ref={containerRef} → ref={scrollContainerRef}
<div
  ref={scrollContainerRef}
  className="sequence-diagram-viewer"
  style={{ overflow: 'auto', padding: 8, height: '100%' }}
  dangerouslySetInnerHTML={{ __html: svg }}
/>
```

- [ ] **Step 3: Measure SVG natural size in post-processing useEffect**

After the placeholder replacement loop completes (after line 142, before the return), add:

```tsx
        // Measure SVG natural size for zoom
        const svgEl = scrollContainerRef.current?.querySelector('svg')
        if (svgEl) {
          const rect = svgEl.getBoundingClientRect()
          if (rect.width > 0 && rect.height > 0) {
            svgNaturalSizeRef.current = { width: rect.width, height: rect.height }
          }
        }
```

Full section context — inside the post-processing `useEffect`, after the texts.forEach block closes at line 142, and before the timer's return cleanup:

```tsx
          cursor = matchStart + placeholder.length
        }

        // Remaining text after last match
        if (cursor < original.length) {
          const tspan = document.createElementNS(svgns, 'tspan')
          tspan.textContent = original.slice(cursor)
          textEl.appendChild(tspan)
        }
      })

      // NEW: Measure SVG natural size for zoom
      const svgEl = scrollContainerRef.current?.querySelector('svg')
      if (svgEl) {
        const rect = svgEl.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) {
          svgNaturalSizeRef.current = { width: rect.width, height: rect.height }
        }
      }
    }, 100)
```

- [ ] **Step 4: Run TypeScript check**

```bash
cd /Users/wangyan/Desktop/note && npx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: No new errors introduced.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/editors/SequenceDiagramViewer.tsx
git commit -m "feat: add zoom refs and SVG natural size measurement"
```

---

### Task 2: Implement Ctrl+wheel zoom handler

**Files:**
- Modify: `src/renderer/src/components/editors/SequenceDiagramViewer.tsx:74-84`

- [ ] **Step 1: Add applyZoom helper and handleWheel function**

Add after the `initMermaid()` call (after line 25), inside the component function, before the `useEffect` for render:

```tsx
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()

    const container = scrollContainerRef.current
    if (!container) return

    const natural = svgNaturalSizeRef.current
    if (natural.width === 0) return

    const oldZoom = zoomRef.current
    const step = -e.deltaY * 0.002
    const newZoom = Math.min(3, Math.max(0.3, oldZoom + step))
    if (newZoom === oldZoom) return

    const containerRect = container.getBoundingClientRect()

    // Cursor position relative to container content (scroll-adjusted)
    const cursorX = e.clientX - containerRect.left + container.scrollLeft
    const cursorY = e.clientY - containerRect.top + container.scrollTop

    // Corresponding point in SVG coordinate space
    const svgPointX = cursorX / oldZoom
    const svgPointY = cursorY / oldZoom

    const svgEl = container.querySelector('svg')
    if (svgEl) {
      svgEl.setAttribute('width', String(natural.width * newZoom))
      svgEl.setAttribute('height', String(natural.height * newZoom))
    }

    zoomRef.current = newZoom

    // Recompute scroll so the SVG point stays under the cursor
    requestAnimationFrame(() => {
      container.scrollLeft = svgPointX * newZoom - (e.clientX - containerRect.left)
      container.scrollTop = svgPointY * newZoom - (e.clientY - containerRect.top)
    })
  }, [])
```

- [ ] **Step 2: Attach onWheel to scroll container in JSX**

Change the scroll container div to include `onWheel={handleWheel}`:

```tsx
<div
  ref={scrollContainerRef}
  className="sequence-diagram-viewer"
  style={{ overflow: 'auto', padding: 8, height: '100%' }}
  onWheel={handleWheel}
  dangerouslySetInnerHTML={{ __html: svg }}
/>
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd /Users/wangyan/Desktop/note && npx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/editors/SequenceDiagramViewer.tsx
git commit -m "feat: add Ctrl+wheel zoom to sequence diagram viewer"
```

---

### Task 3: Extend handleLocate to reset zoom

**Files:**
- Modify: `src/renderer/src/components/editors/SequenceDiagramViewer.tsx:151-155`

- [ ] **Step 1: Update handleLocate to reset zoom**

Replace the existing `handleLocate`:

```tsx
  const handleLocate = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const svgEl = container.querySelector('svg')
    const natural = svgNaturalSizeRef.current
    if (svgEl && natural.width > 0) {
      svgEl.setAttribute('width', String(natural.width))
      svgEl.setAttribute('height', String(natural.height))
    }
    zoomRef.current = 1

    container.scrollTo({ left: 0, behavior: 'smooth' })
  }, [])
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd /Users/wangyan/Desktop/note && npx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/editors/SequenceDiagramViewer.tsx
git commit -m "feat: reset zoom on locate button click in sequence diagram"
```

---

### Task 4: Verify empty/error states unaffected

**Files:**
- No changes — verification only

- [ ] **Step 1: Verify empty and error return paths don't render scroll container**

Read the current return paths — both empty and error states return simple divs without `ref={scrollContainerRef}` or `onWheel`. Since `scrollContainerRef` and `handleWheel` are only used in the SVG return path, these states are unaffected. No code changes needed.

- [ ] **Step 2: Run existing tests**

```bash
cd /Users/wangyan/Desktop/note && npm test 2>&1 | tail -20
```

Expected: All existing tests pass.

- [ ] **Step 3: Commit (no code changes, verification only)**

Skip — nothing to commit.

---

### Task 5: Run full verification

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/wangyan/Desktop/note && npm test 2>&1
```

Expected: All tests pass.

- [ ] **Step 2: Run TypeScript check across project**

```bash
cd /Users/wangyan/Desktop/note && npx tsc --noEmit --pretty 2>&1
```

Expected: No errors.

- [ ] **Step 3: Verify final file state**

Read the complete modified file to confirm all changes are coherent.

```bash
cat -n src/renderer/src/components/editors/SequenceDiagramViewer.tsx
```
