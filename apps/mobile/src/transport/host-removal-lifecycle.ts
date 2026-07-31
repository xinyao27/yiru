import { forgetHomeSnapshotHost } from '~/cache/home-snapshot-cache'

import { removeHost } from './host-store'

export async function removeHostAndCloseClient(
  hostId: string,
  closeHostClient: (hostId: string) => void
): Promise<void> {
  // Why: closing before the metadata commit can strand a still-paired host on
  // storage failure; closing immediately after success prevents socket leaks.
  await removeHost(hostId)
  closeHostClient(hostId)
  // Why: the persisted home snapshot is host-scoped state and must not outlive
  // the host, or a removed host's cards rehydrate on the next cold start.
  forgetHomeSnapshotHost(hostId)
}
