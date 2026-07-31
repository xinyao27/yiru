import { parseAppSshPtyId } from '~shared/ssh-pty-id'

import type { PtyBufferSnapshot } from './pty/transport-types'

export type SshReattachModelReplay = {
  snapshot: PtyBufferSnapshot
  modelData: string
  replayWrites: readonly string[]
  dimensions: { cols: number; rows: number } | null
}

const SSH_REATTACH_MODEL_SNAPSHOT_TIMEOUT_MS = 750

async function resolveSnapshotWithTimeout(
  snapshot: Promise<PtyBufferSnapshot | null>,
  timeoutMs = SSH_REATTACH_MODEL_SNAPSHOT_TIMEOUT_MS
): Promise<PtyBufferSnapshot | null> {
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
function hasVisibleModel(snapshot: PtyBufferSnapshot | null): snapshot is PtyBufferSnapshot {
  return (
    snapshot?.source === 'headless' &&
    (snapshot.scrollbackAnsi?.length ?? 0) + snapshot.data.length > 0
  )
}

function resolveDimensions(snapshot: PtyBufferSnapshot): { cols: number; rows: number } | null {
  if (
    !Number.isFinite(snapshot.cols) ||
    !Number.isFinite(snapshot.rows) ||
    snapshot.cols <= 0 ||
    snapshot.rows <= 0
  ) {
    return null
  }
  return { cols: snapshot.cols, rows: snapshot.rows }
}

function buildReplayWrites(snapshot: PtyBufferSnapshot): readonly string[] {
  if (!snapshot.alternateScreen) {
    return ['\x1b[2J\x1b[3J\x1b[H', snapshot.data]
  }
  if (snapshot.scrollbackAnsi !== undefined) {
    return [
      '\x1b[?1049l\x1b[2J\x1b[3J\x1b[H',
      snapshot.scrollbackAnsi,
      '\x1b[0m\x1b[?1049h\x1b[2J\x1b[H',
      snapshot.data
    ]
  }
  return ['\x1b[0m\x1b[?1049h\x1b[2J\x1b[H', snapshot.data]
}

export function createSshReattachModelReplayProbe(args: {
  ptyId: string
  isParkingEnabled: () => boolean
  readSnapshot: () => Promise<PtyBufferSnapshot | null>
  timeoutMs?: number
}): () => Promise<SshReattachModelReplay | null> {
  let inFlight: Promise<SshReattachModelReplay | null> | null = null
  return () => {
    inFlight ??= (async () => {
      if (!args.isParkingEnabled() || parseAppSshPtyId(args.ptyId) === null) {
        return null
      }
      const snapshot = await resolveSnapshotWithTimeout(args.readSnapshot(), args.timeoutMs)
      if (!hasVisibleModel(snapshot)) {
        return null
      }
      return {
        snapshot,
        modelData: `${snapshot.scrollbackAnsi ?? ''}${snapshot.data}`,
        replayWrites: buildReplayWrites(snapshot),
        dimensions: resolveDimensions(snapshot)
      }
    })()
    return inFlight
  }
}
