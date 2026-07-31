// Why: persist the data needed to render the home page so cold-start /
// resume-from-background paints instantly with the last known good
// values, then updates in place when fresh RPC data arrives. Without
// this, Resume and Account-usage cards flash empty for ~1s while the
// WebSocket reconnects and the first responses come back.
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { RuntimeStatsSummary } from '@yiru/runtime-protocol/mobile-runtime-types'

import type { AccountsSnapshot } from '../components/account-usage'

const STORAGE_KEY = 'yiru:home-snapshot:v1'

type WorktreeSummary = {
  worktreeId: string
  repo: string
  branch: string
  displayName: string
  liveTerminalCount: number
  status?: 'working' | 'active' | 'permission' | 'done' | 'inactive'
}

type HostWorktreeInfo = {
  hostId: string
  totalWorktrees: number
  activeCount: number
  activeWorktrees?: WorktreeSummary[]
  attentionCount?: number
  lastActiveWorktree: WorktreeSummary | null
}

export type HomeSnapshot = {
  worktreeInfo: Record<string, HostWorktreeInfo>
  accountsByHost: Record<string, AccountsSnapshot>
  statsByHost?: Record<string, RuntimeStatsSummary>
  savedAt: number
}

let memoryCache: HomeSnapshot | null = null
let writeTimer: ReturnType<typeof setTimeout> | null = null

export async function loadHomeSnapshot(): Promise<HomeSnapshot | null> {
  if (memoryCache) {
    return memoryCache
  }
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as HomeSnapshot
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.worktreeInfo !== 'object' ||
      typeof parsed.accountsByHost !== 'object'
    ) {
      return null
    }
    memoryCache = parsed
    return parsed
  } catch {
    return null
  }
}

// Why: throttle writes so a flurry of streamed account-snapshot updates
// (one per provider fetch finishing) doesn't hammer AsyncStorage.
export function saveHomeSnapshot(snapshot: HomeSnapshot): void {
  memoryCache = snapshot
  scheduleSnapshotWrite(snapshot)
}

// Why: host-scoped state must never outlive its host (AGENTS.md §7). Nothing
// pruned these records, so a removed host's worktrees and account usage stayed
// on disk forever and could be rehydrated onto the home screen after re-pairing
// under a new id.
export function forgetHomeSnapshotHost(hostId: string): void {
  const snapshot = memoryCache
  if (!snapshot) {
    return
  }
  if (
    !(hostId in snapshot.worktreeInfo) &&
    !(hostId in snapshot.accountsByHost) &&
    !(snapshot.statsByHost && hostId in snapshot.statsByHost)
  ) {
    return
  }
  const { [hostId]: _removedWorktrees, ...worktreeInfo } = snapshot.worktreeInfo
  const { [hostId]: _removedAccounts, ...accountsByHost } = snapshot.accountsByHost
  const { [hostId]: _removedStats, ...statsByHost } = snapshot.statsByHost ?? {}
  const pruned: HomeSnapshot = {
    worktreeInfo,
    accountsByHost,
    statsByHost,
    savedAt: snapshot.savedAt
  }
  memoryCache = pruned
  scheduleSnapshotWrite(pruned)
}

function scheduleSnapshotWrite(snapshot: HomeSnapshot): void {
  if (writeTimer) {
    clearTimeout(writeTimer)
  }
  writeTimer = setTimeout(() => {
    writeTimer = null
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)).catch(() => {})
  }, 250)
}
