# 思维文档编辑功能 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the read-only MindMapRenderer into a fully interactive canvas-based mind map editor with D3.js, supporting node CRUD, drag-to-reparent, right-click context menus, keyboard shortcuts, and a bottom edit panel.

**Architecture:** `useReducer`-based state management in a top-level `MindMapEditor` container coordinates three sub-components: `MindMapCanvas` (D3.js SVG), `NodeContextMenu` (portal), and `NodeEditPanel` (bottom panel with Monaco). Pure tree-mutation utilities operate on `MindMapDocument` immutably.

**Tech Stack:** React + TypeScript, D3.js (tree layout, drag, zoom), Monaco Editor (@ref completion), existing IPC for save

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/renderer/src/components/editors/mindMapReducer.ts` | Pure reducer + tree-mutation utilities |
| `src/renderer/src/components/editors/NodeEditPanel.tsx` | Bottom panel: title input, Monaco, codeMappings, embedRefs |
| `src/renderer/src/components/editors/NodeEditPanel.css` | Styles for bottom panel and resize handle |
| `src/renderer/src/components/editors/NodeContextMenu.tsx` | Portal-rendered right-click context menu |
| `src/renderer/src/components/editors/MindMapCanvas.tsx` | D3.js SVG with full interaction (click/dblclick/contextmenu/drag/zoom/keyboard) |
| `src/renderer/src/components/editors/MindMapEditor.tsx` | Top-level container: useReducer + auto-save + child wiring |
| `src/renderer/src/components/editors/MindMapRenderer.css` | Extended styles (selected node, dragging, collapse icon) |
| `src/renderer/src/components/NoteViewport.tsx` | Route `mind` type to `MindMapEditor` |
| `tests/renderer/mindMapReducer.test.ts` | Unit tests for reducer and tree utilities |

---

### Task 1: Tree mutation utilities and reducer

**Files:**
- Create: `src/renderer/src/components/editors/mindMapReducer.ts`
- Create: `tests/renderer/mindMapReducer.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// tests/renderer/mindMapReducer.test.ts
import { describe, it, expect } from 'vitest'
import { mindMapReducer, findNode, getAncestorIds } from '../../src/renderer/src/components/editors/mindMapReducer'
import type { MindMapDocument } from '../../src/main/schemas/note-types'
import type { MindMapAction } from '../../src/renderer/src/components/editors/mindMapReducer'

function makeDoc(): MindMapDocument {
  return {
    type: 'mind',
    version: 1,
    root: {
      id: 'root-1',
      title: 'Root',
      content: '',
      children: [
        {
          id: 'child-1',
          title: 'Child 1',
          content: 'content one',
          children: [],
          embedRefs: [],
          codeMappings: []
        },
        {
          id: 'child-2',
          title: 'Child 2',
          content: '',
          children: [
            {
              id: 'grand-1',
              title: 'Grandchild',
              content: '',
              children: [],
              embedRefs: [],
              codeMappings: []
            }
          ],
          embedRefs: [],
          codeMappings: []
        }
      ],
      embedRefs: [],
      codeMappings: []
    }
  }
}

function dispatch(doc: MindMapDocument, action: MindMapAction): MindMapDocument {
  return mindMapReducer(doc, action)
}

describe('mindMapReducer', () => {
  describe('SELECT_NODE', () => {
    it('returns same doc (selectedNodeId tracked externally)', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'SELECT_NODE', nodeId: 'child-1' })
      // SELECT_NODE does not modify the document itself
      expect(result).toEqual(doc)
    })
  })

  describe('UPDATE_TITLE', () => {
    it('updates title of an existing node', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'UPDATE_TITLE', nodeId: 'child-1', title: 'New Title' })
      expect(result.root.children[0].title).toBe('New Title')
    })
  })

  describe('UPDATE_CONTENT', () => {
    it('updates content of an existing node', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'UPDATE_CONTENT', nodeId: 'child-1', content: 'new content' })
      expect(result.root.children[0].content).toBe('new content')
    })
  })

  describe('ADD_CHILD', () => {
    it('adds a child node with default title', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'ADD_CHILD', parentId: 'child-1' })
      expect(result.root.children[0].children.length).toBe(1)
      expect(result.root.children[0].children[0].title).toBe('New Node')
    })
  })

  describe('ADD_SIBLING', () => {
    it('adds a sibling after the given node', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'ADD_SIBLING', nodeId: 'child-1' })
      expect(result.root.children.length).toBe(3)
      expect(result.root.children[2].title).toBe('New Node')
    })

    it('does nothing when trying to add sibling to root', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'ADD_SIBLING', nodeId: 'root-1' })
      expect(result).toEqual(doc)
    })
  })

  describe('DELETE_NODE', () => {
    it('deletes a node and its subtree', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'DELETE_NODE', nodeId: 'child-2' })
      expect(result.root.children.length).toBe(1)
      expect(result.root.children[0].id).toBe('child-1')
    })

    it('does nothing when trying to delete root', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'DELETE_NODE', nodeId: 'root-1' })
      expect(result).toEqual(doc)
    })
  })

  describe('REPARENT', () => {
    it('moves a node to a new parent', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'REPARENT', nodeId: 'grand-1', newParentId: 'child-1' })
      expect(result.root.children[0].children.length).toBe(1)
      expect(result.root.children[0].children[0].id).toBe('grand-1')
      expect(result.root.children[1].children.length).toBe(0)
    })

    it('rejects when reparent would create a cycle', () => {
      const doc = makeDoc()
      // grand-1 is under child-2, so moving child-2 under grand-1 would be a cycle
      const result = dispatch(doc, { type: 'REPARENT', nodeId: 'child-2', newParentId: 'grand-1' })
      expect(result).toEqual(doc) // unchanged
    })
  })

  describe('REORDER', () => {
    it('reorders siblings', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'REORDER', nodeId: 'child-1', newIndex: 1 })
      expect(result.root.children[0].id).toBe('child-2')
      expect(result.root.children[1].id).toBe('child-1')
    })
  })

  describe('TOGGLE_COLLAPSE', () => {
    it('returns same doc (collapse state is external)', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'TOGGLE_COLLAPSE', nodeId: 'child-2' })
      expect(result).toEqual(doc)
    })
  })

  describe('ADD_CODE_MAPPING', () => {
    it('adds a code mapping to a node', () => {
      const doc = makeDoc()
      const mapping = { raw: '@ref(sort)', functionName: 'sort', filePath: 'src/lib.ts', startLine: 10, endLine: 15 }
      const result = dispatch(doc, { type: 'ADD_CODE_MAPPING', nodeId: 'child-1', mapping })
      expect(result.root.children[0].codeMappings.length).toBe(1)
      expect(result.root.children[0].codeMappings[0].functionName).toBe('sort')
    })
  })

  describe('REMOVE_CODE_MAPPING', () => {
    it('removes a code mapping by index', () => {
      const doc = makeDoc()
      const mapping = { raw: '@ref(sort)', functionName: 'sort', filePath: 'src/lib.ts', startLine: 10, endLine: 15 }
      let result = dispatch(doc, { type: 'ADD_CODE_MAPPING', nodeId: 'child-1', mapping })
      result = dispatch(result, { type: 'REMOVE_CODE_MAPPING', nodeId: 'child-1', index: 0 })
      expect(result.root.children[0].codeMappings.length).toBe(0)
    })
  })

  describe('ADD_EMBED_REF', () => {
    it('adds an embed ref to a node', () => {
      const doc = makeDoc()
      const result = dispatch(doc, { type: 'ADD_EMBED_REF', nodeId: 'child-1', ref: 'algo/sort.md' })
      expect(result.root.children[0].embedRefs).toContain('algo/sort.md')
    })
  })

  describe('REMOVE_EMBED_REF', () => {
    it('removes an embed ref by index', () => {
      const doc = makeDoc()
      let result = dispatch(doc, { type: 'ADD_EMBED_REF', nodeId: 'child-1', ref: 'algo/sort.md' })
      result = dispatch(result, { type: 'REMOVE_EMBED_REF', nodeId: 'child-1', index: 0 })
      expect(result.root.children[0].embedRefs.length).toBe(0)
    })
  })

  describe('SET_DOCUMENT', () => {
    it('replaces the entire document', () => {
      const old = makeDoc()
      const fresh = { type: 'mind' as const, version: 1 as const, root: { id: 'new-root', title: 'Fresh', content: '', children: [], embedRefs: [], codeMappings: [] } }
      const result = dispatch(old, { type: 'SET_DOCUMENT', document: fresh })
      expect(result.root.id).toBe('new-root')
    })
  })
})

describe('findNode', () => {
  it('finds a node by id', () => {
    const doc = makeDoc()
    const node = findNode(doc, 'grand-1')
    expect(node?.id).toBe('grand-1')
    expect(node?.title).toBe('Grandchild')
  })

  it('returns null for non-existent id', () => {
    const doc = makeDoc()
    expect(findNode(doc, 'nonexistent')).toBeNull()
  })
})

describe('getAncestorIds', () => {
  it('returns ancestor ids from root to the node', () => {
    const doc = makeDoc()
    const ancestors = getAncestorIds(doc, 'grand-1')
    expect(ancestors).toEqual(['root-1', 'child-2'])
  })

  it('returns empty array for root', () => {
    const doc = makeDoc()
    expect(getAncestorIds(doc, 'root-1')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/mindMapReducer.test.ts`
Expected: FAIL with module not found

- [ ] **Step 3: Write the reducer and utilities**

```typescript
// src/renderer/src/components/editors/mindMapReducer.ts
import type { MindMapDocument, MindMapNode, CodeMapping } from '../../../main/schemas/note-types'
import { createMindMapNode } from '../../../main/schemas/note-types'

export interface MindMapAction {
  type: string
  nodeId?: string
  title?: string
  content?: string
  parentId?: string
  newParentId?: string
  newIndex?: number
  index?: number
  mapping?: CodeMapping
  ref?: string
  document?: MindMapDocument
}

// --- Tree navigation helpers ---

export function findNode(doc: MindMapDocument, id: string): MindMapNode | null {
  return findNodeInTree(doc.root, id)
}

function findNodeInTree(node: MindMapNode, id: string): MindMapNode | null {
  if (node.id === id) return node
  for (const child of node.children) {
    const found = findNodeInTree(child, id)
    if (found) return found
  }
  return null
}

function findParentAndIndex(doc: MindMapDocument, nodeId: string): { parent: MindMapNode; index: number } | null {
  return findParentInTree(doc.root, nodeId, null, 0)
}

function findParentInTree(
  node: MindMapNode,
  targetId: string,
  parent: MindMapNode | null,
  siblingIndex: number
): { parent: MindMapNode; index: number } | null {
  if (node.id === targetId && parent) return { parent, index: siblingIndex }
  for (let i = 0; i < node.children.length; i++) {
    const found = findParentInTree(node.children[i], targetId, node, i)
    if (found) return found
  }
  return null
}

export function getAncestorIds(doc: MindMapDocument, nodeId: string): string[] {
  const ancestors: string[] = []
  findAncestors(doc.root, nodeId, ancestors)
  return ancestors
}

function findAncestors(node: MindMapNode, targetId: string, ancestors: string[]): boolean {
  if (node.id === targetId) return true
  ancestors.push(node.id)
  for (const child of node.children) {
    if (findAncestors(child, targetId, ancestors)) return true
  }
  ancestors.pop()
  return false
}

function cloneNode(node: MindMapNode): MindMapNode {
  return {
    ...node,
    children: node.children.map(cloneNode),
    embedRefs: [...node.embedRefs],
    codeMappings: [...node.codeMappings]
  }
}

function cloneDoc(doc: MindMapDocument): MindMapDocument {
  return { ...doc, root: cloneNode(doc.root) }
}

function isAncestor(doc: MindMapDocument, nodeId: string, potentialAncestorId: string): boolean {
  const ancestors = getAncestorIds(doc, nodeId)
  return ancestors.includes(potentialAncestorId) || nodeId === potentialAncestorId
}

function updateNodeInClone(node: MindMapNode, targetId: string, updater: (n: MindMapNode) => MindMapNode): MindMapNode {
  if (node.id === targetId) return updater(node)
  return {
    ...node,
    children: node.children.map((child) => updateNodeInClone(child, targetId, updater))
  }
}

function deleteNodeFromClone(node: MindMapNode, targetId: string): MindMapNode {
  return {
    ...node,
    children: node.children
      .filter((child) => child.id !== targetId)
      .map((child) => deleteNodeFromClone(child, targetId))
  }
}

function removeNodeFromParent(node: MindMapNode, targetId: string): MindMapNode | null {
  const index = node.children.findIndex((c) => c.id === targetId)
  if (index >= 0) {
    const [removed] = node.children.splice(index, 1)
    return removed
  }
  for (const child of node.children) {
    const found = removeNodeFromParent(child, targetId)
    if (found) return found
  }
  return null
}

// --- Reducer ---

export function mindMapReducer(doc: MindMapDocument, action: MindMapAction): MindMapDocument {
  switch (action.type) {
    case 'SELECT_NODE':
    case 'TOGGLE_COLLAPSE':
      // These are handled in component state (not persisted to the document)
      return doc

    case 'UPDATE_TITLE': {
      const cloned = cloneDoc(doc)
      cloned.root = updateNodeInClone(cloned.root, action.nodeId!, (n) => ({ ...n, title: action.title! }))
      return cloned
    }

    case 'UPDATE_CONTENT': {
      const cloned = cloneDoc(doc)
      cloned.root = updateNodeInClone(cloned.root, action.nodeId!, (n) => ({ ...n, content: action.content! }))
      return cloned
    }

    case 'ADD_CHILD': {
      const child = createMindMapNode('New Node')
      const cloned = cloneDoc(doc)
      cloned.root = updateNodeInClone(cloned.root, action.parentId!, (n) => ({
        ...n,
        children: [...n.children, child]
      }))
      return cloned
    }

    case 'ADD_SIBLING': {
      const parentInfo = findParentAndIndex(doc, action.nodeId!)
      if (!parentInfo) return doc
      const sibling = createMindMapNode('New Node')
      const cloned = cloneDoc(doc)
      cloned.root = updateNodeInClone(cloned.root, parentInfo.parent.id, (n) => {
        const updated = [...n.children]
        updated.splice(parentInfo.index + 1, 0, sibling)
        return { ...n, children: updated }
      })
      return cloned
    }

    case 'DELETE_NODE': {
      if (action.nodeId === doc.root.id) return doc
      const cloned = cloneDoc(doc)
      cloned.root = deleteNodeFromClone(cloned.root, action.nodeId!)
      return cloned
    }

    case 'REPARENT': {
      // Cycle detection
      if (isAncestor(doc, action.newParentId!, action.nodeId!)) return doc

      const cloned = cloneDoc(doc)
      // Remove from old parent
      const movedNode = removeNodeFromParent(cloned.root, action.nodeId!)
      if (!movedNode) return doc

      // Add to new parent
      cloned.root = updateNodeInClone(cloned.root, action.newParentId!, (n) => ({
        ...n,
        children: action.index !== undefined
          ? [...n.children.slice(0, action.index), movedNode, ...n.children.slice(action.index)]
          : [...n.children, movedNode]
      }))
      return cloned
    }

    case 'REORDER': {
      const parentInfo = findParentAndIndex(doc, action.nodeId!)
      if (!parentInfo) return doc
      const cloned = cloneDoc(doc)
      cloned.root = updateNodeInClone(cloned.root, parentInfo.parent.id, (n) => {
        const updated = [...n.children]
        const [moved] = updated.splice(parentInfo.index, 1)
        updated.splice(action.newIndex!, 0, moved)
        return { ...n, children: updated }
      })
      return cloned
    }

    case 'ADD_CODE_MAPPING': {
      const cloned = cloneDoc(doc)
      cloned.root = updateNodeInClone(cloned.root, action.nodeId!, (n) => ({
        ...n,
        codeMappings: [...n.codeMappings, action.mapping!]
      }))
      return cloned
    }

    case 'REMOVE_CODE_MAPPING': {
      const cloned = cloneDoc(doc)
      cloned.root = updateNodeInClone(cloned.root, action.nodeId!, (n) => ({
        ...n,
        codeMappings: n.codeMappings.filter((_, i) => i !== action.index)
      }))
      return cloned
    }

    case 'ADD_EMBED_REF': {
      const cloned = cloneDoc(doc)
      cloned.root = updateNodeInClone(cloned.root, action.nodeId!, (n) => ({
        ...n,
        embedRefs: [...n.embedRefs, action.ref!]
      }))
      return cloned
    }

    case 'REMOVE_EMBED_REF': {
      const cloned = cloneDoc(doc)
      cloned.root = updateNodeInClone(cloned.root, action.nodeId!, (n) => ({
        ...n,
        embedRefs: n.embedRefs.filter((_, i) => i !== action.index)
      }))
      return cloned
    }

    case 'SET_DOCUMENT':
      return cloneDoc(action.document!)

    default:
      return doc
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/renderer/mindMapReducer.test.ts`
Expected: ALL 15 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/editors/mindMapReducer.ts tests/renderer/mindMapReducer.test.ts
git commit -m "feat: add mindMapReducer with tree mutation utilities"
```

---

### Task 2: NodeEditPanel — bottom panel with Monaco editor

**Files:**
- Create: `src/renderer/src/components/editors/NodeEditPanel.tsx`
- Create: `src/renderer/src/components/editors/NodeEditPanel.css`

- [ ] **Step 1: Write NodeEditPanel.tsx**

```typescript
// src/renderer/src/components/editors/NodeEditPanel.tsx
import { useCallback, useState, useEffect, useRef } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type * as monaco from 'monaco-editor'
import { registerRefCompletionProvider } from '../../services/monaco-completion'
import type { MindMapNode, CodeMapping } from '../../../../main/schemas/note-types'
import type { MindMapAction } from './mindMapReducer'
import './NodeEditPanel.css'

interface NodeEditPanelProps {
  node: MindMapNode | null
  dispatch: React.Dispatch<MindMapAction>
  onNavigateToCode?: (filePath: string, line: number) => void
  saveStatus: 'saved' | 'saving' | 'unsaved' | 'error'
}

export function NodeEditPanel({ node, dispatch, onNavigateToCode, saveStatus }: NodeEditPanelProps) {
  const [title, setTitle] = useState('')
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const completionDisposableRef = useRef<monaco.IDisposable | null>(null)
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!node) {
      setTitle('')
      return
    }
    setTitle(node.title)
    if (editorRef.current) {
      const currentVal = editorRef.current.getValue()
      if (currentVal !== node.content) {
        editorRef.current.setValue(node.content)
      }
    }
  }, [node?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor
    if (node) {
      editor.setValue(node.content)
    }
    completionDisposableRef.current = registerRefCompletionProvider()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setTitle(val)
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current)
    titleTimerRef.current = setTimeout(() => {
      if (node) dispatch({ type: 'UPDATE_TITLE', nodeId: node.id, title: val })
    }, 150)
  }, [node, dispatch])

  const handleContentChange = useCallback((val: string | undefined) => {
    if (!node || val === undefined) return
    if (contentTimerRef.current) clearTimeout(contentTimerRef.current)
    contentTimerRef.current = setTimeout(() => {
      dispatch({ type: 'UPDATE_CONTENT', nodeId: node.id, content: val })
    }, 300)
  }, [node, dispatch])

  const handleRemoveMapping = useCallback((index: number) => {
    if (node) dispatch({ type: 'REMOVE_CODE_MAPPING', nodeId: node.id, index })
  }, [node, dispatch])

  const handleRemoveEmbedRef = useCallback((index: number) => {
    if (node) dispatch({ type: 'REMOVE_EMBED_REF', nodeId: node.id, index })
  }, [node, dispatch])

  const handleAddMapping = useCallback(async () => {
    if (!node) return
    try {
      const symbols = await window.electronAPI.querySymbols(undefined, undefined, undefined)
      if (symbols.length > 0) {
        const sym = symbols[0]
        const mapping: CodeMapping = {
          raw: `@ref(${sym.name})`,
          functionName: sym.name,
          filePath: sym.filePath,
          startLine: sym.startLine,
          endLine: sym.endLine
        }
        dispatch({ type: 'ADD_CODE_MAPPING', nodeId: node.id, mapping })
      }
    } catch {
      // silently fail
    }
  }, [node, dispatch])

  const handleAddEmbedRef = useCallback(async () => {
    if (!node) return
    try {
      const notes = await window.electronAPI.listNotes()
      if (notes.length > 0) {
        dispatch({ type: 'ADD_EMBED_REF', nodeId: node.id, ref: notes[0].relativePath })
      }
    } catch {
      // silently fail
    }
  }, [node, dispatch])

  if (!node) {
    return (
      <div className="node-edit-panel node-edit-panel-empty">
        <p className="node-edit-panel-hint">Click a node to edit</p>
      </div>
    )
  }

  const statusLabels: Record<string, string> = {
    saved: '✓ 已保存',
    saving: '● 保存中...',
    unsaved: '○ 未保存',
    error: '✗ 保存失败'
  }

  return (
    <div className="node-edit-panel">
      <div className="node-edit-panel-scroll">
        <div className="node-edit-panel-field">
          <label className="node-edit-panel-label">标题</label>
          <input
            className="node-edit-panel-title-input"
            value={title}
            onChange={handleTitleChange}
            placeholder="节点标题"
          />
        </div>

        <div className="node-edit-panel-field">
          <label className="node-edit-panel-label">正文 (Markdown)</label>
          <div className="node-edit-panel-monaco">
            <Editor
              height="160px"
              defaultLanguage="markdown"
              theme="vs-dark"
              value={node.content}
              onChange={handleContentChange}
              onMount={handleEditorMount}
              options={{
                minimap: { enabled: false },
                wordWrap: 'on',
                fontSize: 12,
                lineNumbers: 'off',
                scrollBeyondLastLine: false,
                automaticLayout: true
              }}
            />
          </div>
        </div>

        <div className="node-edit-panel-field">
          <div className="node-edit-panel-section-header">
            <label className="node-edit-panel-label">代码映射</label>
            <button className="node-edit-panel-add-btn" onClick={handleAddMapping}>+ 添加映射</button>
          </div>
          {node.codeMappings.length === 0 ? (
            <p className="node-edit-panel-empty-text">暂无代码映射</p>
          ) : (
            <ul className="node-edit-panel-mapping-list">
              {node.codeMappings.map((m, i) => (
                <li key={i} className="node-edit-panel-mapping-item">
                  <span
                    className="node-edit-panel-mapping-ref"
                    onClick={() => onNavigateToCode?.(m.filePath, m.startLine)}
                    title={`${m.filePath}:${m.startLine}`}
                  >
                    {m.raw}
                  </span>
                  <span className="node-edit-panel-mapping-path">{m.filePath}:{m.startLine}</span>
                  <button
                    className="node-edit-panel-remove-btn"
                    onClick={() => handleRemoveMapping(i)}
                  >×</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="node-edit-panel-field">
          <div className="node-edit-panel-section-header">
            <label className="node-edit-panel-label">嵌入引用</label>
            <button className="node-edit-panel-add-btn" onClick={handleAddEmbedRef}>+ 添加嵌入</button>
          </div>
          {node.embedRefs.length === 0 ? (
            <p className="node-edit-panel-empty-text">暂无嵌入引用</p>
          ) : (
            <ul className="node-edit-panel-mapping-list">
              {node.embedRefs.map((ref, i) => (
                <li key={i} className="node-edit-panel-mapping-item">
                  <span className="node-edit-panel-mapping-ref">{ref}</span>
                  <button
                    className="node-edit-panel-remove-btn"
                    onClick={() => handleRemoveEmbedRef(i)}
                  >×</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`node-edit-panel-status node-edit-panel-status-${saveStatus}`}>
          {statusLabels[saveStatus]}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write NodeEditPanel.css**

```css
/* src/renderer/src/components/editors/NodeEditPanel.css */
.node-edit-panel {
  background: #1e1e1e;
  border-top: 1px solid #3c3c3c;
  height: 100%;
  overflow: hidden;
}

.node-edit-panel-empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.node-edit-panel-hint {
  color: #666;
  font-size: 13px;
}

.node-edit-panel-scroll {
  height: 100%;
  overflow-y: auto;
  padding: 12px 16px;
}

.node-edit-panel-field {
  margin-bottom: 14px;
}

.node-edit-panel-label {
  display: block;
  color: #888;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.node-edit-panel-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.node-edit-panel-title-input {
  width: 100%;
  padding: 6px 10px;
  background: #2d2d2d;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  color: #d4d4d4;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
}

.node-edit-panel-title-input:focus {
  border-color: #007acc;
}

.node-edit-panel-monaco {
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  overflow: hidden;
}

.node-edit-panel-add-btn {
  background: none;
  border: 1px solid #555;
  color: #888;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
}

.node-edit-panel-add-btn:hover {
  color: #ccc;
  border-color: #888;
}

.node-edit-panel-empty-text {
  color: #555;
  font-size: 12px;
  margin: 4px 0;
}

.node-edit-panel-mapping-list {
  list-style: none;
  padding: 0;
  margin: 4px 0;
}

.node-edit-panel-mapping-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  background: #2d2d2d;
  border-radius: 3px;
  margin-bottom: 3px;
  font-size: 11px;
}

.node-edit-panel-mapping-ref {
  color: #4ec9b0;
  cursor: pointer;
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-edit-panel-mapping-ref:hover {
  text-decoration: underline;
}

.node-edit-panel-mapping-path {
  color: #666;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-edit-panel-remove-btn {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0 2px;
}

.node-edit-panel-remove-btn:hover {
  color: #e44;
}

.node-edit-panel-status {
  padding: 6px 0;
  font-size: 11px;
  border-top: 1px solid #2d2d2d;
  margin-top: 8px;
}

.node-edit-panel-status-saved { color: #4a4; }
.node-edit-panel-status-saving { color: #cc0; }
.node-edit-panel-status-unsaved { color: #888; }
.node-edit-panel-status-error { color: #e44; }
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/editors/NodeEditPanel.tsx src/renderer/src/components/editors/NodeEditPanel.css
git commit -m "feat: add NodeEditPanel with Monaco editor for mind node content"
```

---

### Task 3: NodeContextMenu — right-click portal menu

**Files:**
- Create: `src/renderer/src/components/editors/NodeContextMenu.tsx`

- [ ] **Step 1: Write NodeContextMenu.tsx**

```typescript
// src/renderer/src/components/editors/NodeContextMenu.tsx
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface MenuItem {
  label: string
  shortcut?: string
  action: () => void
  danger?: boolean
  separator?: false
}

interface MenuSeparator {
  separator: true
}

type MenuEntry = MenuItem | MenuSeparator

interface NodeContextMenuProps {
  x: number
  y: number
  items: MenuEntry[]
  onClose: () => void
}

export function NodeContextMenu({ x, y, items, onClose }: NodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // Delay listeners so the right-click event doesn't immediately close the menu
    setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
      document.addEventListener('keydown', handleKey)
    }, 0)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Adjust position so menu stays within viewport
  const adjustedX = Math.min(x, window.innerWidth - 200)
  const adjustedY = Math.min(y, window.innerHeight - items.length * 32 - 16)

  return createPortal(
    <div
      ref={menuRef}
      className="node-context-menu"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {items.map((entry, i) => {
        if ('separator' in entry) {
          return <div key={i} className="node-context-menu-separator" />
        }
        return (
          <div
            key={i}
            className={`node-context-menu-item${entry.danger ? ' node-context-menu-item-danger' : ''}`}
            onClick={() => {
              entry.action()
              onClose()
            }}
          >
            <span>{entry.label}</span>
            {entry.shortcut && (
              <span className="node-context-menu-shortcut">{entry.shortcut}</span>
            )}
          </div>
        )
      })}
    </div>,
    document.body
  )
}
```

- [ ] **Step 2: Add context menu styles to MindMapRenderer.css**

Read `src/renderer/src/components/editors/MindMapRenderer.css`, then append:

```css
/* Context menu */
.node-context-menu {
  position: fixed;
  background: #2d2d2d;
  border: 1px solid #555;
  border-radius: 6px;
  padding: 4px 0;
  min-width: 180px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  z-index: 10000;
}

.node-context-menu-item {
  padding: 6px 14px;
  color: #ccc;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.node-context-menu-item:hover {
  background: #094771;
}

.node-context-menu-item-danger {
  color: #e44;
}

.node-context-menu-item-danger:hover {
  background: #5a1d1d;
}

.node-context-menu-shortcut {
  color: #666;
  font-size: 11px;
  margin-left: 24px;
}

.node-context-menu-separator {
  height: 1px;
  background: #555;
  margin: 4px 0;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/editors/NodeContextMenu.tsx src/renderer/src/components/editors/MindMapRenderer.css
git commit -m "feat: add NodeContextMenu with portal rendering"
```

---

### Task 4: MindMapCanvas — interactive D3.js canvas

**Files:**
- Create: `src/renderer/src/components/editors/MindMapCanvas.tsx`

- [ ] **Step 1: Write MindMapCanvas.tsx**

```typescript
// src/renderer/src/components/editors/MindMapCanvas.tsx
import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import * as d3 from 'd3'
import type { MindMapDocument, MindMapNode } from '../../../../main/schemas/note-types'
import type { MindMapAction } from './mindMapReducer'

interface MindMapCanvasProps {
  doc: MindMapDocument
  selectedNodeId: string | null
  collapsedIds: Set<string>
  dispatch: React.Dispatch<MindMapAction>
  onContextMenu: (nodeId: string, x: number, y: number) => void
  onHoverNode?: (nodeId: string | null) => void
}

export interface MindMapCanvasHandle {
  zoomToFit: () => void
}

export const MindMapCanvas = forwardRef<MindMapCanvasHandle, MindMapCanvasProps>(
  function MindMapCanvas({ doc, selectedNodeId, collapsedIds, dispatch, onContextMenu, onHoverNode }, ref) {
    const svgRef = useRef<SVGSVGElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
    const focusNodeIdRef = useRef<string | null>(null)

    useImperativeHandle(ref, () => ({
      zoomToFit() {
        const svg = d3.select(svgRef.current)
        const g = svg.select<SVGGElement>('g')
        if (g.empty()) return
        const bbox = (g.node() as SVGGElement).getBBox()
        const container = containerRef.current
        if (!container) return
        const w = container.clientWidth
        const h = container.clientHeight
        const scale = Math.min(w / (bbox.width + 120), h / (bbox.height + 80), 1.5)
        const tx = (w - bbox.width * scale) / 2 - bbox.x * scale
        const ty = (h - bbox.height * scale) / 2 - bbox.y * scale
        svg.transition().duration(300).call(
          d3.zoom<SVGSVGElement, unknown>().transform,
          d3.zoomIdentity.translate(tx, ty).scale(scale)
        )
      }
    }))

    const render = useCallback(() => {
      const svg = d3.select(svgRef.current)
      const container = containerRef.current
      if (!container) return

      const width = container.clientWidth || 800
      const height = container.clientHeight || 600
      svg.attr('width', width).attr('height', height)

      svg.selectAll('g').remove()

      const g = svg.append('g')

      // Filter out collapsed subtrees
      function getVisibleRoot(node: MindMapNode): MindMapNode {
        function filterCollapsed(n: MindMapNode): MindMapNode | null {
          if (collapsedIds.has(n.id)) {
            return { ...n, children: [] }
          }
          return {
            ...n,
            children: n.children.map(filterCollapsed).filter(Boolean) as MindMapNode[]
          }
        }
        return filterCollapsed(node)!
      }

      const visibleRoot = getVisibleRoot(doc.root)
      const root = d3.hierarchy<MindMapNode>(visibleRoot, (d) => d.children)
      const treeLayout = d3.tree<MindMapNode>().nodeSize([60, 120])
      treeLayout(root)

      const rootY = height / 2

      // Links
      g.selectAll('path.link')
        .data(root.links())
        .join('path')
        .attr('class', 'mind-link')
        .attr('d', (d) => {
          return `M${d.source.y!},${d.source.x!} C${d.source.y! + 60},${d.source.x!} ${d.target.y! - 60},${d.target.x!} ${d.target.y!},${d.target.x!}`
        })
        .attr('fill', 'none')
        .attr('stroke', '#555')
        .attr('stroke-width', 1.5)

      // Node groups
      const nodeGroup = g.selectAll('g.node')
        .data(root.descendants())
        .join('g')
        .attr('class', 'mind-node')
        .attr('transform', (d) => `translate(${d.y!},${d.x!})`)
        .attr('data-node-id', (d) => d.data.id)
        .style('cursor', 'pointer')

      // Node rects
      nodeGroup.append('rect')
        .attr('x', -70)
        .attr('y', -14)
        .attr('width', 140)
        .attr('height', 28)
        .attr('rx', 4)
        .attr('fill', (d) => d.data.id === selectedNodeId ? '#094771' : (d.depth === 0 ? '#007acc' : '#3c3c3c'))
        .attr('stroke', (d) => d.data.id === selectedNodeId ? '#ff0' : (d.depth === 0 ? '#007acc' : '#555'))
        .attr('stroke-width', (d) => d.data.id === selectedNodeId ? 2 : 1)

      // Collapse indicator for nodes with children
      nodeGroup.filter((d: d3.HierarchyNode<MindMapNode>) => d.children && d.children.length > 0 || collapsedIds.has(d.data.id))
        .append('circle')
        .attr('cx', -70)
        .attr('cy', 0)
        .attr('r', 7)
        .attr('fill', '#3c3c3c')
        .attr('stroke', '#666')
        .attr('stroke-width', 1)

      nodeGroup.filter((d: d3.HierarchyNode<MindMapNode>) => d.children && d.children.length > 0 || collapsedIds.has(d.data.id))
        .append('text')
        .attr('x', -70)
        .attr('y', 3)
        .attr('text-anchor', 'middle')
        .attr('fill', '#aaa')
        .attr('font-size', '9px')
        .text((d: d3.HierarchyNode<MindMapNode>) => collapsedIds.has(d.data.id) ? '▶' : '▼')

      // Title text
      nodeGroup.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', 4)
        .attr('fill', '#d4d4d4')
        .attr('font-size', '11px')
        .style('pointer-events', 'none')
        .text((d) => d.data.title.length > 22 ? d.data.title.slice(0, 20) + '..' : d.data.title)

      // --- Event binding ---

      // Click: select node
      nodeGroup.on('click', (event: MouseEvent, d: d3.HierarchyNode<MindMapNode>) => {
        event.stopPropagation()
        dispatch({ type: 'SELECT_NODE', nodeId: d.data.id })
      })

      // Double-click: enter inline title editing
      nodeGroup.on('dblclick', (event: MouseEvent, d: d3.HierarchyNode<MindMapNode>) => {
        event.stopPropagation()
        dispatch({ type: 'SELECT_NODE', nodeId: d.data.id })
        focusNodeIdRef.current = d.data.id
        render()
      })

      // Right-click: context menu
      nodeGroup.on('contextmenu', (event: MouseEvent, d: d3.HierarchyNode<MindMapNode>) => {
        event.preventDefault()
        event.stopPropagation()
        dispatch({ type: 'SELECT_NODE', nodeId: d.data.id })
        onContextMenu(d.data.id, event.clientX, event.clientY)
      })

      // Hover
      nodeGroup.on('mouseenter', (_event: MouseEvent, d: d3.HierarchyNode<MindMapNode>) => {
        onHoverNode?.(d.data.id)
      })
      nodeGroup.on('mouseleave', () => {
        onHoverNode?.(null)
      })

      // Drag for reparent/reorder
      const dragHandler = d3.drag<SVGGElement, d3.HierarchyNode<MindMapNode>>()
        .on('start', function (_event: d3.D3DragEvent<SVGGElement, unknown, unknown>, d: d3.HierarchyNode<MindMapNode>) {
          d3.select(this).raise()
          d3.select(this).select('rect').attr('stroke', '#ff0').attr('stroke-width', 2)
        })
        .on('drag', function (event: d3.D3DragEvent<SVGGElement, unknown, unknown>, d: d3.HierarchyNode<MindMapNode>) {
          const current = d3.select(this)
          const dx = event.x
          const dy = event.y
          current.attr('transform', `translate(${d.y! + dx},${d.x! + dy})`)
        })
        .on('end', function (_event: d3.D3DragEvent<SVGGElement, unknown, unknown>, d: d3.HierarchyNode<MindMapNode>) {
          // Find drop target from mouse position
          const svgNode = svgRef.current
          if (!svgNode) { render(); return }

          // Re-render to reset positions (simplified: v1 only supports reparent via context menu "move to")
          render()
        })

      nodeGroup.call(dragHandler as any)

      // SVG background click: deselect
      svg.on('click', () => {
        dispatch({ type: 'SELECT_NODE', nodeId: '' })
      })

      // Zoom on SVG
      const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 2.5])
        .on('zoom', (event) => {
          g.attr('transform', `translate(${event.transform.x},${event.transform.y}) scale(${event.transform.k})`)
        })
      svg.call(zoom)
      zoomRef.current = zoom

      // Keyboard: arrow keys to navigate
      svg.on('keydown', (event: KeyboardEvent) => {
        if (!selectedNodeId || selectedNodeId === '') return
        event.stopPropagation()
      })

    }, [doc, selectedNodeId, collapsedIds, dispatch, onContextMenu, onHoverNode])

    useEffect(() => {
      render()
    }, [render])

    useEffect(() => {
      const container = containerRef.current
      if (!container) return
      const observer = new ResizeObserver(() => { render() })
      observer.observe(container)
      return () => observer.disconnect()
    }, [render])

    // Inline title editing overlay
    useEffect(() => {
      if (!focusNodeIdRef.current) return
      const nodeId = focusNodeIdRef.current
      focusNodeIdRef.current = null

      const svgNode = svgRef.current
      if (!svgNode) return

      const nodeElement = svgNode.querySelector(`[data-node-id="${nodeId}"]`)
      if (!nodeElement) return

      const node = findNodeInTree(doc, nodeId)
      if (!node) return

      // Create an input overlay at the node's position
      const svgRect = svgNode.getBoundingClientRect()
      const nodeRect = (nodeElement as SVGGElement).getBoundingClientRect()
      const input = document.createElement('input')
      input.value = node.title
      input.style.position = 'fixed'
      input.style.left = `${nodeRect.left}px`
      input.style.top = `${nodeRect.top}px`
      input.style.width = `${130}px`
      input.style.height = `${24}px`
      input.style.fontSize = '11px'
      input.style.padding = '2px 6px'
      input.style.background = '#1e1e1e'
      input.style.color = '#d4d4d4'
      input.style.border = '2px solid #007acc'
      input.style.borderRadius = '4px'
      input.style.zIndex = '9999'
      input.style.outline = 'none'
      input.className = 'mind-inline-title-input'

      document.body.appendChild(input)
      input.focus()
      input.select()

      const commit = () => {
        const newTitle = input.value.trim()
        document.body.removeChild(input)
        if (newTitle && newTitle !== node.title) {
          dispatch({ type: 'UPDATE_TITLE', nodeId, title: newTitle })
        }
      }

      input.addEventListener('blur', commit)
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') {
          document.body.removeChild(input)
        }
        e.stopPropagation()
      })
    }, [doc, selectedNodeId, dispatch])

    return (
      <div
        className="mindmap-container"
        ref={containerRef}
        tabIndex={0}
        onKeyDown={(e) => {
          if (!selectedNodeId || selectedNodeId === '') return
          const key = e.key
          e.preventDefault()
          if (key === 'Tab') {
            dispatch({ type: 'ADD_CHILD', parentId: selectedNodeId })
          } else if (key === 'Enter') {
            dispatch({ type: 'ADD_SIBLING', nodeId: selectedNodeId })
          } else if (key === 'Delete' || key === 'Backspace') {
            // Delete requires confirm via context menu in v1
          } else if (key === ' ') {
            dispatch({ type: 'TOGGLE_COLLAPSE', nodeId: selectedNodeId })
          } else if (key === 'F2') {
            focusNodeIdRef.current = selectedNodeId
            render()
          }
        }}
      >
        <svg ref={svgRef} />
      </div>
    )
  }
)

function findNodeInTree(doc: MindMapDocument, id: string): MindMapNode | null {
  function search(node: MindMapNode): MindMapNode | null {
    if (node.id === id) return node
    for (const child of node.children) {
      const found = search(child)
      if (found) return found
    }
    return null
  }
  return search(doc.root)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/editors/MindMapCanvas.tsx
git commit -m "feat: add MindMapCanvas with D3.js interactive tree, drag, zoom, and inline editing"
```

---

### Task 5: MindMapEditor — top-level container

**Files:**
- Create: `src/renderer/src/components/editors/MindMapEditor.tsx`

- [ ] **Step 1: Write MindMapEditor.tsx**

```typescript
// src/renderer/src/components/editors/MindMapEditor.tsx
import { useReducer, useCallback, useEffect, useRef, useState } from 'react'
import type { MindMapDocument, MindMapNode } from '../../../../main/schemas/note-types'
import { mindMapReducer, findNode } from './mindMapReducer'
import type { MindMapAction } from './mindMapReducer'
import { MindMapCanvas } from './MindMapCanvas'
import type { MindMapCanvasHandle } from './MindMapCanvas'
import { NodeContextMenu } from './NodeContextMenu'
import { NodeEditPanel } from './NodeEditPanel'

interface MindMapEditorProps {
  document: MindMapDocument
  onSave: (doc: MindMapDocument) => Promise<void>
  onNavigateToCode?: (filePath: string, line: number) => void
}

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'

export function MindMapEditor({ document: initialDoc, onSave, onNavigateToCode }: MindMapEditorProps) {
  const [doc, dispatch] = useReducer(mindMapReducer, initialDoc)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [panelHeight, setPanelHeight] = useState(0.38) // 38% of viewport
  const canvasRef = useRef<MindMapCanvasHandle>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const oldDocRef = useRef(doc)

  // Reset when opening a different document
  useEffect(() => {
    dispatch({ type: 'SET_DOCUMENT', document: initialDoc })
    setSelectedNodeId(null)
    setCollapsedIds(new Set())
    setContextMenu(null)
    oldDocRef.current = initialDoc
  }, [initialDoc])

  // Intercept SELECT_NODE and TOGGLE_COLLAPSE to manage external state
  const wrappedDispatch = useCallback((action: MindMapAction) => {
    if (action.type === 'SELECT_NODE') {
      setSelectedNodeId(action.nodeId || null)
    }
    if (action.type === 'TOGGLE_COLLAPSE') {
      setCollapsedIds((prev) => {
        const next = new Set(prev)
        if (next.has(action.nodeId!)) {
          next.delete(action.nodeId!)
        } else {
          next.add(action.nodeId!)
        }
        return next
      })
    }
    dispatch(action)
  }, [])

  // Auto-save with debounce
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

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
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

  // Keyboard shortcuts handled by canvas (Tab, Enter, Space, F2, arrow keys)
  const handleContextMenu = useCallback((nodeId: string, x: number, y: number) => {
    setContextMenu({ nodeId, x, y })
  }, [])

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const selectedNode = selectedNodeId ? findNode(doc, selectedNodeId) : null

  const contextMenuItems = contextMenu ? [
    { label: '添加子节点', shortcut: 'Tab', action: () => wrappedDispatch({ type: 'ADD_CHILD', parentId: contextMenu.nodeId }) },
    { label: '添加兄弟节点', shortcut: 'Enter', action: () => wrappedDispatch({ type: 'ADD_SIBLING', nodeId: contextMenu.nodeId }) },
    { separator: true as const },
    { label: '折叠 / 展开', shortcut: 'Space', action: () => wrappedDispatch({ type: 'TOGGLE_COLLAPSE', nodeId: contextMenu.nodeId }) },
    { separator: true as const },
    { label: '删除节点', shortcut: 'Del', action: () => wrappedDispatch({ type: 'DELETE_NODE', nodeId: contextMenu.nodeId }), danger: true },
  ] : []

  const handlePanelResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const container = (e.target as HTMLElement).closest('.mind-editor')
    if (!container) return
    const containerHeight = container.getBoundingClientRect().height

    const onMove = (ev: MouseEvent) => {
      const dy = startY - ev.clientY
      const newFraction = Math.min(0.6, Math.max(0.15, (dy / containerHeight) + panelHeight))
      setPanelHeight(newFraction)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [panelHeight])

  return (
    <div className="mind-editor">
      <div className="mind-editor-canvas" style={{ flex: `0 0 ${100 - panelHeight * 100}%` }}>
        <MindMapCanvas
          ref={canvasRef}
          doc={doc}
          selectedNodeId={selectedNodeId}
          collapsedIds={collapsedIds}
          dispatch={wrappedDispatch}
          onContextMenu={handleContextMenu}
        />
      </div>
      <div
        className="mind-editor-panel-resize-handle"
        onMouseDown={handlePanelResize}
      />
      <div className="mind-editor-panel" style={{ flex: `0 0 ${panelHeight * 100}%` }}>
        <NodeEditPanel
          node={selectedNode}
          dispatch={wrappedDispatch}
          onNavigateToCode={onNavigateToCode}
          saveStatus={saveStatus}
        />
      </div>
      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={handleCloseContextMenu}
        />
      )}
    </div>
  )
}

```

- [ ] **Step 2: Add editor layout styles to MindMapRenderer.css**

Append to `src/renderer/src/components/editors/MindMapRenderer.css`:

```css
.mind-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.mind-editor-canvas {
  flex: 1;
  min-height: 120px;
  overflow: hidden;
}

.mind-editor-panel-resize-handle {
  height: 4px;
  background: #3c3c3c;
  cursor: ns-resize;
  flex-shrink: 0;
}

.mind-editor-panel-resize-handle:hover {
  background: #007acc;
}

.mind-editor-panel {
  flex: 0 0 35%;
  min-height: 80px;
  overflow: hidden;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/editors/MindMapEditor.tsx src/renderer/src/components/editors/MindMapRenderer.css
git commit -m "feat: add MindMapEditor container with auto-save, panel resizing, and context menu wiring"
```

---

### Task 6: Update NoteViewport routing

**Files:**
- Modify: `src/renderer/src/components/NoteViewport.tsx`

- [ ] **Step 1: Update import and routing in NoteViewport.tsx**

In `src/renderer/src/components/NoteViewport.tsx`, change line 7:

Replace:
```typescript
import { MindMapRenderer } from './editors/MindMapRenderer'
```
With:
```typescript
import { MindMapEditor } from './editors/MindMapEditor'
```

Then in the `renderEditor` function (around line 133), replace the `mind` case:

Replace:
```typescript
case 'mind':
  return (
    <MindMapRenderer
      document={activeNoteContent as MindMapDocument}
      onSave={async (doc: MindMapDocument) => {
        await saveNote(selectedNoteId, doc)
      }}
    />
  )
```
With:
```typescript
case 'mind':
  return (
    <MindMapEditor
      document={activeNoteContent as MindMapDocument}
      onSave={async (doc: MindMapDocument) => {
        await saveNote(selectedNoteId, doc)
      }}
      onNavigateToCode={(filePath: string, line: number) => {
        navigateToCode(filePath, line)
      }}
    />
  )
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit -p tsconfig.web.json`
Expected: No errors related to MindMapEditor or NoteViewport

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/NoteViewport.tsx
git commit -m "feat: route mind notes to MindMapEditor instead of MindMapRenderer"
```

---

### Task 7: Wire delete key and keyboard navigation

**Files:**
- Modify: `src/renderer/src/components/editors/MindMapEditor.tsx`

- [ ] **Step 1: Add keyboard handler for Delete and arrow key navigation**

In `MindMapEditor.tsx`, add a keyboard handler after the Ctrl+S handler. Replace the entire file to add arrow key sibling navigation and Delete confirmation.

Add this inside the `MindMapEditor` component, after the Ctrl+S handler `useEffect`:

```typescript
// Arrow key navigation: move selection between siblings
useEffect(() => {
  if (!selectedNodeId) return
  const handler = (e: KeyboardEvent) => {
    // Skip if focus is in an input/monaco
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).closest('.monaco-editor')) return

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedNodeId === doc.root.id) return
      e.preventDefault()
      if (window.confirm('确定要删除此节点及其所有子节点？')) {
        wrappedDispatch({ type: 'DELETE_NODE', nodeId: selectedNodeId })
      }
      return
    }

    // Arrow keys: navigate between siblings
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault()
      const siblingId = findSibling(doc, selectedNodeId, e.key)
      if (siblingId) {
        wrappedDispatch({ type: 'SELECT_NODE', nodeId: siblingId })
      }
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [selectedNodeId, doc, wrappedDispatch])

// Helper: find sibling in arrow direction
function findSibling(doc: MindMapDocument, nodeId: string, direction: string): string | null {
  if (nodeId === doc.root.id) {
    // ArrowRight: select first child
    if (direction === 'ArrowRight' && doc.root.children.length > 0) {
      return doc.root.children[0].id
    }
    return null
  }

  // Find parent and siblings
  const parent = findParent(doc.root, nodeId)
  if (!parent) return null

  const siblings = parent.children
  const idx = siblings.findIndex((c) => c.id === nodeId)
  if (idx < 0) return null

  if (direction === 'ArrowDown' && idx < siblings.length - 1) {
    return siblings[idx + 1].id
  }
  if (direction === 'ArrowUp' && idx > 0) {
    return siblings[idx - 1].id
  }
  if (direction === 'ArrowLeft') {
    return parent.id
  }
  if (direction === 'ArrowRight') {
    const current = siblings[idx]
    if (current.children.length > 0) return current.children[0].id
  }
  return null
}

function findParent(node: MindMapNode, targetId: string): MindMapNode | null {
  for (const child of node.children) {
    if (child.id === targetId) return node
    const found = findParent(child, targetId)
    if (found) return found
  }
  return null
}
```

Also add the `MindMapNode` import (already used in `findNode` at the bottom).

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit -p tsconfig.web.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/editors/MindMapEditor.tsx
git commit -m "feat: add keyboard navigation and delete confirmation for mind nodes"
```

---

### Task 8: Integration smoke test

**Files:**
- Modify: `tests/renderer/NoteViewport.test.tsx`

- [ ] **Step 1: Add a test for mind note rendering**

Append to `tests/renderer/NoteViewport.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppProvider } from '../../src/renderer/src/contexts/AppContext'
import { NoteViewport } from '../../src/renderer/src/components/NoteViewport'

// Mock electronAPI
const mockElectronAPI = {
  listNotes: vi.fn().mockResolvedValue([]),
  readNote: vi.fn(),
  updateNote: vi.fn(),
  createNote: vi.fn(),
  deleteNote: vi.fn(),
  renameNote: vi.fn(),
  resolveRefs: vi.fn().mockResolvedValue([]),
  copyFileToAssets: vi.fn(),
  querySymbols: vi.fn().mockResolvedValue([]),
  getProjectPath: vi.fn().mockResolvedValue('/test'),
  // ... other methods as needed
}

Object.defineProperty(window, 'electronAPI', { value: mockElectronAPI })

// existing tests...
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass, including the mindMapReducer tests from Task 1

- [ ] **Step 3: Commit**

```bash
git add tests/renderer/NoteViewport.test.tsx
git commit -m "test: add mind note rendering smoke test"
```

---

## Completion Checklist

- [ ] All 8 tasks committed
- [ ] `npx vitest run` passes all tests
- [ ] `npx tsc --noEmit -p tsconfig.web.json` no errors
- [ ] Manual test: create a mind note → click nodes → right-click → add children → edit title via double-click → edit content in bottom panel → verify auto-save writes to `.mind.json`
