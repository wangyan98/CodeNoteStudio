import { useRef, useEffect } from 'react'
import katex from 'katex'
import type { DerivationDocument } from '../../../../main/schemas/note-types'
import 'katex/dist/katex.min.css'
import './DerivationRenderer.css'

interface DerivationRendererProps {
  document: DerivationDocument
}

function renderFormula(element: HTMLElement, formula: string): void {
  try {
    katex.render(formula, element, {
      throwOnError: false,
      displayMode: true
    })
  } catch {
    element.textContent = formula
  }
}

export function DerivationRenderer({ document }: DerivationRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.querySelectorAll('.derive-formula').forEach((el) => {
      const formula = el.getAttribute('data-formula')
      if (formula) {
        renderFormula(el as HTMLElement, formula)
      }
    })
  }, [document])

  if (document.nodes.length === 0) {
    return (
      <div className="derivation-empty">
        <p>No derivation steps yet.</p>
        <p className="derivation-hint">Add nodes to build your derivation tree.</p>
      </div>
    )
  }

  return (
    <div className="derivation-container" ref={containerRef}>
      <div className="derivation-list">
        {document.nodes.map((node, index) => (
          <div key={node.id} className="derive-step">
            <div className="derive-step-header">
              <span className="derive-step-number">({index + 1})</span>
              <span className="derive-step-title">{node.title}</span>
            </div>
            {node.content && (
              <div
                className="derive-formula"
                data-formula={node.content}
              />
            )}
            {node.derivesFrom && (
              <div className="derive-relation">
                ← derives from step {document.nodes.findIndex((n) => n.id === node.derivesFrom) + 1}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
