import type { NoteType } from '../../types'

interface EmbedCardProps {
  notePath: string
  noteType: NoteType
}

const typeLabels: Record<NoteType, string> = {
  mind: 'Mind Map',
  md: 'Markdown',
  derive: 'Derivation',
  seq: 'Sequence Diagram'
}

export function EmbedCard({ notePath, noteType }: EmbedCardProps) {
  return (
    <div className="embed-card">
      <div className="embed-card-header">
        <span className="embed-card-badge">{noteType}</span>
        <span className="embed-card-type">{typeLabels[noteType]}</span>
      </div>
      <div className="embed-card-path">{notePath}</div>
    </div>
  )
}
