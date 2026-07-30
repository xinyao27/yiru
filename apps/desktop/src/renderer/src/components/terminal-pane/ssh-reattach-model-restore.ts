import { parseAppSshPtyId } from '../../../../shared/ssh-pty-id'

export type SshReattachModelSnapshot = {
  data: string
  source?: 'headless' | 'renderer'
  scrollbackAnsi?: string
  pendingEscapeTailAnsi?: string
}

export const SSH_REATTACH_MODEL_SNAPSHOT_TIMEOUT_MS = 750

export async function resolveSshReattachModelSnapshotWithTimeout<T>(
  snapshot: Promise<T>,
  timeoutMs = SSH_REATTACH_MODEL_SNAPSHOT_TIMEOUT_MS
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      snapshot.catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs)
      })
    ])
  } finally {
    if (timer !== null) {
      clearTimeout(timer)
    }
  }
}

// Why: a parked pane no longer has a renderer serializer. Only a non-empty
// headless model is authoritative; a dangling escape tail alone is not visible
// content, so it must fall back to relay replay rather than paint a blank pane.
export function shouldPaintSshReattachModelSnapshot(args: {
  ptyId: string
  sshParkingEnabled: boolean
  snapshot: SshReattachModelSnapshot | null
}): boolean {
  if (!args.sshParkingEnabled || parseAppSshPtyId(args.ptyId) === null) {
    return false
  }
  if (!args.snapshot || args.snapshot.source !== 'headless') {
    return false
  }
  return (args.snapshot.scrollbackAnsi?.length ?? 0) + args.snapshot.data.length > 0
}

export function shouldFetchSshReattachModelSnapshot(args: {
  ptyId: string
  sshParkingEnabled: boolean
}): boolean {
  return args.sshParkingEnabled && parseAppSshPtyId(args.ptyId) !== null
}

export function memoizeSshReattachModelSnapshotProbe<T>(
  probe: () => Promise<T | null>
): () => Promise<T | null> {
  let inFlight: Promise<T | null> | null = null
  return () => {
    inFlight ??= probe()
    return inFlight
  }
}
