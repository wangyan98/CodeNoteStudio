import { useState, useCallback, useRef } from 'react'
import { SymbolPicker } from './SymbolPicker'
import type { CodeSymbol } from './SymbolPicker'
import type { CodeMapping } from '../../../main/schemas/note-types'
import { useCodeNavigation } from '../hooks/useCodeNavigation'
import './CodeMappingField.css'

interface CodeMappingFieldProps {
  codeMapping: CodeMapping | null | undefined
  notePath: string
  onChange: (mapping: CodeMapping | null) => void
}

export function CodeMappingField({ codeMapping, notePath, onChange }: CodeMappingFieldProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [rawInput, setRawInput] = useState(codeMapping?.raw ?? '')
  const { navigateToCode } = useCodeNavigation()
  const resolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync raw input when codeMapping changes externally
  const lastMappingRef = useRef<CodeMapping | null | undefined>(null)
  if (lastMappingRef.current !== codeMapping) {
    lastMappingRef.current = codeMapping
    setRawInput(codeMapping?.raw ?? '')
  }

  const resolveAndUpdate = useCallback(async (raw: string) => {
    if (!raw) {
      onChange(null)
      return
    }
    try {
      const mappings = await window.electronAPI.resolveRefs(notePath, `@ref(${raw})`, undefined)
      if (mappings.length > 0) {
        onChange({ ...mappings[0], raw })
      } else {
        onChange({ raw, functionName: '', filePath: '', startLine: 0, endLine: 0 })
      }
    } catch {
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
    const fileName = sym.filePath.split('/').pop() || sym.filePath
    const dirPath = sym.filePath.split('/').slice(0, -1).join('/')
    const refRaw = `${dirPath}/${fileName}:${sym.startLine}:${sym.name}`
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
      {hasResolved && (
        <div
          className="code-mapping-field-resolved"
          onClick={() => navigateToCode(codeMapping!.filePath, codeMapping!.startLine)}
          title={`Open ${codeMapping!.filePath}:${codeMapping!.startLine}`}
        >
          {codeMapping!.filePath.split('/').slice(-2).join('/')}:{codeMapping!.startLine} {codeMapping!.functionName}
        </div>
      )}
      <SymbolPicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelectSymbol={handleSymbolSelect}
      />
    </div>
  )
}
