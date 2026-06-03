# Code Mapping for All Note Types — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `@ref(...)` code mapping support to all 4 note types (net, seq, mind, derive) with unified UX: SymbolPicker-based selection, single codeMapping per node/step, double-click + icon click to navigate to code.

**Architecture:** A shared `CodeMappingField` component encapsulates the text input + SymbolPicker + resolved display. Each editor embeds it and listens for `symbol-insert` CustomEvent from CodeViewport. D3-based canvases (Network, MindMap) add jump icons and double-click navigation. Sequence diagram viewer post-processes mermaid SVG to make `@ref` text clickable.

**Tech Stack:** React, TypeScript, D3.js, Mermaid, Electron IPC

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `src/main/schemas/note-types.ts` | Modify | Add `codeMapping` to `MindMapNode`, change `DerivationNode.codeMappings[]` → `codeMapping` |
| `src/renderer/src/components/CodeMappingField.tsx` | Create | Shared component: text input + SymbolPicker + resolved link |
| `src/renderer/src/components/CodeMappingField.css` | Create | Styles for CodeMappingField |
| `src/renderer/src/components/editors/NetworkPanel.tsx` | Modify | Use CodeMappingField |
| `src/renderer/src/components/editors/NetworkCanvas.tsx` | Modify | Jump icon + double-click nav |
| `src/renderer/src/components/editors/NetworkEditor.tsx` | Modify | Listen to symbol-insert, pass onNavigateToCode to canvas |
| `src/renderer/src/components/editors/SequenceDiagramViewer.tsx` | Modify | Post-process SVG to make @ref clickable |
| `src/renderer/src/components/editors/SequenceEditor.tsx` | Modify | Accept & pass onNavigateToCode |
| `src/renderer/src/components/editors/mindMapReducer.ts` | Modify | Add UPDATE_CODE_MAPPING action |
| `src/renderer/src/components/editors/NodeEditPanel.tsx` | Modify | Add CodeMappingField section |
| `src/renderer/src/components/editors/MindMapCanvas.tsx` | Modify | Jump icon + double-click nav |
| `src/renderer/src/components/editors/MindMapEditor.tsx` | Modify | Listen to symbol-insert, pass onNavigateToCode to canvas |
| `src/renderer/src/components/editors/derivationReducer.ts` | Modify | codeMappings[] → codeMapping, add UPDATE_CODE_MAPPING |
| `src/renderer/src/components/editors/DerivationEditor.tsx` | Modify | selectedStepId state, CodeMappingField per step, listen symbol-insert |
| `src/renderer/src/components/NoteViewport.tsx` | Modify | Pass onNavigateToCode to SequenceEditor & DerivationEditor |

---

### Task 1: Data Model Changes

**Files:**
- Modify: `src/main/schemas/note-types.ts`

- [ ] **Step 1: Add codeMapping to MindMapNode, change DerivationNode codeMappings to codeMapping**

```ts
// In MindMapNode interface (around line 15-20), add codeMapping field:
export interface MindMapNode {
  id: string
  title: string
  content: string
  children: MindMapNode[]
  codeMapping?: CodeMapping   // NEW
}

// In DerivationNode interface (around line 53-61), change from array to single:
export interface DerivationNode {
  id: string
  title: string
  content: string
  stepNumber: number
  derivesFrom: string | null
  derivesTo: string[]
  embedRefs: string[]
  codeMapping?: CodeMapping   // CHANGED from codeMappings: CodeMapping[]
}

// In createDerivationNode (around line 70-80), remove codeMappings from return:
export function createDerivationNode(title = ''): DerivationNode {
  return {
    id: uuidv4(),
    title,
    content: '',
    stepNumber: 0,
    derivesFrom: null,
    derivesTo: [],
    embedRefs: [],
    // codeMappings removed
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/schemas/note-types.ts
git commit -m "feat: add codeMapping to MindMapNode, change DerivationNode to single codeMapping"
```

---

### Task 2: Shared CodeMappingField Component

**Files:**
- Create: `src/renderer/src/components/CodeMappingField.tsx`
- Create: `src/renderer/src/components/CodeMappingField.css`

- [ ] **Step 1: Create CodeMappingField.css**

```css
.code-mapping-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.code-mapping-field-input-row {
  display: flex;
  gap: 4px;
  align-items: center;
}

.code-mapping-field-input {
  flex: 1;
  background: #1e1e1e;
  border: 1px solid #444;
  color: #d4d4d4;
  padding: 4px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-family: monospace;
  outline: none;
}

.code-mapping-field-input:focus {
  border-color: #4a90d9;
}

.code-mapping-field-picker-btn {
  background: #333;
  border: 1px solid #555;
  color: #d4d4d4;
  padding: 4px 8px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
  flex-shrink: 0;
}

.code-mapping-field-picker-btn:hover {
  background: #444;
}

.code-mapping-field-resolved {
  font-size: 10px;
  color: #4a90d9;
  cursor: pointer;
  padding: 2px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.code-mapping-field-resolved:hover {
  text-decoration: underline;
  color: #61afef;
}
```

- [ ] **Step 2: Create CodeMappingField.tsx**

```tsx
import { useState, useCallback, useRef } from 'react'
import { SymbolPicker } from './SymbolPicker'
import type { CodeSymbol } from './SymbolPicker'
import type { CodeMapping } from '../../../main/schemas/note-types'
import { useCodeNavigation } from '../hooks/useCodeNavigation'
import './CodeMappingField.css'

interface CodeMappingFieldProps {
  codeMapping: CodeMapping | null | undefined
  notePath: string
  onChange: (mapping: CodeMapping | null) => void
}

export function CodeMappingField({ codeMapping, notePath, onChange }: CodeMappingFieldProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [rawInput, setRawInput] = useState(codeMapping?.raw ?? '')
  const { navigateToCode } = useCodeNavigation()
  const resolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync raw input when codeMapping changes externally
  // (keep track of last codeMapping id to detect actual changes)
  const lastMappingRef = useRef<CodeMapping | null | undefined>(null)
  if (lastMappingRef.current !== codeMapping) {
    lastMappingRef.current = codeMapping
    setRawInput(codeMapping?.raw ?? '')
  }

  const resolveAndUpdate = useCallback(async (raw: string) => {
    if (!raw) {
      onChange(null)
      return
    }
    try {
      const mappings = await window.electronAPI.resolveRefs(notePath, `@ref(${raw})`, undefined)
      if (mappings.length > 0) {
        onChange({ ...mappings[0], raw })
      } else {
        // Store raw text even if unresolved
        onChange({ raw, functionName: '', filePath: '', startLine: 0, endLine: 0 })
      }
    } catch {
      onChange({ raw, functionName: '', filePath: '', startLine: 0, endLine: 0 })
    }
  }, [notePath, onChange])

  const handleRawChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setRawInput(raw)
    if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current)
    resolveTimerRef.current = setTimeout(() => resolveAndUpdate(raw), 300)
  }, [resolveAndUpdate])

  const handleSymbolSelect = useCallback((sym: CodeSymbol) => {
    const fileName = sym.filePath.split('/').pop() || sym.filePath
    const dirPath = sym.filePath.split('/').slice(0, -1).join('/')
    const refRaw = `${dirPath}/${fileName}:${sym.startLine}:${sym.name}`
    setRawInput(refRaw)
    setPickerOpen(false)
    resolveAndUpdate(refRaw)
  }, [resolveAndUpdate])

  const hasResolved = codeMapping && codeMapping.filePath && codeMapping.startLine > 0

  return (
    <div className="code-mapping-field">
      <div className="code-mapping-field-input-row">
        <input
          className="code-mapping-field-input"
          value={rawInput}
          onChange={handleRawChange}
          placeholder="@ref(path:line:name)"
        />
        <button
          className="code-mapping-field-picker-btn"
          onClick={() => setPickerOpen(true)}
          title="Pick a symbol"
        >
          ...
        </button>
      </div>
      {hasResolved && (
        <div
          className="code-mapping-field-resolved"
          onClick={() => navigateToCode(codeMapping!.filePath, codeMapping!.startLine)}
          title={`Open ${codeMapping!.filePath}:${codeMapping!.startLine}`}
        >
          {codeMapping!.filePath.split('/').slice(-2).join('/')}:{codeMapping!.startLine} {codeMapping!.functionName}
        </div>
      )}
      <SymbolPicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelectSymbol={handleSymbolSelect}
      />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/CodeMappingField.tsx src/renderer/src/components/CodeMappingField.css
git commit -m "feat: add shared CodeMappingField component with SymbolPicker integration"
```

---

### Task 3: net.json Code Mapping

**Files:**
- Modify: `src/renderer/src/components/editors/NetworkPanel.tsx`
- Modify: `src/renderer/src/components/editors/NetworkCanvas.tsx`
- Modify: `src/renderer/src/components/editors/NetworkEditor.tsx`

- [ ] **Step 1: Update NetworkPanel to use CodeMappingField**

Replace the current manual Code Mapping section in NetworkPanel.tsx with CodeMappingField.

Change the imports (add CodeMappingField import):
```tsx
import { CodeMappingField } from '../CodeMappingField'
```

Change the props interface — remove `onResolveRef` and `resolvedMapping`, add `notePath`:
```tsx
interface NetworkPanelProps {
  node: GraphNode | null
  nodeDef: LayerDef | undefined
  onUpdateNode: (nodeId: string, field: string, value: unknown, paramKey?: string) => void
  onAddEdge: (source: string, target: string) => void
  notePath: string
}
```

Replace the Code Mapping section (lines 167-187 in the side panel for layer nodes):
```tsx
{/* Side: Code mapping + Tensor shapes (layer only) */}
{node.kind === 'layer' && (
  <div className="network-panel-side">
    <div className="network-panel-section-title">Code Mapping</div>
    <CodeMappingField
      codeMapping={node.codeMapping}
      notePath={notePath}
      onChange={(mapping) => onUpdateNode(node.id, 'codeMapping', mapping)}
    />
    <div className="network-panel-section-title" style={{ marginTop: 12 }}>Tensor Shapes</div>
    <div className="network-panel-shapes">
      <input
        className="network-panel-input"
        value={node.inputShape || ''}
        onChange={(e) => onUpdateNode(node.id, 'inputShape', e.target.value)}
        placeholder="input (e.g., 64x56x56)"
      />
      <span className="network-panel-shape-arrow">→</span>
      <input
        className="network-panel-input"
        value={node.outputShape || ''}
        onChange={(e) => onUpdateNode(node.id, 'outputShape', e.target.value)}
        placeholder="output"
      />
    </div>
  </div>
)}
```

- [ ] **Step 2: Update NetworkEditor to pass notePath and remove old props**

In NetworkEditor.tsx, update the NetworkPanel call:
```tsx
<NetworkPanel
  node={selectedNode}
  nodeDef={selectedNodeDef}
  onUpdateNode={(nodeId, field, value, paramKey?) => dispatch({ type: 'UPDATE_NODE', nodeId, field, paramKey, value })}
  onAddEdge={handleAddEdge}
  notePath={notePath}
/>
```

Remove `resolvedMapping` state and `handleResolveRef` callback (no longer needed). Also remove the `setResolvedMapping` call in `handleSelectNode`.

- [ ] **Step 3: Add symbol-insert listener to NetworkEditor**

Add this useEffect in NetworkEditor.tsx (before the return statement, near other useEffects):
```tsx
// Listen for symbol-insert events from CodeViewport's SymbolPicker
useEffect(() => {
  const handler = (e: Event) => {
    const refText = (e as CustomEvent<string>).detail
    const sel = selectedNodeRef.current
    if (!sel || sel.kind !== 'layer') return
    window.electronAPI.resolveRefs(notePath, refText, undefined).then((mappings) => {
      if (mappings.length > 0) {
        const m = mappings[0]
        m.raw = refText.replace(/^@ref\(|\)$/g, '')
        dispatch({ type: 'UPDATE_NODE', nodeId: sel.id, field: 'codeMapping', value: m })
      }
    }).catch(() => {})
  }
  window.addEventListener('symbol-insert', handler)
  return () => window.removeEventListener('symbol-insert', handler)
}, [notePath])
```

- [ ] **Step 4: Update NetworkCanvas — add onNavigateToCode prop, jump icon, double-click**

Add `onNavigateToCode` to NetworkCanvasProps:
```tsx
interface NetworkCanvasProps {
  // ... existing props
  onNavigateToCode?: (filePath: string, line: number) => void
}
```

Destructure it in the component:
```tsx
export function NetworkCanvas({
  doc, catalog, selectedNodeId, selectedEdgeId,
  onSelectNode, onSelectEdge, onDropLayer, onDeleteNode, onAddEdge,
  onNavigateToCode
}: NetworkCanvasProps) {
```

Replace the blue dot indicator for top-level layer nodes (line 471-475):
```tsx
// Replace:
if (node.codeMapping) {
  nodeG.append('circle')
    .attr('cx', nx + nw - 8).attr('cy', ny + 8).attr('r', 3)
    .attr('fill', '#4a90d9')
}

// With:
if (node.codeMapping && onNavigateToCode) {
  nodeG.append('text')
    .attr('x', nx + nw - 14).attr('y', ny + 12)
    .attr('fill', '#4a90d9').attr('font-size', '12px')
    .attr('font-weight', 'bold')
    .style('cursor', 'pointer')
    .text('→')
    .on('click', (event: MouseEvent) => {
      event.stopPropagation()
      onNavigateToCode(node.codeMapping!.filePath, node.codeMapping!.startLine)
    })
}
```

Replace the blue dot indicator for child nodes inside blocks (line 406-410):
```tsx
// Replace:
if (child.codeMapping) {
  childG.append('circle')
    .attr('cx', cx + NODE_W - 8).attr('cy', cy + 8).attr('r', 3)
    .attr('fill', '#4a90d9')
}

// With:
if (child.codeMapping && onNavigateToCode) {
  childG.append('text')
    .attr('x', cx + NODE_W - 14).attr('y', cy + 12)
    .attr('fill', '#4a90d9').attr('font-size', '12px')
    .attr('font-weight', 'bold')
    .style('cursor', 'pointer')
    .text('→')
    .on('click', (event: MouseEvent) => {
      event.stopPropagation()
      onNavigateToCode(child.codeMapping!.filePath, child.codeMapping!.startLine)
    })
}
```

Add double-click handler to node groups. After the existing `nodeG.on('click', ...)` for top-level nodes, add:
```tsx
nodeG.on('dblclick', (event: MouseEvent) => {
  event.stopPropagation()
  if (node.codeMapping && onNavigateToCode) {
    onNavigateToCode(node.codeMapping.filePath, node.codeMapping.startLine)
  }
})
```

Add double-click handler for child nodes. After `childG.on('click', ...)`, add:
```tsx
childG.on('dblclick', (event: MouseEvent) => {
  event.stopPropagation()
  if (child.codeMapping && onNavigateToCode) {
    onNavigateToCode(child.codeMapping.filePath, child.codeMapping.startLine)
  }
})
```

- [ ] **Step 5: Pass onNavigateToCode to NetworkCanvas in NetworkEditor**

In NetworkEditor.tsx, update the NetworkCanvas call:
```tsx
<NetworkCanvas
  doc={doc}
  catalog={catalog}
  selectedNodeId={selectedNodeId}
  selectedEdgeId={selectedEdgeId}
  onSelectNode={handleSelectNode}
  onSelectEdge={handleSelectEdge}
  onDropLayer={handleDropLayer}
  onDeleteNode={handleDeleteNode}
  onAddEdge={handleAddEdge}
  onNavigateToCode={onNavigateToCode}
/>
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/editors/NetworkPanel.tsx \
        src/renderer/src/components/editors/NetworkCanvas.tsx \
        src/renderer/src/components/editors/NetworkEditor.tsx
git commit -m "feat: add code mapping picker, jump icon, and double-click nav to network editor"
```

---

### Task 4: seq.mermaid @ref Link Rendering

**Files:**
- Modify: `src/renderer/src/components/editors/SequenceDiagramViewer.tsx`
- Modify: `src/renderer/src/components/editors/SequenceEditor.tsx`
- Modify: `src/renderer/src/components/NoteViewport.tsx`

- [ ] **Step 1: Update SequenceDiagramViewer to post-process @ref in SVG**

Add `onNavigateToCode` prop and post-processing useEffect:

```tsx
import { useCodeNavigation } from '../hooks/useCodeNavigation'

interface SequenceDiagramViewerProps {
  content: string
  notePath: string
}

// Remove the existing SequenceDiagramViewer and replace with:
export function SequenceDiagramViewer({ content, notePath }: SequenceDiagramViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [svg, setSvg] = useState<string | null>(null)
  const { navigateToCode } = useCodeNavigation()

  useEffect(() => {
    initMermaid()
    const renderDiagram = async () => {
      if (!content.trim()) {
        setSvg(null)
        setError(null)
        return
      }
      try {
        const id = 'mermaid-' + Math.random().toString(36).substring(2, 8)
        const { svg: rendered } = await mermaid.render(id, content)
        setSvg(rendered)
        setError(null)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown render error'
        setError(message)
        setSvg(null)
      }
    }
    renderDiagram()
  }, [content])

  // Post-process SVG to make @ref clickable
  useEffect(() => {
    if (!svg || !containerRef.current) return
    const container = containerRef.current

    // Use a small delay to ensure the DOM is updated with the new SVG
    const timer = setTimeout(() => {
      const svgEl = container.querySelector('svg')
      if (!svgEl) return

      // Find all text elements that contain @ref(...)
      const texts = svgEl.querySelectorAll('text')
      texts.forEach((textEl) => {
        const original = textEl.textContent || ''
        const match = original.match(/@ref\(([^)]+)\)/)
        if (!match) return

        // Clear the text element
        textEl.textContent = ''

        // Add preceding text if any
        const beforeIdx = original.indexOf(match[0])
        if (beforeIdx > 0) {
          const beforeSpan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan')
          beforeSpan.textContent = original.slice(0, beforeIdx)
          textEl.appendChild(beforeSpan)
        }

        // Add clickable @ref link
        const linkSpan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan')
        linkSpan.textContent = original.slice(beforeIdx, beforeIdx + match[0].length)
        linkSpan.setAttribute('fill', '#61afef')
        linkSpan.setAttribute('text-decoration', 'underline')
        linkSpan.style.cursor = 'pointer'
        linkSpan.addEventListener('click', async (e) => {
          e.stopPropagation()
          try {
            const mappings = await window.electronAPI.resolveRefs(notePath, match[0], undefined)
            if (mappings.length > 0) {
              navigateToCode(mappings[0].filePath, mappings[0].startLine)
            }
          } catch { /* ignore */ }
        })
        textEl.appendChild(linkSpan)

        // Add trailing text if any
        const afterIdx = beforeIdx + match[0].length
        if (afterIdx < original.length) {
          const afterSpan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan')
          afterSpan.textContent = original.slice(afterIdx)
          textEl.appendChild(afterSpan)
        }
      })
    }, 100)

    return () => clearTimeout(timer)
  }, [svg, notePath, navigateToCode])

  if (error) {
    return (
      <div className="sequence-diagram-error" style={{ color: '#e06c75', padding: 8, fontSize: 13 }}>
        Diagram error: {error}
      </div>
    )
  }

  if (!svg) {
    return (
      <div className="sequence-diagram-empty" style={{ color: '#5c6370', padding: 8, fontSize: 13 }}>
        Empty diagram
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="sequence-diagram-viewer"
      style={{ overflowX: 'auto', padding: 8 }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
```

- [ ] **Step 2: Update SequenceEditor to pass notePath**

In SequenceEditor.tsx, change `SequenceDiagramViewer` usage to pass `notePath`:
```tsx
<SequenceDiagramViewer content={value} notePath={notePath} />
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/editors/SequenceDiagramViewer.tsx \
        src/renderer/src/components/editors/SequenceEditor.tsx
git commit -m "feat: make @ref links clickable in sequence diagram SVG"
```

---

### Task 5: mind.json Code Mapping

**Files:**
- Modify: `src/renderer/src/components/editors/mindMapReducer.ts`
- Modify: `src/renderer/src/components/editors/NodeEditPanel.tsx`
- Modify: `src/renderer/src/components/editors/MindMapCanvas.tsx`
- Modify: `src/renderer/src/components/editors/MindMapEditor.tsx`

- [ ] **Step 1: Add UPDATE_CODE_MAPPING action to mindMapReducer**

Add to `MindMapAction` interface:
```tsx
import type { CodeMapping } from '../../../../main/schemas/note-types'

export interface MindMapAction {
  // ... existing fields
  codeMapping?: CodeMapping | null   // NEW
}
```

Add case to reducer (before the `default` case):
```tsx
case 'UPDATE_CODE_MAPPING': {
  const cloned = cloneDoc(doc)
  cloned.root = updateNodeInClone(cloned.root, action.nodeId!, (n) => ({
    ...n,
    codeMapping: (action.codeMapping ?? undefined) as MindMapNode['codeMapping']
  }))
  return cloned
}
```

- [ ] **Step 2: Add CodeMappingField to NodeEditPanel**

Update imports and props in NodeEditPanel.tsx:
```tsx
import { CodeMappingField } from '../CodeMappingField'
import type { CodeMapping } from '../../../../main/schemas/note-types'

interface NodeEditPanelProps {
  node: MindMapNode | null
  dispatch: React.Dispatch<MindMapAction>
  notePath: string    // NEW
  onNavigateToCode?: (filePath: string, line: number) => void
  saveStatus: 'saved' | 'saving' | 'unsaved' | 'error'
}
```

Add CodeMappingField section before the save status (after the Monaco editor section):
```tsx
<div className="node-edit-panel-field">
  <label className="node-edit-panel-label">Code Mapping</label>
  <CodeMappingField
    codeMapping={node.codeMapping}
    notePath={notePath}
    onChange={(mapping) => dispatch({ type: 'UPDATE_CODE_MAPPING', nodeId: node.id, codeMapping: mapping })}
  />
</div>
```

- [ ] **Step 3: Update MindMapCanvas — add onNavigateToCode, jump icon, double-click nav**

Add `onNavigateToCode` to MindMapCanvasProps:
```tsx
interface MindMapCanvasProps {
  // ... existing props
  onNavigateToCode?: (filePath: string, line: number) => void
}
```

Destructure it:
```tsx
function MindMapCanvas({ doc, notePath, selectedNodeId, collapsedIds, dispatch, onContextMenu, onHoverNode, onNavigateToCode }, ref) {
```

In the node rendering section, after the title text append (around line 614-620), add the jump icon:
```tsx
// After the title text node:
nodeGroup.each(function (d: d3.HierarchyNode<MindMapNode>) {
  if (!d.data.codeMapping || !onNavigateToCode) return
  if (d.data.codeMapping.filePath && d.data.codeMapping.startLine > 0) {
    const g = d3.select(this)
    g.append('text')
      .attr('x', 55)
      .attr('y', -6)
      .attr('fill', '#4a90d9')
      .attr('font-size', '11px')
      .attr('font-weight', 'bold')
      .style('cursor', 'pointer')
      .text('→')
      .on('click', (event: MouseEvent) => {
        event.stopPropagation()
        onNavigateToCode(d.data.codeMapping!.filePath, d.data.codeMapping!.startLine)
      })
  }
})
```

Update the double-click handler (line 690-695). Change from:
```tsx
nodeGroup.on('dblclick', (event: MouseEvent, d: d3.HierarchyNode<MindMapNode>) => {
  event.stopPropagation()
  dispatch({ type: 'SELECT_NODE', nodeId: d.data.id })
  focusNodeIdRef.current = d.data.id
  render()
})
```

To:
```tsx
nodeGroup.on('dblclick', (event: MouseEvent, d: d3.HierarchyNode<MindMapNode>) => {
  event.stopPropagation()
  if (d.data.codeMapping && onNavigateToCode && d.data.codeMapping.filePath) {
    onNavigateToCode(d.data.codeMapping.filePath, d.data.codeMapping.startLine)
  } else {
    dispatch({ type: 'SELECT_NODE', nodeId: d.data.id })
    focusNodeIdRef.current = d.data.id
    render()
  }
})
```

- [ ] **Step 4: Update MindMapEditor — pass notePath, onNavigateToCode, listen symbol-insert**

Update MindMapCanvas call to pass `onNavigateToCode`:
```tsx
<MindMapCanvas
  ref={canvasRef}
  doc={doc}
  notePath={notePath}
  selectedNodeId={selectedNodeId}
  collapsedIds={collapsedIds}
  dispatch={wrappedDispatch}
  onContextMenu={handleContextMenu}
  onNavigateToCode={onNavigateToCode}
/>
```

Update NodeEditPanel call to pass `notePath`:
```tsx
<NodeEditPanel
  node={selectedNode}
  dispatch={wrappedDispatch}
  notePath={notePath}
  onNavigateToCode={onNavigateToCode}
  saveStatus={saveStatus}
/>
```

Add symbol-insert listener (before the return, near other useEffects):
```tsx
// Listen for symbol-insert events from CodeViewport
useEffect(() => {
  const handler = (e: Event) => {
    const refText = (e as CustomEvent<string>).detail
    const selId = selectedNodeIdRef.current
    if (!selId) return
    window.electronAPI.resolveRefs(notePath, refText, undefined).then((mappings) => {
      if (mappings.length > 0) {
        const m = mappings[0]
        m.raw = refText.replace(/^@ref\(|\)$/g, '')
        dispatch({ type: 'UPDATE_CODE_MAPPING', nodeId: selId, codeMapping: m })
      }
    }).catch(() => {})
  }
  window.addEventListener('symbol-insert', handler)
  return () => window.removeEventListener('symbol-insert', handler)
}, [notePath])
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/editors/mindMapReducer.ts \
        src/renderer/src/components/editors/NodeEditPanel.tsx \
        src/renderer/src/components/editors/MindMapCanvas.tsx \
        src/renderer/src/components/editors/MindMapEditor.tsx
git commit -m "feat: add code mapping picker, jump icon, and double-click nav to mind map editor"
```

---

### Task 6: derive.json Code Mapping

**Files:**
- Modify: `src/renderer/src/components/editors/derivationReducer.ts`
- Modify: `src/renderer/src/components/editors/DerivationEditor.tsx`
- Modify: `src/renderer/src/components/NoteViewport.tsx`

- [ ] **Step 1: Update derivationReducer for single codeMapping**

In derivationReducer.ts, update `cloneDoc` to handle single `codeMapping` instead of `codeMappings` array:
```tsx
function cloneDoc(doc: DerivationDocument): DerivationDocument {
  return {
    ...doc,
    nodes: doc.nodes.map((n) => ({ ...n, embedRefs: [...n.embedRefs], derivesTo: [...n.derivesTo] }))
  }
}
```

Add `UPDATE_CODE_MAPPING` action. Update `DerivationAction` interface:
```tsx
import type { CodeMapping } from '../../../../main/schemas/note-types'

export interface DerivationAction {
  // ... existing fields
  codeMapping?: CodeMapping | null   // NEW
}
```

Add case to reducer:
```tsx
case 'UPDATE_CODE_MAPPING': {
  const cloned = cloneDoc(doc)
  cloned.nodes = cloned.nodes.map((n) =>
    n.id === action.nodeId! ? { ...n, codeMapping: action.codeMapping ?? undefined } : n
  )
  return cloned
}
```

- [ ] **Step 2: Update DerivationEditor — selectedStepId, CodeMappingField, symbol-insert**

Add imports:
```tsx
import { CodeMappingField } from '../CodeMappingField'
import type { CodeMapping } from '../../../../main/schemas/note-types'
```

Add `onNavigateToCode` and `notePath` to props:
```tsx
interface DerivationEditorProps {
  document: DerivationDocument
  notePath: string                                                  // NEW
  onSave: (doc: DerivationDocument) => Promise<void>
  codeRepoPath: string | null
  onNavigateToCode?: (filePath: string, line: number) => void       // NEW
}
```

Add `selectedStepId` state (near other useState calls):
```tsx
const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
```

Add symbol-insert listener (near other useEffect calls):
```tsx
useEffect(() => {
  const handler = (e: Event) => {
    const refText = (e as CustomEvent<string>).detail
    if (!selectedStepId) return
    window.electronAPI.resolveRefs(notePath, refText, undefined).then((mappings) => {
      if (mappings.length > 0) {
        const m = mappings[0]
        m.raw = refText.replace(/^@ref\(|\)$/g, '')
        dispatch({ type: 'UPDATE_CODE_MAPPING', nodeId: selectedStepId, codeMapping: m })
      }
    }).catch(() => {})
  }
  window.addEventListener('symbol-insert', handler)
  return () => window.removeEventListener('symbol-insert', handler)
}, [notePath, selectedStepId])
```

Add `handleSelectStep` callback:
```tsx
const handleSelectStep = useCallback((nodeId: string) => {
  setSelectedStepId((prev) => prev === nodeId ? null : nodeId)
}, [])
```

In the step card rendering, add onClick to select the step and show CodeMappingField when selected. On the outermost div of each step card, add:
```tsx
<div
  id={`derive-node-${node.id}`}
  className={`derive-node-card${dragIndex === index ? ' dragging' : ''}${selectedStepId === node.id ? ' selected' : ''}`}
  onDragOver={(e) => handleDragOver(e, index)}
  onDrop={() => handleDrop(index)}
  onClick={() => handleSelectStep(node.id)}
>
```

Add CodeMappingField below the content textarea (after the KaTeX preview section), shown only when the step is selected:
```tsx
{selectedStepId === node.id && (
  <div style={{ marginTop: 8, padding: '0 4px' }}>
    <CodeMappingField
      codeMapping={node.codeMapping}
      notePath={notePath}
      onChange={(mapping) => dispatch({ type: 'UPDATE_CODE_MAPPING', nodeId: node.id, codeMapping: mapping })}
    />
  </div>
)}
```

Reset selectedStepId when document changes:
```tsx
useEffect(() => {
  // ... existing reset logic
  setSelectedStepId(null)   // ADD this
}, [initialDoc])
```

- [ ] **Step 3: Update NoteViewport — pass onNavigateToCode to SequenceEditor and DerivationEditor**

For the `seq` case:
```tsx
case 'seq':
  return (
    <SequenceEditor
      content={activeNoteContent as string}
      notePath={selectedNoteId}
      onSave={async (content: string) => {
        await saveNote(selectedNoteId, content)
      }}
    />
  )
```

For the `derive` case:
```tsx
case 'derive':
  return (
    <DerivationEditor
      document={activeNoteContent as DerivationDocument}
      notePath={selectedNoteId}
      onSave={async (doc: DerivationDocument) => {
        await saveNote(selectedNoteId, doc)
      }}
      codeRepoPath={state.codeRepoPath}
      onNavigateToCode={(filePath: string, line: number) => {
        navigateToCode(filePath, line)
      }}
    />
  )
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/editors/derivationReducer.ts \
        src/renderer/src/components/editors/DerivationEditor.tsx \
        src/renderer/src/components/NoteViewport.tsx
git commit -m "feat: add single codeMapping with picker to derivation editor"
```

---

### Task 7: Final Integration Check

- [ ] **Step 1: Verify TypeScript compilation**

```bash
cd /Users/wangyan/Desktop/note && npx tsc --noEmit --project tsconfig.web.json 2>&1 | head -40
```

Expected: No new type errors from our changes. Fix any errors that appear.

- [ ] **Step 2: Run existing tests**

```bash
cd /Users/wangyan/Desktop/note && npx vitest run 2>&1
```

Expected: All existing tests pass.

- [ ] **Step 3: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: resolve type errors and test failures from code mapping changes"
```
