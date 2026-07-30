export function hasPositiveTerminalDimensions(cols: unknown, rows: unknown): boolean {
  return (
    typeof cols === 'number' &&
    typeof rows === 'number' &&
    Number.isFinite(cols) &&
    Number.isFinite(rows) &&
    cols > 0 &&
    rows > 0
  )
}

export function buildMainModelSnapshotReplayWrites(snapshot: {
  data: string
  alternateScreen?: boolean
  scrollbackAnsi?: string
}): string[] {
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
