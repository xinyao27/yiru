import type { MobileTerminalSnapshot } from '~/transport/terminal-multiplex/types'

import type { MobileDisplayMode } from '../screen-state'

export function applyMobileTerminalSnapshotMetadata(
  handle: string,
  snapshot: MobileTerminalSnapshot,
  cwdByHandle: Map<string, string>,
  setModes: React.Dispatch<React.SetStateAction<Map<string, MobileDisplayMode>>>
): void {
  if (snapshot.metadata.cwd) {
    cwdByHandle.set(handle, snapshot.metadata.cwd)
  }
  setModes((current) => new Map(current).set(handle, snapshot.metadata.displayMode))
}

export function mobileTerminalSnapshotDiagnostic(
  snapshot: MobileTerminalSnapshot
): Record<string, unknown> {
  return {
    cols: snapshot.cols,
    rows: snapshot.rows,
    serialized: snapshot.normalScrollback + snapshot.normalScreen,
    displayMode: snapshot.metadata.displayMode,
    source: snapshot.source,
    scrollbackRows: snapshot.retainedScrollbackRows,
    truncated: snapshot.truncated
  }
}
