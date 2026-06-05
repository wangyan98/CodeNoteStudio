import './LocateButton.css'

interface LocateButtonProps {
  onLocate: () => void
  title?: string
}

export function LocateButton({ onLocate, title = '定位到根节点' }: LocateButtonProps) {
  return (
    <button className="locate-button" onClick={onLocate} title={title}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="#aaa" strokeWidth="1.5" />
        <circle cx="8" cy="8" r="2" fill="#4a90d9" />
      </svg>
    </button>
  )
}
