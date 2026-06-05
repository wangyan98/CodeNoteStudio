import { useCallback, useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'
import { useCodeNavigation } from '../../hooks/useCodeNavigation'
import { LocateButton } from './LocateButton'
import './SequenceDiagramViewer.css'

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
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [svg, setSvg] = useState<string | null>(null)
  const { navigateToCode } = useCodeNavigation()
  const refMapRef = useRef<Map<string, { displayName: string; refText: string }>>(new Map())
  const zoomRef = useRef(1)
  const svgNaturalSizeRef = useRef({ width: 0, height: 0 })

  useEffect(() => {
    initMermaid()
    const renderDiagram = async () => {
      if (!content.trim()) {
        setSvg(null)
        setError(null)
        return
      }
      try {
        // Pre-process: replace @ref(...) with short placeholders so mermaid
        // calculates correct line lengths based on display names
        const refMap = new Map<string, { displayName: string; refText: string }>()
        let counter = 0
        const processedContent = content.replace(/@ref\(([^)]+)\)/g, (fullMatch, inner) => {
          const sep = inner.includes('#') ? '#' : ':'
          const displayName = inner.split(sep).pop() || inner
          const placeholder = `[R${counter}]`
          refMap.set(placeholder, { displayName, refText: fullMatch })
          counter++
          return placeholder
        })
        refMapRef.current = refMap

        const id = 'mermaid-' + Math.random().toString(36).substring(2, 8)
        const { svg: rendered } = await mermaid.render(id, processedContent)
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

  // Post-process SVG: replace placeholders with clickable display names
  useEffect(() => {
    if (!svg || !scrollContainerRef.current) return
    let cancelled = false

    const timer = setTimeout(() => {
      if (cancelled) return
      const svgEl = scrollContainerRef.current?.querySelector('svg')
      if (!svgEl) return

      const svgns = 'http://www.w3.org/2000/svg'
      const texts = svgEl.querySelectorAll('text')
      const refMap = refMapRef.current

      texts.forEach((textEl) => {
        const original = textEl.textContent || ''
        const matches = [...original.matchAll(/\[R(\d+)\]/g)]
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

          // Resolve placeholder to clickable link
          const placeholder = match[0]
          const ref = refMap.get(placeholder)
          if (ref) {
            const linkSpan = document.createElementNS(svgns, 'tspan')
            linkSpan.textContent = ref.displayName
            linkSpan.setAttribute('fill', '#61afef')
            linkSpan.setAttribute('text-decoration', 'underline')
            linkSpan.style.cursor = 'pointer'
            linkSpan.addEventListener('click', (e) => {
              e.stopPropagation()
              window.electronAPI.resolveRefs(notePath, ref.refText, undefined).then((mappings) => {
                if (mappings.length > 0) {
                  navigateToCode(mappings[0].filePath, mappings[0].startLine)
                }
              }).catch(() => {})
            })
            textEl.appendChild(linkSpan)
          } else {
            // Unknown placeholder, render as-is
            const tspan = document.createElementNS(svgns, 'tspan')
            tspan.textContent = placeholder
            textEl.appendChild(tspan)
          }

          cursor = matchStart + placeholder.length
        }

        // Remaining text after last match
        if (cursor < original.length) {
          const tspan = document.createElementNS(svgns, 'tspan')
          tspan.textContent = original.slice(cursor)
          textEl.appendChild(tspan)
        }
      })

      // Measure SVG natural size for zoom
      if (svgEl) {
        const rect = svgEl.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) {
          svgNaturalSizeRef.current = { width: rect.width, height: rect.height }
        }
      }
    }, 100)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [svg, notePath, navigateToCode])

  const handleLocate = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ left: 0, behavior: 'smooth' })
    }
  }, [])

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
    <div style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden' }}>
      <div
        ref={scrollContainerRef}
        className="sequence-diagram-viewer"
        style={{ overflow: 'auto', padding: 8, height: '100%' }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <LocateButton onLocate={handleLocate} />
    </div>
  )
}
