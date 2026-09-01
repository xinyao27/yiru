import { useEffect } from 'react'

import { useIpcEvents } from '../../application-shell/use-ipc-events'
import { SidePanelNavigation } from './navigation'
import { publishSidePanelPresence } from './presence'

export function SidePanelSurface(): React.JSX.Element {
  useIpcEvents()
  useEffect(() => publishSidePanelPresence(), [])

  return (
    <main className="bg-sidebar h-dvh min-h-0 overflow-hidden">
      <SidePanelNavigation presentation="browser" />
    </main>
  )
}
