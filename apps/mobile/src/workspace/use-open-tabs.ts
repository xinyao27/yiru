import type {
  RuntimeMobileSessionClientTab,
  RuntimeMobileSessionTabsResult
} from '@yiru/runtime-protocol/contract'
import { useEffect, useState } from 'react'

import type { RpcClient } from '~/transport/rpc-client'
import { subscribeRuntimeOrpc } from '~/transport/runtime-orpc-client'

const EMPTY_OPEN_TABS_BY_WORKTREE: ReadonlyMap<string, RuntimeMobileSessionClientTab[]> = new Map()

type HostOpenTabsSnapshot = {
  hostId: string
  tabsByWorktree: ReadonlyMap<string, RuntimeMobileSessionClientTab[]>
}

function tabsByWorktreeFromSnapshots(
  snapshots: readonly RuntimeMobileSessionTabsResult[]
): ReadonlyMap<string, RuntimeMobileSessionClientTab[]> {
  return new Map(snapshots.map((snapshot) => [snapshot.worktree, snapshot.tabs]))
}

export function useWorkspaceOpenTabs(args: {
  client: RpcClient | null
  connected: boolean
  hostId: string
}): ReadonlyMap<string, RuntimeMobileSessionClientTab[]> {
  const { client, connected, hostId } = args
  const [snapshot, setSnapshot] = useState<HostOpenTabsSnapshot | null>(null)

  useEffect(() => {
    if (!client || !connected || !hostId) {
      return
    }
    return subscribeRuntimeOrpc(
      client,
      (runtime) => runtime.session.tabs.subscribeAll,
      undefined,
      (event) => {
        switch (event.type) {
          case 'snapshots':
            setSnapshot({
              hostId,
              tabsByWorktree: tabsByWorktreeFromSnapshots(event.snapshots)
            })
            return
          case 'updated':
            setSnapshot((current) => {
              const tabsByWorktree = new Map(
                current?.hostId === hostId ? current.tabsByWorktree : EMPTY_OPEN_TABS_BY_WORKTREE
              )
              tabsByWorktree.set(event.worktree, event.tabs)
              return { hostId, tabsByWorktree }
            })
            return
          case 'end':
            return
        }
      }
    )
  }, [client, connected, hostId])

  return snapshot?.hostId === hostId ? snapshot.tabsByWorktree : EMPTY_OPEN_TABS_BY_WORKTREE
}
