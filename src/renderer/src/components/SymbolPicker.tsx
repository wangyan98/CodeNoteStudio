import { useState, useEffect, useCallback, useRef } from 'react'
import { useCodeNavigation } from '../hooks/useCodeNavigation'
import './SymbolPicker.css'

interface CodeSymbol {
  name: string
  kind: string
  filePath: string
  startLine: number
  parentName?: string
}

interface SymbolPickerProps {
  isOpen: boolean
  onClose: () => void
  onSelectSymbol: (symbolName: string) => void
}

const KINDS = ['', 'function', 'method', 'class', 'interface', 'type', 'variable', 'enum']

export function SymbolPicker({ isOpen, onClose, onSelectSymbol }: SymbolPickerProps) {
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState('')
  const [symbols, setSymbols] = useState<CodeSymbol[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { navigateToCode } = useCodeNavigation()

  useEffect(() => {
    if (!isOpen) return
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const results = await window.electronAPI.querySymbols(
          search || undefined,
          undefined,
          kindFilter || undefined
        )
        setSymbols(results)
        setSelectedIndex(0)
        setError(false)
      } catch {
        setSymbols([])
        setError(true)
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [search, kindFilter, isOpen])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
      setSearch('')
      setKindFilter('')
      setError(false)
    }
  }, [isOpen])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, symbols.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && symbols[selectedIndex]) {
      onSelectSymbol(symbols[selectedIndex].name)
      onClose()
    }
  }, [symbols, selectedIndex, onSelectSymbol, onClose])

  if (!isOpen) return null

  return (
    <div className="symbol-picker-overlay" onClick={onClose}>
      <div className="symbol-picker" onClick={(e) => e.stopPropagation()}>
        <div className="symbol-picker-header">
          <input
            ref={inputRef}
            className="symbol-picker-search"
            type="text"
            placeholder="Search symbols..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <select
            className="symbol-picker-kind-filter"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>{k || 'All kinds'}</option>
            ))}
          </select>
          <button className="symbol-picker-close" onClick={onClose}>x</button>
        </div>
        <div className="symbol-picker-results">
          {loading ? (
            <div className="symbol-picker-loading">Loading...</div>
          ) : error ? (
            <div className="symbol-picker-empty">
              Failed to query symbols. Make sure a code repo is indexed.
            </div>
          ) : symbols.length === 0 ? (
            <div className="symbol-picker-empty">
              No symbols found. Add a code repo and index it first.
            </div>
          ) : (
            symbols.map((sym, i) => (
              <div
                key={`${sym.name}-${sym.filePath}-${sym.startLine}`}
                className={`symbol-picker-item ${i === selectedIndex ? 'selected' : ''}`}
                onClick={() => { onSelectSymbol(sym.name); onClose() }}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <span className={`symbol-kind-badge kind-${sym.kind}`}>{sym.kind}</span>
                <span className="symbol-name">{sym.name}</span>
                <span className="symbol-location">
                  {sym.filePath.split('/').pop()}:{sym.startLine}
                </span>
                <button
                  className="symbol-goto-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    navigateToCode(sym.filePath, sym.startLine)
                    onClose()
                  }}
                  title="Go to definition"
                >
                  Go
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
