# Floating Locate Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared floating circular locate button to three diagram viewers (mind map, sequence, network) so users can smoothly return to the root node / initial view when lost after panning/zooming.

**Architecture:** A shared `LocateButton` React component renders an absolutely-positioned circular button with a target SVG icon. Each D3-based viewer stores its initial fit transform in a ref and passes a callback that uses d3 zoom transition to animate back. The sequence diagram viewer uses smooth scroll behavior instead.

**Tech Stack:** React 18, TypeScript, D3.js v7, Mermaid, Vitest + Testing Library

---

### Task 1: Create LocateButton component

**Files:**
- Create: `src/renderer/src/components/editors/LocateButton.tsx`
- Create: `src/renderer/src/components/editors/LocateButton.css`
- Create: `tests/renderer/LocateButton.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/renderer/LocateButton.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LocateButton } from '../../src/renderer/src/components/editors/LocateButton'

describe('LocateButton', () => {
  it('renders with default title', () => {
    render(<LocateButton onLocate={() => {}} />)
    const btn = screen.getByTitle('定位到根节点')
    expect(btn).toBeInTheDocument()
    expect(btn.tagName).toBe('BUTTON')
  })

  it('renders with custom title', () => {
    render(<LocateButton onLocate={() => {}} title="Go home" />)
    expect(screen.getByTitle('Go home')).toBeInTheDocument()
  })

  it('calls onLocate when clicked', async () => {
    const onLocate = vi.fn()
    const user = userEvent.setup()
    render(<LocateButton onLocate={onLocate} />)
    await user.click(screen.getByTitle('定位到根节点'))
    expect(onLocate).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/LocateButton.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create LocateButton.css**

```css
/* src/renderer/src/components/editors/LocateButton.css */
.locate-button {
  position: absolute;
  bottom: 16px;
  right: 16px;
  z-index: 10;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid #555;
  background: #2d2d2d;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background 0.15s;
}

.locate-button:hover {
  background: #3d3d3d;
}

.locate-button:active {
  background: #4d4d4d;
}

.locate-button svg {
  pointer-events: none;
}
```

- [ ] **Step 4: Create LocateButton.tsx**

```tsx
// src/renderer/src/components/editors/LocateButton.tsx
import './LocateButton.css'

interface LocateButtonProps {
  onLocate: () => void
  title?: string
}

export function LocateButton({ onLocate, title = '定位到根节点' }: LocateButtonProps) {
  return (
    <button className="locate-button" onClick={onLocate} title={title}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="#aaa" strokeWidth="1.5" />
        <circle cx="8" cy="8" r="2" fill="#4a90d9" />
      </svg>
    </button>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/renderer/LocateButton.test.tsx`
Expected: 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/editors/LocateButton.tsx src/renderer/src/components/editors/LocateButton.css tests/renderer/LocateButton.test.tsx
git commit -m "feat: add LocateButton shared component for diagram viewers"
```

---

### Task 2: Add locate button to MindMapRenderer

**Files:**
- Modify: `src/renderer/src/components/editors/MindMapRenderer.tsx`

- [ ] **Step 1: Add fit transform ref import LocateButton**

In the import section, add the `LocateButton` import and a ref type:

```tsx
// Add to existing imports:
import { LocateButton } from './LocateButton'
```

- [ ] **Step 2: Add fitTransformRef and onLocate callback**

Add a ref to store the initial fit transform, and a callback that uses d3 zoom transition:

```tsx
// Add after zoomRef declaration (line 15):
const fitTransformRef = useRef<{ x: number; y: number; k: number }>({ x: 0, y: 0, k: 1 })

// Add a handleLocate callback before the return statement, inside the component:
const handleLocate = useCallback(() => {
  const svg = d3.select(svgRef.current)
  const zoom = zoomRef.current
  if (!zoom) return
  const { x, y, k } = fitTransformRef.current
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(svg as any).transition().duration(400).call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(k))
}, [])
```

- [ ] **Step 3: Save fit transform to ref**

In the `render` function, after computing `tx`, `ty`, and `scale` (lines 130-133), add:

```tsx
// After the current line 133 (the transform assignment):
fitTransformRef.current = { x: tx, y: ty, k: scale }
```

- [ ] **Step 4: Render LocateButton in the JSX**

Change the return JSX to wrap the svg and button in the container:

```tsx
// Replace current return (lines 153-157):
return (
  <div className="mindmap-container" ref={containerRef}>
    <svg ref={svgRef} />
    <LocateButton onLocate={handleLocate} />
  </div>
)
```

- [ ] **Step 5: Verify the build compiles**

Run: `npx tsc --noEmit -p tsconfig.web.json`
Expected: No new errors

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/editors/MindMapRenderer.tsx
git commit -m "feat: add locate button to MindMapRenderer"
```

---

### Task 3: Add locate button to NetworkCanvas

**Files:**
- Modify: `src/renderer/src/components/editors/NetworkCanvas.tsx`

- [ ] **Step 1: Add LocateButton import**

```tsx
// Add to existing imports:
import { LocateButton } from './LocateButton'
```

- [ ] **Step 2: Add fitTransformRef and handleLocate callback**

Add after the existing refs (after line 77):

```tsx
const fitTransformRef = useRef<{ x: number; y: number; k: number }>({ x: 0, y: 0, k: 1 })
```

Add a handleLocate callback before the return, inside the component. NetworkCanvas recreates zoom each render (no zoomRef), so we transition the g element directly:

```tsx
const handleLocate = useCallback(() => {
  const g = d3.select(svgRef.current).select<SVGGElement>('.canvas-content')
  if (g.empty()) return
  const { x, y, k } = fitTransformRef.current
  g.transition().duration(400).attr('transform', `translate(${x}, ${y}) scale(${k})`)
}, [])
```

- [ ] **Step 3: Save fit transform to ref**

In the `render` function, after `initTx`/`initTy` are computed and before `svg.call(zoom.transform...)`, save the values:

```tsx
// After the line computing fitScale (line 213), save the transform:
fitTransformRef.current = { x: initTx, y: initTy, k: fitScale }
```

- [ ] **Step 4: Render LocateButton**

Change the return JSX:

```tsx
// Replace current return (lines 851-861):
return (
  <div
    className="network-canvas-container"
    ref={containerRef}
    onMouseDown={handlePortMouseDown}
    onDragOver={handleDragOver}
    onDrop={handleDrop}
  >
    <svg ref={svgRef} />
    <LocateButton onLocate={handleLocate} />
  </div>
)
```

- [ ] **Step 5: Verify the build compiles**

Run: `npx tsc --noEmit -p tsconfig.web.json`
Expected: No new errors

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/editors/NetworkCanvas.tsx
git commit -m "feat: add locate button to NetworkCanvas"
```

---

### Task 4: Add locate button to SequenceDiagramViewer

**Files:**
- Modify: `src/renderer/src/components/editors/SequenceDiagramViewer.tsx`

- [ ] **Step 1: Add LocateButton import**

```tsx
// Add to existing imports:
import { LocateButton } from './LocateButton'
```

- [ ] **Step 2: Add scroll ref and handleLocate callback**

Use the existing `containerRef` (already declared on line 31). Add a callback:

```tsx
// Add after the error/svg states, inside the component:
const handleLocate = useCallback(() => {
  if (containerRef.current) {
    containerRef.current.scrollTo({ left: 0, behavior: 'smooth' })
  }
}, [])
```

- [ ] **Step 3: Update container style and add LocateButton**

Modify the return JSX (currently lines 165-172) to wrap content in a positioned container:

```tsx
// Replace the return at lines 165-172:
return (
  <div style={{ position: 'relative' }}>
    <div
      ref={containerRef}
      className="sequence-diagram-viewer"
      style={{ overflowX: 'auto', padding: 8, display: 'flex', justifyContent: 'center' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
    <LocateButton onLocate={handleLocate} />
  </div>
)
```

- [ ] **Step 4: Verify the build compiles**

Run: `npx tsc --noEmit -p tsconfig.web.json`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/editors/SequenceDiagramViewer.tsx
git commit -m "feat: add locate button to SequenceDiagramViewer"
```
