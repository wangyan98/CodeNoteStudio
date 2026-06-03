import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'
import { useCodeNavigation } from '../../hooks/useCodeNavigation'

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
    let cancelled = false

    const timer = setTimeout(() => {
      if (cancelled) return
      const svgEl = containerRef.current?.querySelector('svg')
      if (!svgEl) return

      const svgns = 'http://www.w3.org/2000/svg'
      const texts = svgEl.querySelectorAll('text')

      texts.forEach((textEl) => {
        const original = textEl.textContent || ''
        const matches = [...original.matchAll(/@ref\(([^)]+)\)/g)]
        if (matches.length === 0) return

        // Clear existing content
        while (textEl.firstChild) textEl.removeChild(textEl.firstChild)

        let cursor = 0
        for (const match of matches) {
          const matchStart = match.index!

          // Text before this match
          if (matchStart > cursor) {
            const tspan = document.createElementNS(svgns, 'tspan')
            tspan.textContent = original.slice(cursor, matchStart)
            textEl.appendChild(tspan)
          }

          // Clickable @ref link — show only the last segment (class/function name)
          const linkSpan = document.createElementNS(svgns, 'tspan')
          const rawInside = match[1]
          const sep = rawInside.includes('#') ? '#' : ':'
          const displayName = rawInside.split(sep).pop() || rawInside
          linkSpan.textContent = displayName
          linkSpan.setAttribute('fill', '#61afef')
          linkSpan.setAttribute('text-decoration', 'underline')
          linkSpan.style.cursor = 'pointer'
          const refText = match[0]
          linkSpan.addEventListener('click', (e) => {
            e.stopPropagation()
            window.electronAPI.resolveRefs(notePath, refText, undefined).then((mappings) => {
              if (mappings.length > 0) {
                navigateToCode(mappings[0].filePath, mappings[0].startLine)
              }
            }).catch(() => {})
          })
          textEl.appendChild(linkSpan)

          cursor = matchStart + match[0].length
        }

        // Remaining text after last match
        if (cursor < original.length) {
          const tspan = document.createElementNS(svgns, 'tspan')
          tspan.textContent = original.slice(cursor)
          textEl.appendChild(tspan)
        }
      })
    }, 100)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
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
