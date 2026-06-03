import { useMemo } from 'react'
import katex from 'katex'
import { useState, useEffect } from 'react'
import type { DerivationDocument, DerivationNode } from '../../../../main/schemas/note-types'
import 'katex/dist/katex.min.css'
import './DerivationDagViewer.css'

interface DerivationDagViewerProps {
  document: DerivationDocument
  onNavigateToCode?: (filePath: string, line: number) => void
}

function buildChildrenMap(nodes: DerivationNode[]): Map<string, DerivationNode[]> {
  const map = new Map<string, DerivationNode[]>()
  for (const n of nodes) {
    const parentId = n.derivesFrom ?? '__root__'
    if (!map.has(parentId)) map.set(parentId, [])
    map.get(parentId)!.push(n)
  }
  return map
}

function findRoots(nodes: DerivationNode[]): DerivationNode[] {
  const nodeIds = new Set(nodes.map((n) => n.id))
  return nodes.filter((n) => !n.derivesFrom || !nodeIds.has(n.derivesFrom))
}

function DagPill({ latex, title, stepNumber, codeMapping, onNavigateToCode }: {
  latex: string; title: string; stepNumber: number
  codeMapping?: DerivationNode['codeMapping']
  onNavigateToCode?: (filePath: string, line: number) => void
}) {
  const [html, setHtml] = useState('')

  useEffect(() => {
    try {
      setHtml(katex.renderToString(latex, { throwOnError: false, displayMode: false }))
    } catch {
      setHtml('')
    }
  }, [latex])

  const hasMapping = codeMapping && codeMapping.filePath && codeMapping.startLine > 0

  return (
    <span className="dag-pill">
      <span className="dag-pill-header">
        <span className="dag-pill-step">{stepNumber}.</span>
        {title ? (
          <span className="dag-pill-title">{title}</span>
        ) : !html ? (
          <span className="dag-pill-empty">(empty)</span>
        ) : null}
        {hasMapping && onNavigateToCode && (
          <span
            className="dag-pill-jump"
            onClick={(e) => {
              e.stopPropagation()
              onNavigateToCode(codeMapping!.filePath, codeMapping!.startLine)
            }}
            title={`Jump to ${codeMapping!.filePath}:${codeMapping!.startLine}`}
          >
            →
          </span>
        )}
      </span>
      {html && (
        <span className="dag-pill-formula" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </span>
  )
}

function DagTreeNode({ node, childrenMap, ancestorIds, onNavigateToCode }: {
  node: DerivationNode
  childrenMap: Map<string, DerivationNode[]>
  ancestorIds?: Set<string>
  onNavigateToCode?: (filePath: string, line: number) => void
}) {
  const rawChildren = childrenMap.get(node.id) ?? []
  const currentAncestors = ancestorIds ?? new Set<string>()
  const children = rawChildren.length > 0
    ? rawChildren.filter((c) => !currentAncestors.has(c.id))
    : []

  const nextAncestors = useMemo(() => {
    const next = new Set(currentAncestors)
    next.add(node.id)
    return next
  }, [currentAncestors, node.id])

  return (
    <div className="dag-tree-node">
      <DagPill latex={node.content} title={node.title} stepNumber={node.stepNumber} codeMapping={node.codeMapping} onNavigateToCode={onNavigateToCode} />
      {children.length > 0 && (
        <>
          <div className="dag-tree-connector" />
          <div className={`dag-tree-children${children.length > 1 ? ' multi-child' : ''}`}>
            {children.map((child) => (
              <div className="dag-tree-child" key={child.id}>
                <DagTreeNode
                  node={child}
                  childrenMap={childrenMap}
                  ancestorIds={nextAncestors}
                  onNavigateToCode={onNavigateToCode}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function DerivationDagViewer({ document, onNavigateToCode }: DerivationDagViewerProps) {
  const { roots, childrenMap } = useMemo(() => {
    const cm = buildChildrenMap(document.nodes)
    const roots = findRoots(document.nodes)
    return { roots, childrenMap: cm }
  }, [document.nodes])

  if (document.nodes.length === 0) {
    return <div className="dag-viewer-empty">No derivation steps</div>
  }

  return (
    <div className="dag-viewer">
      {roots.map((root) => (
        <DagTreeNode
          key={root.id}
          node={root}
          childrenMap={childrenMap}
          onNavigateToCode={onNavigateToCode}
        />
      ))}
    </div>
  )
}
