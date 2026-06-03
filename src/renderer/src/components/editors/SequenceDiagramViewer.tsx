import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'
import { useCodeNavigation } from '../hooks/useCodeNavigation'

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
  notePath: string
}

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

    const timer = setTimeout(() => {
      const svgEl = containerRef.current?.querySelector('svg')
      if (!svgEl) return

      const texts = svgEl.querySelectorAll('text')
      texts.forEach((textEl) => {
        const original = textEl.textContent || ''
        const match = original.match(/@ref\(([^)]+?)\)/)
        if (!match) return

        const beforeIdx = original.indexOf(match[0])

        // Clear and rebuild
        while (textEl.firstChild) textEl.removeChild(textEl.firstChild)

        const svgns = 'http://www.w3.org/2000/svg'

        // Preceding text
        if (beforeIdx > 0) {
          const tspan = document.createElementNS(svgns, 'tspan')
          tspan.textContent = original.slice(0, beforeIdx)
          textEl.appendChild(tspan)
        }

        // Clickable @ref link
        const linkSpan = document.createElementNS(svgns, 'tspan')
        linkSpan.textContent = match[0]
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

        // Trailing text
        const afterIdx = beforeIdx + match[0].length
        if (afterIdx < original.length) {
          const tspan = document.createElementNS(svgns, 'tspan')
          tspan.textContent = original.slice(afterIdx)
          textEl.appendChild(tspan)
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
