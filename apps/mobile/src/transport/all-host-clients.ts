import { useEffect, useMemo, useState } from 'react'

import { useRpcClientContext } from './client-context'
import type { RpcClient } from './rpc-client'
import type { MobileConnectionPath } from './stable-logical-rpc-client'
import type { ConnectionState } from './types'

type HostClient = {
  hostId: string
  client: RpcClient
  state: ConnectionState
  path: MobileConnectionPath
}

// Why: the home screen acquires every paired host at once; provider refcounting avoids reopening
// a client when a host-detail screen is mounted at the same time.
export function useAllHostClients(hostIds: string[]): HostClient[] {
  const context = useRpcClientContext()
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (hostIds.length === 0) {
      return
    }
    for (const hostId of hostIds) {
      context.acquire(hostId)
    }
    const unsubscribers = hostIds.map((hostId) =>
      context.subscribeHostState(hostId, () => setRevision((value) => value + 1))
    )
    unsubscribers.push(context.subscribeAllHosts(() => setRevision((value) => value + 1)))
    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe()
      }
      for (const hostId of hostIds) {
        context.release(hostId)
      }
    }
  }, [context, hostIds])

  return useMemo(() => {
    const clients: HostClient[] = []
    for (const hostId of hostIds) {
      const entry = context.getAllClients().find((candidate) => candidate.hostId === hostId)
      if (entry) {
        clients.push({
          hostId,
          client: entry.client,
          state: context.getState(hostId),
          path: context.getActivePath(hostId)
        })
      }
    }
    return clients
  }, [context, hostIds, revision])
}
