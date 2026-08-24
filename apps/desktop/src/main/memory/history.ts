const APP_HISTORY_KEY = '__app__'
const HISTORY_CAPACITY = 60
const HISTORY_STALE_MS = 10 * 60 * 1000

type HistoryRing = {
  samples: number[]
  touchedAt: number
}

const historyByKey = new Map<string, HistoryRing>()

function pushHistorySample(key: string, memoryBytes: number, now: number): void {
  let ring = historyByKey.get(key)
  if (!ring) {
    ring = { samples: [], touchedAt: now }
    historyByKey.set(key, ring)
  }
  ring.samples.push(memoryBytes)
  if (ring.samples.length > HISTORY_CAPACITY) {
    ring.samples.shift()
  }
  ring.touchedAt = now
}

function readHistory(key: string): number[] {
  return historyByKey.get(key)?.samples.slice() ?? []
}

export function recordMemoryHistory(
  appMemory: number,
  worktrees: readonly { worktreeId: string; memory: number }[],
  now: number
): { app: number[]; byWorktreeId: Map<string, number[]> } {
  pushHistorySample(APP_HISTORY_KEY, appMemory, now)
  for (const worktree of worktrees) {
    pushHistorySample(worktree.worktreeId, worktree.memory, now)
  }
  for (const [key, ring] of historyByKey) {
    if (now - ring.touchedAt > HISTORY_STALE_MS) {
      historyByKey.delete(key)
    }
  }
  return {
    app: readHistory(APP_HISTORY_KEY),
    byWorktreeId: new Map(
      worktrees.map((worktree) => [worktree.worktreeId, readHistory(worktree.worktreeId)])
    )
  }
}
