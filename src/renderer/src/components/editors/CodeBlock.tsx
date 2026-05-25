interface CodeBlockProps {
  code: string
  language: string
  functionName?: string
  filePath?: string
  startLine?: number
  onJump?: (functionName: string, filePath: string) => void
}

export function CodeBlock({ code, language, functionName, filePath, startLine, onJump }: CodeBlockProps) {
  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-block-lang">{language}</span>
        {functionName && (
          <button
            className="code-block-jump"
            onClick={() => onJump?.(functionName, filePath || '')}
            title={`Jump to ${functionName} in ${filePath}`}
          >
            → {functionName}
          </button>
        )}
      </div>
      <pre className="code-block-content">
        <code>{code}</code>
      </pre>
      {filePath && (
        <div className="code-block-footer">
          {filePath}{startLine !== undefined ? `:${startLine}` : ''}
        </div>
      )}
    </div>
  )
}
