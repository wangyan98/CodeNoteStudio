import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

// Initialize mermaid once
let mermaidInitialized = false
function initMermaid() {
  if (mermaidInitialized) return
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    sequence: {
      diagramMarginX: 20,
      diagramMarginY: 20,
      actorMargin: 60,
      boxMargin: 10,
      messageMargin: 40,
      mirrorActors: false,
      useMaxWidth: false
    }
  })
  mermaidInitialized = true
}

interface SequenceDiagramViewerProps {
  content: string
}

export function SequenceDiagramViewer({ content }: SequenceDiagramViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [svg, setSvg] = useState<string | null>(null)

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
