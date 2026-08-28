import { useQuery, useQueryClient } from '@tanstack/react-query'

import { getExtensionBrowserCapabilities } from '../browser-capabilities'
import { extensionOrpc } from '../runtime/orpc'
import { getExtensionRuntimeClient } from '../runtime/session'

export function ConsoleSensorBridge(): null {
  const queryClient = useQueryClient()
  useQuery({
    queryKey: ['extension-host', 'claimed-console-sensors'],
    queryFn: async () => {
      const captures = await getExtensionBrowserCapabilities().drainClaimedConsoleSensors()
      if (captures.length === 0) {
        return 0
      }
      const client = await getExtensionRuntimeClient()
      await Promise.all(captures.map((capture) => client.workspaceEvents.appendConsole(capture)))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: extensionOrpc.terminal.key() }),
        queryClient.invalidateQueries({ queryKey: extensionOrpc.workspaceEvents.key() })
      ])
      return captures.reduce((total, capture) => total + capture.entries.length, 0)
    },
    refetchInterval: 1_000
  })
  return null
}
