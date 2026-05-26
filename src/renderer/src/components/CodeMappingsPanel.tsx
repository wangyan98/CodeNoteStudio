import { useCodeNavigation } from '../hooks/useCodeNavigation'
import type { CodeMapping } from '../types'
import './CodeMappingsPanel.css'

interface CodeMappingsPanelProps {
  mappings: CodeMapping[]
}

export function CodeMappingsPanel({ mappings }: CodeMappingsPanelProps) {
  const { navigateToCode } = useCodeNavigation()

  if (mappings.length === 0) return null

  return (
    <div className="code-mappings-panel">
      <div className="code-mappings-header">
        Code References ({mappings.length})
      </div>
      <div className="code-mappings-list">
        {mappings.map((m, i) => (
          <div
            key={`${m.functionName}-${m.filePath}-${i}`}
            className="code-mapping-item"
            onClick={() => navigateToCode(m.filePath, m.startLine)}
            title={`Open ${m.filePath}:${m.startLine}`}
          >
            <span className="code-mapping-name">{m.functionName}</span>
            <span className="code-mapping-location">
              {m.filePath.split('/').slice(-2).join('/')}:{m.startLine}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
