import { useState, useCallback, useRef, useEffect } from 'react'
import { SymbolPicker } from './SymbolPicker'
import type { CodeSymbol } from './SymbolPicker'
import type { CodeMapping } from '../../../main/schemas/note-types'
import { useCodeNavigation } from '../hooks/useCodeNavigation'
import { useAppContext } from '../contexts/AppContext'
import './CodeMappingField.css'

interface CodeMappingFieldProps {
  codeMapping: CodeMapping | null | undefined
  notePath: string
  onChange: (mapping: CodeMapping | null) => void
}

function useActiveFilePath(): string | undefined {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const ctx = useAppContext()
    const { openCodeFiles, activeCodeFileIndex } = ctx.state
    if (activeCodeFileIndex >= 0 && activeCodeFileIndex < openCodeFiles.length) {
      return openCodeFiles[activeCodeFileIndex].path
    }
  } catch { /* AppContext unavailable */ }
  return undefined
}

export function CodeMappingField({ codeMapping, notePath, onChange }: CodeMappingFieldProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [rawInput, setRawInput] = useState(codeMapping?.raw ?? '')
  const { navigateToCode } = useCodeNavigation()
  const activeFilePath = useActiveFilePath()
  const resolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  // Sync raw input when codeMapping.raw changes externally
  useEffect(() => {
    setRawInput(codeMapping?.raw ?? '')
  }, [codeMapping?.raw])

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current)
    }
  }, [])

  const resolveAndUpdate = useCallback(async (raw: string) => {
    if (!raw) {
      onChange(null)
      return
    }
    try {
      const mappings = await window.electronAPI.resolveRefs(notePath, `@ref(${raw})`, undefined)
      if (!mountedRef.current) return
      if (mappings.length > 0) {
        onChange({ ...mappings[0], raw })
      } else {
        onChange({ raw, functionName: '', filePath: '', startLine: 0, endLine: 0 })
      }
    } catch {
      if (!mountedRef.current) return
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
    const refRaw = `${sym.filePath}:${sym.startLine}:${sym.name}`
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
      {hasResolved && (() => {
        const { filePath, startLine, functionName } = codeMapping
        return (
          <div
            className="code-mapping-field-resolved"
            onClick={() => navigateToCode(filePath, startLine)}
            title={`Open ${filePath}:${startLine}`}
          >
            {filePath.split('/').slice(-2).join('/')}:{startLine} {functionName}
          </div>
        )
      })()}
      <SymbolPicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelectSymbol={handleSymbolSelect}
        activeFilePath={activeFilePath}
      />
    </div>
  )
}
