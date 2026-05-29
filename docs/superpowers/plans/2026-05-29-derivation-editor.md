# DerivationEditor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an interactive derivation editor (`DerivationEditor`) with always-editable nodes, mini DAG preview, drag reorder, and auto-save, following the same architecture as `MindMapEditor`.

**Architecture:** A `derivationReducer` handles all mutations on `DerivationDocument` (immutable, no cycles). `DerivationEditor` uses `useReducer` + auto-save with 300ms debounce, identical to `MindMapEditor`. `DerivationNodeCard` renders always-visible inputs with a debounced KaTeX preview per node. The mini DAG is a CSS-flexbox visualization. Wired into `NoteViewport` via `onSave` callback.

**Tech Stack:** React + TypeScript, KaTeX, HTML5 Drag & Drop, CSS flexbox

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/renderer/src/components/editors/derivationReducer.ts` (new) | Immutable reducer for all DerivationDocument mutations |
| `src/renderer/src/components/editors/DerivationEditor.tsx` (new) | Main editor: useReducer, auto-save, Ctrl+S, drag reorder, mini DAG, node list |
| `src/renderer/src/components/editors/DerivationEditor.css` (new) | Styles: node cards, mini DAG, drag states, save status |
| `src/renderer/src/components/NoteViewport.tsx` (modify) | Replace DerivationRenderer with DerivationEditor in derive case |
| `tests/renderer/derivationReducer.test.ts` (new) | Unit tests for all reducer actions |
| `tests/renderer/DerivationEditor.test.tsx` (new) | Component tests for rendering, input handling, save dispatch |

---

### Task 1: derivationReducer

**Files:**
- Create: `src/renderer/src/components/editors/derivationReducer.ts`

- [ ] **Step 1: Write the derivationReducer with all actions**

```typescript
import type { DerivationDocument, DerivationNode } from '../../../../main/schemas/note-types'
import { createDerivationNode } from '../../../../main/schemas/note-types'

export interface DerivationAction {
  type: string
  id?: string
  field?: 'title' | 'content'
  value?: string
  nodeId?: string
  parentId?: string | null
  afterStepNumber?: number
  fromIndex?: number
  toIndex?: number
  document?: DerivationDocument
}

function cloneDoc(doc: DerivationDocument): DerivationDocument {
  return {
    ...doc,
    nodes: doc.nodes.map((n) => ({ ...n, embedRefs: [...n.embedRefs], codeMappings: [...n.codeMappings], derivesTo: [...n.derivesTo] }))
  }
}

function getDescendantIds(nodes: DerivationNode[], nodeId: string): Set<string> {
  const desc = new Set<string>()
  const stack = [nodeId]
  while (stack.length > 0) {
    const current = stack.pop()!
    const children = nodes.filter((n) => n.derivesFrom === current)
    for (const child of children) {
      if (!desc.has(child.id)) {
        desc.add(child.id)
        stack.push(child.id)
      }
    }
  }
  return desc
}

function recalcStepNumbers(nodes: DerivationNode[]): DerivationNode[] {
  return nodes.map((n, i) => ({ ...n, stepNumber: i + 1 }))
}

function syncDerivesTo(nodes: DerivationNode[]): DerivationNode[] {
  return nodes.map((n) => ({
    ...n,
    derivesTo: nodes.filter((other) => other.derivesFrom === n.id).map((other) => other.id)
  }))
}

export function derivationReducer(doc: DerivationDocument, action: DerivationAction): DerivationDocument {
  switch (action.type) {

    case 'SET_DOCUMENT':
      return cloneDoc(action.document!)

    case 'UPDATE_NODE': {
      const cloned = cloneDoc(doc)
      const node = cloned.nodes.find((n) => n.id === action.id!)
      if (node && action.field) {
        ;(node as Record<string, unknown>)[action.field] = action.value!
      }
      return cloned
    }

    case 'SET_DERIVES_FROM': {
      if (action.nodeId === action.parentId) return doc

      // Prevent cycles: reject if new parent is a descendant of this node
      if (action.parentId) {
        const descendants = getDescendantIds(doc.nodes, action.nodeId!)
        if (descendants.has(action.parentId)) return doc
      }

      const cloned = cloneDoc(doc)
      const node = cloned.nodes.find((n) => n.id === action.nodeId!)
      if (node) {
        node.derivesFrom = action.parentId ?? null
      }
      return syncDerivesTo(cloned)
    }

    case 'ADD_NODE': {
      const afterStep = action.afterStepNumber ?? 0
      const newNode = createDerivationNode('New Step')
      const cloned = cloneDoc(doc)
      cloned.nodes.splice(afterStep, 0, newNode)
      return syncDerivesTo(recalcStepNumbers(cloned.nodes))
    }

    case 'DELETE_NODE': {
      const cloned = cloneDoc(doc)
      const nodeToDelete = cloned.nodes.find((n) => n.id === action.id!)
      if (!nodeToDelete) return doc

      cloned.nodes = cloned.nodes.filter((n) => n.id !== action.id!)
      // Clear derivesFrom for children
      cloned.nodes = cloned.nodes.map((n) =>
        n.derivesFrom === action.id! ? { ...n, derivesFrom: null } : n
      )
      return syncDerivesTo(recalcStepNumbers(cloned.nodes))
    }

    case 'REORDER_NODES': {
      if (action.fromIndex === undefined || action.toIndex === undefined) return doc
      if (action.fromIndex === action.toIndex) return doc
      if (action.fromIndex < 0 || action.toIndex < 0) return doc
      if (action.fromIndex >= doc.nodes.length || action.toIndex >= doc.nodes.length) return doc

      const cloned = cloneDoc(doc)
      const [moved] = cloned.nodes.splice(action.fromIndex, 1)
      cloned.nodes.splice(action.toIndex, 0, moved)
      return syncDerivesTo(recalcStepNumbers(cloned.nodes))
    }

    default:
      return doc
  }
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc -p tsconfig.node.json --noEmit
```

Expected: clean (no new errors from this file)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/editors/derivationReducer.ts
git commit -m "feat: add derivationReducer for DerivationDocument mutations"
```

---

### Task 2: derivationReducer Tests

**Files:**
- Create: `tests/renderer/derivationReducer.test.ts`

- [ ] **Step 1: Write the reducer test file**

```typescript
import { describe, it, expect } from 'vitest'
import { derivationReducer } from '../../src/renderer/src/components/editors/derivationReducer'
import type { DerivationAction } from '../../src/renderer/src/components/editors/derivationReducer'
import type { DerivationDocument } from '../../src/main/schemas/note-types'

function makeDoc(): DerivationDocument {
  return {
    type: 'derive',
    version: 1,
    nodes: [
      {
        id: 'n1',
        title: 'Problem Setup',
        content: '\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\varepsilon_0}',
        stepNumber: 1,
        derivesFrom: null,
        derivesTo: ['n2'],
        embedRefs: [],
        codeMappings: []
      },
      {
        id: 'n2',
        title: 'Derivation',
        content: '\\oint \\mathbf{E} \\cdot d\\mathbf{A}',
        stepNumber: 2,
        derivesFrom: 'n1',
        derivesTo: ['n3'],
        embedRefs: [],
        codeMappings: []
      },
      {
        id: 'n3',
        title: 'Result',
        content: '\\nabla \\cdot \\mathbf{E} = 0',
        stepNumber: 3,
        derivesFrom: 'n2',
        derivesTo: [],
        embedRefs: [],
        codeMappings: []
      }
    ]
  }
}

function dispatch(doc: DerivationDocument, action: DerivationAction): DerivationDocument {
  return derivationReducer(doc, action)
}

describe('derivationReducer', () => {
  describe('SET_DOCUMENT', () => {
    it('replaces the entire document', () => {
      const old = makeDoc()
      const fresh = { type: 'derive' as const, version: 1 as const, nodes: [] }
      const result = dispatch(old, { type: 'SET_DOCUMENT', document: fresh })
      expect(result.nodes.length).toBe(0)
    })
  })

  describe('UPDATE_NODE', () => {
    it('updates title of a node', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'UPDATE_NODE', id: 'n1', field: 'title', value: 'New Title' })
      expect(result.nodes[0].title).toBe('New Title')
    })

    it('updates content of a node', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'UPDATE_NODE', id: 'n2', field: 'content', value: '\\frac{1}{2}' })
      expect(result.nodes[1].content).toBe('\\frac{1}{2}')
    })
  })

  describe('SET_DERIVES_FROM', () => {
    it('changes the parent of a node', () => {
      // Make n3 derive directly from n1 instead of n2
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'SET_DERIVES_FROM', nodeId: 'n3', parentId: 'n1' })
      const n3 = result.nodes.find((n) => n.id === 'n3')!
      expect(n3.derivesFrom).toBe('n1')
    })

    it('sets derivesFrom to null (root node)', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'SET_DERIVES_FROM', nodeId: 'n2', parentId: null })
      const n2 = result.nodes.find((n) => n.id === 'n2')!
      expect(n2.derivesFrom).toBeNull()
    })

    it('syncs derivesTo on the new parent', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'SET_DERIVES_FROM', nodeId: 'n3', parentId: 'n1' })
      const n1 = result.nodes.find((n) => n.id === 'n1')!
      expect(n1.derivesTo).toContain('n3')
    })

    it('removes derivesTo from the old parent', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'SET_DERIVES_FROM', nodeId: 'n3', parentId: 'n1' })
      const n2 = result.nodes.find((n) => n.id === 'n2')!
      expect(n2.derivesTo).not.toContain('n3')
    })

    it('rejects setting parent to self', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'SET_DERIVES_FROM', nodeId: 'n1', parentId: 'n1' })
      expect(result).toEqual(doc)
    })

    it('rejects cycles (setting n1 to derive from n3)', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'SET_DERIVES_FROM', nodeId: 'n1', parentId: 'n3' })
      expect(result).toEqual(doc)
    })
  })

  describe('ADD_NODE', () => {
    it('adds a node at the end', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'ADD_NODE', afterStepNumber: 3 })
      expect(result.nodes.length).toBe(4)
      expect(result.nodes[3].stepNumber).toBe(4)
      expect(result.nodes[3].title).toBe('New Step')
    })

    it('adds a node in the middle', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'ADD_NODE', afterStepNumber: 1 })
      expect(result.nodes.length).toBe(4)
      expect(result.nodes[1].stepNumber).toBe(2)
      expect(result.nodes[2].stepNumber).toBe(3)
    })

    it('adds a node at the beginning', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'ADD_NODE', afterStepNumber: 0 })
      expect(result.nodes.length).toBe(4)
      expect(result.nodes[0].stepNumber).toBe(1)
      expect(result.nodes[0].title).toBe('New Step')
    })

    it('recalculates all step numbers', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'ADD_NODE', afterStepNumber: 1 })
      expect(result.nodes[0].stepNumber).toBe(1)
      expect(result.nodes[1].stepNumber).toBe(2)
      expect(result.nodes[2].stepNumber).toBe(3)
      expect(result.nodes[3].stepNumber).toBe(4)
    })
  })

  describe('DELETE_NODE', () => {
    it('deletes a node', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'DELETE_NODE', id: 'n2' })
      expect(result.nodes.length).toBe(2)
    })

    it('sets derivesFrom to null for children of deleted node', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'DELETE_NODE', id: 'n2' })
      const n3 = result.nodes.find((n) => n.id === 'n3')!
      expect(n3.derivesFrom).toBeNull()
    })

    it('recalculates step numbers after delete', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'DELETE_NODE', id: 'n1' })
      expect(result.nodes[0].stepNumber).toBe(1)
      expect(result.nodes[1].stepNumber).toBe(2)
    })

    it('does nothing for non-existent node', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'DELETE_NODE', id: 'nonexistent' })
      expect(result.nodes.length).toBe(3)
    })
  })

  describe('REORDER_NODES', () => {
    it('moves a node from one position to another', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'REORDER_NODES', fromIndex: 0, toIndex: 2 })
      expect(result.nodes[0].id).toBe('n2')
      expect(result.nodes[1].id).toBe('n3')
      expect(result.nodes[2].id).toBe('n1')
    })

    it('recalculates step numbers after reorder', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'REORDER_NODES', fromIndex: 2, toIndex: 0 })
      expect(result.nodes[0].stepNumber).toBe(1)
      expect(result.nodes[1].stepNumber).toBe(2)
      expect(result.nodes[2].stepNumber).toBe(3)
    })

    it('does nothing for out-of-bounds indices', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'REORDER_NODES', fromIndex: 0, toIndex: 99 })
      expect(result).toEqual(doc)
    })

    it('does nothing when fromIndex equals toIndex', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'REORDER_NODES', fromIndex: 1, toIndex: 1 })
      expect(result).toEqual(doc)
    })
  })

  describe('immutability', () => {
    it('does not mutate original document on UPDATE_NODE', () => {
      const original = makeDoc()
      const originalJson = JSON.stringify(original)
      dispatch(original, { type: 'UPDATE_NODE', id: 'n1', field: 'title', value: 'Changed' })
      expect(JSON.stringify(original)).toBe(originalJson)
    })

    it('does not mutate original document on DELETE_NODE', () => {
      const original = makeDoc()
      const originalJson = JSON.stringify(original)
      dispatch(original, { type: 'DELETE_NODE', id: 'n2' })
      expect(JSON.stringify(original)).toBe(originalJson)
    })

    it('does not mutate original document on ADD_NODE', () => {
      const original = makeDoc()
      const originalJson = JSON.stringify(original)
      dispatch(original, { type: 'ADD_NODE', afterStepNumber: 1 })
      expect(JSON.stringify(original)).toBe(originalJson)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail (reducer not yet committed)**

```bash
npx vitest run tests/renderer/derivationReducer.test.ts
```

Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add tests/renderer/derivationReducer.test.ts
git commit -m "test: add derivationReducer unit tests"
```

---

### Task 3: DerivationEditor.css

**Files:**
- Create: `src/renderer/src/components/editors/DerivationEditor.css`

- [ ] **Step 1: Write the CSS file**

```css
.derivation-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.derivation-editor-mini-dag {
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--header-bg);
  overflow-x: auto;
  white-space: nowrap;
}

.derivation-editor-mini-dag-empty {
  font-size: 11px;
  color: var(--placeholder-color);
  text-align: center;
  padding: 8px 0;
}

.mini-dag-row {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
  padding: 2px 0;
}

.mini-dag-pill {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 3px 10px;
  font-size: 11px;
  color: var(--accent-color);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}

.mini-dag-pill:hover {
  background: rgba(255, 255, 255, 0.12);
}

.mini-dag-connector {
  color: var(--placeholder-color);
  font-size: 11px;
  user-select: none;
}

.mini-dag-branch-connector {
  color: var(--placeholder-color);
  font-size: 11px;
  user-select: none;
  text-align: center;
}

.derivation-editor-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.derivation-editor-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--placeholder-color);
  gap: 8px;
}

.derivation-editor-empty p {
  font-size: 13px;
}

.derive-node-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 10px 12px;
  transition: border-color 0.15s;
}

.derive-node-card:hover {
  border-color: rgba(255, 255, 255, 0.15);
}

.derive-node-card.dragging {
  opacity: 0.4;
}

.derive-node-card.drag-over {
  border-top: 2px solid var(--accent-color);
}

.derive-node-card-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.derive-step-badge {
  background: var(--accent-color);
  color: #fff;
  border-radius: 50%;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 11px;
  cursor: grab;
  flex-shrink: 0;
  user-select: none;
}

.derive-step-badge:active {
  cursor: grabbing;
}

.derive-title-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-color);
  border-radius: 3px;
  padding: 4px 8px;
  color: var(--text-color);
  font-size: 12px;
  outline: none;
  min-width: 0;
}

.derive-title-input:focus {
  border-color: var(--accent-color);
}

.derive-derives-from-select {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-color);
  border-radius: 3px;
  padding: 3px 6px;
  color: var(--placeholder-color);
  font-size: 10px;
  outline: none;
  max-width: 160px;
}

.derive-derives-from-select:focus {
  border-color: var(--accent-color);
}

.derive-delete-btn {
  background: none;
  border: none;
  color: var(--placeholder-color);
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  border-radius: 3px;
  flex-shrink: 0;
}

.derive-delete-btn:hover {
  color: #e44;
  background: rgba(255, 0, 0, 0.1);
}

.derive-content-textarea {
  width: 100%;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-color);
  border-radius: 3px;
  padding: 6px 8px;
  color: var(--text-color);
  font-size: 12px;
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
  min-height: 36px;
}

.derive-content-textarea:focus {
  border-color: var(--accent-color);
}

.derive-katex-preview {
  margin-top: 4px;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
  font-size: 14px;
  color: #ce9178;
  overflow-x: auto;
  min-height: 20px;
}

.derive-katex-preview.katex-error {
  color: #e44;
  font-family: monospace;
  font-size: 11px;
}

.derive-katex-collapse-btn {
  background: none;
  border: none;
  color: var(--placeholder-color);
  cursor: pointer;
  font-size: 10px;
  padding: 2px 4px;
  margin-top: 2px;
}

.derive-katex-collapse-btn:hover {
  color: var(--text-color);
}

.derive-inline-add {
  text-align: center;
  margin: -2px 0;
}

.derive-inline-add-btn {
  background: rgba(255, 255, 255, 0.03);
  border: 1px dashed var(--border-color);
  border-radius: 50%;
  width: 24px;
  height: 24px;
  color: var(--placeholder-color);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0;
  opacity: 0;
  transition: opacity 0.15s;
}

.derive-node-card:hover + .derive-inline-add .derive-inline-add-btn,
.derive-inline-add:hover .derive-inline-add-btn {
  opacity: 1;
}

.derive-inline-add-btn:hover {
  color: var(--accent-color);
  border-color: var(--accent-color);
}

.derivation-editor-bottom-actions {
  padding: 8px 16px;
  border-top: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
}

.derive-add-btn {
  padding: 6px 16px;
  font-size: 11px;
  border: 1px solid var(--accent-color);
  border-radius: 4px;
  background: var(--accent-color);
  color: #fff;
  cursor: pointer;
}

.derive-add-btn:hover {
  opacity: 0.85;
}

.derivation-editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border-color);
  background: var(--header-bg);
}

.derivation-editor-save-status {
  padding: 2px 10px;
  font-size: 11px;
  border-radius: 3px;
}

.derive-save-status-saved {
  color: #6e6e6e;
}

.derive-save-status-saving {
  color: var(--accent-color);
}

.derive-save-status-unsaved {
  color: #cca700;
}

.derive-save-status-error {
  color: #e44;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/editors/DerivationEditor.css
git commit -m "feat: add DerivationEditor styles"
```

---

### Task 4: DerivationEditor Component

**Files:**
- Create: `src/renderer/src/components/editors/DerivationEditor.tsx`

- [ ] **Step 1: Write the DerivationEditor component**

```typescript
import { useReducer, useCallback, useEffect, useRef, useState } from 'react'
import katex from 'katex'
import type { DerivationDocument, DerivationNode } from '../../../../main/schemas/note-types'
import './DerivationEditor.css'
import { derivationReducer } from './derivationReducer'
import type { DerivationAction } from './derivationReducer'

interface DerivationEditorProps {
  document: DerivationDocument
  onSave: (doc: DerivationDocument) => Promise<void>
  codeRepoPath: string | null
}

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'

function buildMiniDag(nodes: DerivationNode[]): { rows: DerivationNode[][]; connectors: string[][] } {
  if (nodes.length === 0) return { rows: [], connectors: [] }

  // Group nodes by depth in the DAG (longest path from a root)
  const depthMap = new Map<string, number>()

  function getDepth(nodeId: string): number {
    if (depthMap.has(nodeId)) return depthMap.get(nodeId)!
    const node = nodes.find((n) => n.id === nodeId)
    if (!node || !node.derivesFrom) {
      depthMap.set(nodeId, 0)
      return 0
    }
    const depth = getDepth(node.derivesFrom) + 1
    depthMap.set(nodeId, depth)
    return depth
  }

  for (const node of nodes) {
    getDepth(node.id)
  }

  const maxDepth = Math.max(...Array.from(depthMap.values()), 0)
  const rows: DerivationNode[][] = Array.from({ length: maxDepth + 1 }, () => [])

  for (const node of nodes) {
    const depth = depthMap.get(node.id) ?? 0
    rows[depth].push(node)
  }

  // Build connectors between rows
  const connectors: string[][] = []
  for (let d = 0; d < rows.length - 1; d++) {
    const connRow: string[] = []
    for (const parent of rows[d]) {
      const children = nodes.filter((n) => n.derivesFrom === parent.id)
      if (children.length === 1) {
        connRow.push('→')
      } else if (children.length > 1) {
        connRow.push('↘...↙')
      }
    }
    connectors.push(connRow)
  }

  return { rows, connectors }
}

export function DerivationEditor({ document: initialDoc, onSave, codeRepoPath }: DerivationEditorProps) {
  const [doc, dispatch] = useReducer(derivationReducer, initialDoc)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [collapsedPreviews, setCollapsedPreviews] = useState<Set<string>>(new Set())
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const oldDocRef = useRef(doc)
  const katexTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Reset when opening a different document
  useEffect(() => {
    dispatch({ type: 'SET_DOCUMENT', document: initialDoc })
    oldDocRef.current = initialDoc
    setCollapsedPreviews(new Set())
  }, [initialDoc])

  // Auto-save with 300ms debounce
  useEffect(() => {
    if (doc === oldDocRef.current) return
    oldDocRef.current = doc

    setSaveStatus('unsaved')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving')
      try {
        await onSave(doc)
        setSaveStatus('saved')
      } catch {
        setSaveStatus('error')
      }
    }, 300)
  }, [doc, onSave])

  // Ctrl+S immediate save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        setSaveStatus('saving')
        onSave(doc).then(() => setSaveStatus('saved')).catch(() => setSaveStatus('error'))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [doc, onSave])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      for (const timer of katexTimersRef.current.values()) {
        clearTimeout(timer)
      }
    }
  }, [])

  const miniDag = buildMiniDag(doc.nodes)

  // Build cycle-safe dropdown options for a node
  const getDerivesFromOptions = (nodeId: string) => {
    const descendants = new Set<string>()
    const stack = [nodeId]
    while (stack.length > 0) {
      const current = stack.pop()!
      const children = doc.nodes.filter((n) => n.derivesFrom === current)
      for (const child of children) {
        if (!descendants.has(child.id)) {
          descendants.add(child.id)
          stack.push(child.id)
        }
      }
    }
    return doc.nodes.filter((n) => n.id !== nodeId && !descendants.has(n.id))
  }

  const handleDragStart = (index: number) => {
    setDragIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDrop = (index: number) => {
    if (dragIndex !== null && dragIndex !== index) {
      dispatch({ type: 'REORDER_NODES', fromIndex: dragIndex, toIndex: index })
    }
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const handleDeleteNode = (nodeId: string) => {
    const node = doc.nodes.find((n) => n.id === nodeId)
    const childCount = doc.nodes.filter((n) => n.derivesFrom === nodeId).length
    if (childCount > 0) {
      if (!window.confirm(`${childCount} step(s) derive from this step. Delete anyway?`)) return
    }
    dispatch({ type: 'DELETE_NODE', id: nodeId })
  }

  const togglePreview = (nodeId: string) => {
    setCollapsedPreviews((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }

  const saveStatusClass =
    saveStatus === 'saved' ? 'derive-save-status-saved' :
    saveStatus === 'saving' ? 'derive-save-status-saving' :
    saveStatus === 'unsaved' ? 'derive-save-status-unsaved' :
    'derive-save-status-error'

  // Empty state
  if (doc.nodes.length === 0) {
    return (
      <div className="derivation-editor">
        <div className="derivation-editor-toolbar">
          <span className="derivation-editor-save-status">Derivation</span>
          <span className={`derivation-editor-save-status ${saveStatusClass}`}>
            {saveStatus === 'saved' ? 'Saved' :
             saveStatus === 'saving' ? 'Saving...' :
             saveStatus === 'unsaved' ? 'Unsaved' :
             'Error'}
          </span>
        </div>
        <div className="derivation-editor-empty">
          <p>Add your first derivation step</p>
          <button className="derive-add-btn" onClick={() => dispatch({ type: 'ADD_NODE', afterStepNumber: 0 })}>
            + Add Step
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="derivation-editor">
      <div className="derivation-editor-toolbar">
        <span className="derivation-editor-save-status">Derivation</span>
        <span className={`derivation-editor-save-status ${saveStatusClass}`}>
          {saveStatus === 'saved' ? 'Saved' :
           saveStatus === 'saving' ? 'Saving...' :
           saveStatus === 'unsaved' ? 'Unsaved' :
           'Error'}
        </span>
      </div>

      {/* Mini DAG */}
      <div className="derivation-editor-mini-dag">
        {miniDag.rows.length === 0 ? (
          <div className="derivation-editor-mini-dag-empty">No derivation steps</div>
        ) : (
          miniDag.rows.map((row, depth) => (
            <div key={depth}>
              <div className="mini-dag-row">
                {row.map((node) => (
                  <span
                    key={node.id}
                    className="mini-dag-pill"
                    onClick={() => {
                      const el = document.getElementById(`derive-node-${node.id}`)
                      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    }}
                  >
                    {node.stepNumber}. {node.title || 'Untitled'}
                  </span>
                ))}
              </div>
              {depth < miniDag.rows.length - 1 && (
                <div className="mini-dag-row">
                  {miniDag.connectors[depth]?.map((conn, i) => (
                    <span key={i} className="mini-dag-connector">{conn}</span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Node list */}
      <div className="derivation-editor-list">
        {doc.nodes.map((node, index) => (
          <div key={node.id}>
            {index === dragOverIndex && dragIndex !== null && dragIndex > index && (
              <div style={{ height: 4, background: 'var(--accent-color)', borderRadius: 2, margin: '0 0 4px 0', opacity: 0.6 }} />
            )}
            <div
              id={`derive-node-${node.id}`}
              className={`derive-node-card${dragIndex === index ? ' dragging' : ''}`}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={() => handleDrop(index)}
              onDragEnd={handleDragEnd}
            >
              <div className="derive-node-card-row">
                <div className="derive-step-badge" title="Drag to reorder">
                  {node.stepNumber}
                </div>
                <input
                  className="derive-title-input"
                  value={node.title}
                  onChange={(e) => dispatch({ type: 'UPDATE_NODE', id: node.id, field: 'title', value: e.target.value })}
                  placeholder="Step title"
                />
                <select
                  className="derive-derives-from-select"
                  value={node.derivesFrom ?? ''}
                  onChange={(e) =>
                    dispatch({ type: 'SET_DERIVES_FROM', nodeId: node.id, parentId: e.target.value || null })
                  }
                >
                  <option value="">Derives from: (none)</option>
                  {getDerivesFromOptions(node.id).map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.stepNumber}. {opt.title || 'Untitled'}
                    </option>
                  ))}
                </select>
                <button className="derive-delete-btn" onClick={() => handleDeleteNode(node.id)} title="Delete step">
                  ✕
                </button>
              </div>
              <textarea
                className="derive-content-textarea"
                value={node.content}
                onChange={(e) => dispatch({ type: 'UPDATE_NODE', id: node.id, field: 'content', value: e.target.value })}
                placeholder="LaTeX formula or text..."
                rows={2}
              />
              {node.content && !collapsedPreviews.has(node.id) && (
                <div className="derive-katex-preview" key={`preview-${node.id}`}>
                  <KatexPreview latex={node.content} />
                </div>
              )}
              {node.content && (
                <button className="derive-katex-collapse-btn" onClick={() => togglePreview(node.id)}>
                  {collapsedPreviews.has(node.id) ? 'Show preview' : 'Hide preview'}
                </button>
              )}
            </div>
            {/* Inline add button between nodes */}
            <div className="derive-inline-add">
              <button
                className="derive-inline-add-btn"
                title="Insert step here"
                onClick={() => dispatch({ type: 'ADD_NODE', afterStepNumber: index + 1 })}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom add button */}
      <div className="derivation-editor-bottom-actions">
        <button className="derive-add-btn" onClick={() => dispatch({ type: 'ADD_NODE', afterStepNumber: doc.nodes.length })}>
          + Add Step
        </button>
      </div>
    </div>
  )
}

// Separate component for KaTeX to keep DerivationEditor focused
function KatexPreview({ latex }: { latex: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    try {
      katex.render(latex, containerRef.current, { throwOnError: false, displayMode: false })
      setError(null)
    } catch (err) {
      setError(String(err))
    }
  }, [latex])

  if (error) {
    return <span className="katex-error">{error}</span>
  }

  return <div ref={containerRef} />
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc -p tsconfig.node.json --noEmit
```

Expected: clean (no new errors)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/editors/DerivationEditor.tsx
git commit -m "feat: add DerivationEditor component with auto-save and mini DAG"
```

---

### Task 5: Wire into NoteViewport

**Files:**
- Modify: `src/renderer/src/components/NoteViewport.tsx`

- [ ] **Step 1: Replace DerivationRenderer with DerivationEditor**

In `src/renderer/src/components/NoteViewport.tsx`, change the import statement (around line 7):

```typescript
// Add this import alongside the existing DerivationRenderer import
import { DerivationEditor } from './editors/DerivationEditor'
```

Keep the existing `DerivationRenderer` import (it might be used elsewhere, and we keep it for the read-only use case).

Then replace the `case 'derive'` block (lines 148-153):

```typescript
      case 'derive':
        return (
          <DerivationEditor
            document={activeNoteContent as DerivationDocument}
            onSave={async (doc: DerivationDocument) => {
              await saveNote(selectedNoteId, doc)
            }}
            codeRepoPath={state.codeRepoPath}
          />
        )
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc -p tsconfig.node.json --noEmit
```

Expected: clean

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/NoteViewport.tsx
git commit -m "feat: wire DerivationEditor into NoteViewport for derive notes"
```

---

### Task 6: DerivationEditor Component Tests

**Files:**
- Create: `tests/renderer/DerivationEditor.test.tsx`

- [ ] **Step 1: Write the component test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DerivationEditor } from '../../src/renderer/src/components/editors/DerivationEditor'
import type { DerivationDocument } from '../../src/main/schemas/note-types'

function makeDoc(): DerivationDocument {
  return {
    type: 'derive',
    version: 1,
    nodes: [
      {
        id: 'n1',
        title: 'Setup',
        content: 'x = 1',
        stepNumber: 1,
        derivesFrom: null,
        derivesTo: ['n2'],
        embedRefs: [],
        codeMappings: []
      },
      {
        id: 'n2',
        title: 'Derive',
        content: 'x = 2',
        stepNumber: 2,
        derivesFrom: 'n1',
        derivesTo: [],
        embedRefs: [],
        codeMappings: []
      }
    ]
  }
}

describe('DerivationEditor', () => {
  let onSave: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onSave = vi.fn().mockResolvedValue(undefined)
  })

  it('renders all nodes', () => {
    render(<DerivationEditor document={makeDoc()} onSave={onSave} codeRepoPath={null} />)
    expect(screen.getByDisplayValue('Setup')).toBeTruthy()
    expect(screen.getByDisplayValue('Derive')).toBeTruthy()
  })

  it('renders step number badges', () => {
    render(<DerivationEditor document={makeDoc()} onSave={onSave} codeRepoPath={null} />)
    expect(screen.getByText('1')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('shows empty state when no nodes', () => {
    render(<DerivationEditor document={{ type: 'derive', version: 1, nodes: [] }} onSave={onSave} codeRepoPath={null} />)
    expect(screen.getByText('Add your first derivation step')).toBeTruthy()
  })

  it('adds a node when + Add Step button is clicked (empty state)', () => {
    render(<DerivationEditor document={{ type: 'derive', version: 1, nodes: [] }} onSave={onSave} codeRepoPath={null} />)
    const btn = screen.getByText('+ Add Step')
    fireEvent.click(btn)
    expect(screen.getByDisplayValue('New Step')).toBeTruthy()
  })

  it('adds a node at the end when bottom + Add Step is clicked', () => {
    render(<DerivationEditor document={makeDoc()} onSave={onSave} codeRepoPath={null} />)
    const buttons = screen.getAllByText('+ Add Step')
    fireEvent.click(buttons[0])
    expect(screen.getByDisplayValue('New Step')).toBeTruthy()
  })

  it('updates title on input change', () => {
    render(<DerivationEditor document={makeDoc()} onSave={onSave} codeRepoPath={null} />)
    const input = screen.getByDisplayValue('Setup')
    fireEvent.change(input, { target: { value: 'New Setup' } })
    expect(screen.getByDisplayValue('New Setup')).toBeTruthy()
  })

  it('updates content on textarea change', () => {
    render(<DerivationEditor document={makeDoc()} onSave={onSave} codeRepoPath={null} />)
    const textarea = screen.getByDisplayValue('x = 1')
    fireEvent.change(textarea, { target: { value: 'y = 3' } })
    expect(screen.getByDisplayValue('y = 3')).toBeTruthy()
  })

  it('triggers auto-save after editing', async () => {
    vi.useFakeTimers()
    render(<DerivationEditor document={makeDoc()} onSave={onSave} codeRepoPath={null} />)
    const input = screen.getByDisplayValue('Setup')
    fireEvent.change(input, { target: { value: 'Changed' } })
    expect(screen.getByText('Unsaved')).toBeTruthy()
    vi.advanceTimersByTime(300)
    await vi.runAllTimersAsync()
    expect(onSave).toHaveBeenCalledTimes(1)
    const savedDoc = onSave.mock.calls[0][0] as DerivationDocument
    expect(savedDoc.nodes[0].title).toBe('Changed')
    vi.useRealTimers()
  })

  it('deletes a node when delete button is clicked', () => {
    window.confirm = vi.fn().mockReturnValue(true)
    render(<DerivationEditor document={makeDoc()} onSave={onSave} codeRepoPath={null} />)
    const deleteButtons = screen.getAllByTitle('Delete step')
    fireEvent.click(deleteButtons[0])
    expect(screen.queryByDisplayValue('Setup')).toBeNull()
  })

  it('updates save status display', () => {
    render(<DerivationEditor document={makeDoc()} onSave={onSave} codeRepoPath={null} />)
    expect(screen.getByText('Saved')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run component tests**

```bash
npx vitest run tests/renderer/DerivationEditor.test.tsx
```

Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add tests/renderer/DerivationEditor.test.tsx
git commit -m "test: add DerivationEditor component tests"
```

---

### Task 7: Run Full Test Suite

**Files:** (none — verification only)

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: all previously passing tests still pass, new tests pass too

- [ ] **Step 2: Build check**

```bash
npm run build
```

Expected: all 3 bundles build successfully

- [ ] **Step 3: Commit any remaining changes**

Not needed if all steps above committed cleanly.
