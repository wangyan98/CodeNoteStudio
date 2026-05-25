import { useCallback } from 'react'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import { useAppContext } from '../contexts/AppContext'
import { NoteDirectory } from './NoteDirectory'
import { NoteViewport } from './NoteViewport'
import { CodeViewport } from './CodeViewport'
import { CodeDirectory } from './CodeDirectory'
import { ServerStatus } from './ServerStatus'
import type { PanelWidths } from '../types'
import './Layout.css'

export function Layout() {
  const { state, dispatch } = useAppContext()
  const { panelWidths } = state

  const handleLayoutChange = useCallback(
    (sizes: number[]) => {
      const widths: PanelWidths = {
        panel1: sizes[0],
        panel2: sizes[1],
        panel3: sizes[2],
        panel4: sizes[3]
      }
      dispatch({ type: 'SET_PANEL_WIDTHS', widths })
    },
    [dispatch]
  )

  return (
    <div className="layout-container">
      <div className="layout-panels">
        <PanelGroup
          direction="horizontal"
          onLayout={handleLayoutChange}
        >
          <Panel defaultSize={panelWidths.panel1} minSize={10} maxSize={30}>
            <NoteDirectory />
          </Panel>
          <PanelResizeHandle className="resize-handle" />
          <Panel defaultSize={panelWidths.panel2} minSize={20}>
            <NoteViewport />
          </Panel>
          <PanelResizeHandle className="resize-handle" />
          <Panel defaultSize={panelWidths.panel3} minSize={20}>
            <CodeViewport />
          </Panel>
          <PanelResizeHandle className="resize-handle" />
          <Panel defaultSize={panelWidths.panel4} minSize={10} maxSize={30}>
            <CodeDirectory />
          </Panel>
        </PanelGroup>
      </div>
      <ServerStatus />
    </div>
  )
}
