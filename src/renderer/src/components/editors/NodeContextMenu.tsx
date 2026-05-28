import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface MenuItem {
  label: string
  shortcut?: string
  action: () => void
  danger?: boolean
  separator?: false
}

interface MenuSeparator {
  separator: true
}

type MenuEntry = MenuItem | MenuSeparator

interface NodeContextMenuProps {
  x: number
  y: number
  items: MenuEntry[]
  onClose: () => void
}

export function NodeContextMenu({ x, y, items, onClose }: NodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // Delay listeners so the right-click event doesn't immediately close the menu
    setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
      document.addEventListener('keydown', handleKey)
    }, 0)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Adjust position so menu stays within viewport
  const adjustedX = Math.min(x, window.innerWidth - 200)
  const adjustedY = Math.min(y, window.innerHeight - items.length * 32 - 16)

  return createPortal(
    <div
      ref={menuRef}
      className="node-context-menu"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {items.map((entry, i) => {
        if ('separator' in entry) {
          return <div key={i} className="node-context-menu-separator" />
        }
        return (
          <div
            key={i}
            className={`node-context-menu-item${entry.danger ? ' node-context-menu-item-danger' : ''}`}
            onClick={() => {
              entry.action()
              onClose()
            }}
          >
            <span>{entry.label}</span>
            {entry.shortcut && (
              <span className="node-context-menu-shortcut">{entry.shortcut}</span>
            )}
          </div>
        )
      })}
    </div>,
    document.body
  )
}
