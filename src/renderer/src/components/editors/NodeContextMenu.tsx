import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export interface MenuItem {
  label: string
  shortcut?: string
  action: () => void | Promise<void>
  danger?: boolean
  disabled?: boolean
  separator?: false
  color?: string
  disableAutoClose?: boolean
}

export interface MenuSeparator {
  separator: true
}

export type MenuEntry = MenuItem | MenuSeparator

interface NodeContextMenuProps {
  x: number
  y: number
  items: MenuEntry[]
  onClose: () => void
}

export function NodeContextMenu({ x, y, items, onClose }: NodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // Delay listeners so the right-click event doesn't immediately close the menu
    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKey)
    }, 0)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Use native click listener on the menu container to bypass React synthetic event
  // issues with portal-rendered content
  useEffect(() => {
    const menu = menuRef.current
    if (!menu) return

    const handleItemClick = (e: MouseEvent) => {
      const actionEl = (e.target as HTMLElement).closest('[data-menu-action]') as HTMLElement | null
      if (!actionEl) return
      const index = parseInt(actionEl.dataset.menuAction!, 10)
      const entry = items[index]
      if (!entry || 'separator' in entry || entry.disabled) return
      e.preventDefault()
      e.stopPropagation()
      Promise.resolve(entry.action()).then(() => {
        if (!entry.disableAutoClose) onClose()
      })
    }

    menu.addEventListener('click', handleItemClick)
    return () => menu.removeEventListener('click', handleItemClick)
  }, [items, onClose])

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
            data-menu-action={i}
            className={`node-context-menu-item${entry.danger ? ' node-context-menu-item-danger' : ''}${entry.disabled ? ' node-context-menu-item-disabled' : ''}`}
          >
            {entry.color && (
              <span
                className="node-context-menu-color-dot"
                style={{ backgroundColor: entry.color }}
              />
            )}
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
