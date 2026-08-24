import os from 'node:os'
import { basename } from 'node:path'

import { splitWorktreeIdForFilesystem } from '@yiru/workbench-model/workspace'
import { ORPHAN_WORKTREE_ID } from '~shared/constants'
import type { HostMemory, MemorySnapshot, SessionMemory, WorktreeMemory } from '~shared/types'

import type { Store } from '../persistence'
import { bucketHostProcessMetrics, clampMemoryMetric } from './app-process-buckets'
import type { RuntimeHostProcessMetricsProvider } from './app-process-buckets'
import { recordMemoryHistory } from './history'
import { collectProcessSubtree, enumerateProcesses } from './process-enumeration'
import { listRegisteredPtys } from './pty-registry'

export type {
  RuntimeHostProcessMetric,
  RuntimeHostProcessMetricsProvider
} from './app-process-buckets'

export type MemorySnapshotStore = Pick<Store, 'getRepo' | 'getWorktreeMeta'>

type WorktreeBucket = {
  worktreeId: string
  worktreeName: string
  repoId: string
  repoName: string
  cpu: number
  memory: number
  sessions: SessionMemory[]
}

let inflight: Promise<MemorySnapshot> | null = null

function getHostMetrics(): HostMemory {
  const total = clampMemoryMetric(os.totalmem())
  const free = clampMemoryMetric(os.freemem())
  const used = Math.max(0, total - free)
  return {
    totalMemory: total,
    freeMemory: free,
    usedMemory: used,
    memoryUsagePercent: total > 0 ? (used / total) * 100 : 0,
    cpuCoreCount: Math.max(1, os.cpus().length),
    loadAverage1m: clampMemoryMetric(os.loadavg()[0])
  }
}

function emptySnapshot(): MemorySnapshot {
  const zero = { cpu: 0, memory: 0 }
  return {
    app: { ...zero, main: zero, renderer: zero, other: zero, history: [] },
    worktrees: [],
    host: getHostMetrics(),
    totalCpu: 0,
    totalMemory: 0,
    collectedAt: Date.now()
  }
}

function resolveWorktreeNames(
  worktreeId: string,
  store: MemorySnapshotStore
): { worktreeName: string; repoId: string; repoName: string } {
  const parsed = splitWorktreeIdForFilesystem(worktreeId)
  const repoId = parsed?.repoId ?? worktreeId
  const worktreePath = parsed?.worktreePath ?? ''
  const fallbackName = worktreePath ? basename(worktreePath) : worktreeId
  const meta = store.getWorktreeMeta(worktreeId)
  const repo = store.getRepo(repoId)
  return {
    worktreeName: meta?.displayName?.trim() || fallbackName,
    repoId,
    repoName: repo?.displayName?.trim() || repoId || 'Unknown Repo'
  }
}

function makeEmptyBucket(
  worktreeId: string,
  worktreeName: string,
  repoId: string,
  repoName: string
): WorktreeBucket {
  return { worktreeId, worktreeName, repoId, repoName, cpu: 0, memory: 0, sessions: [] }
}

function getNodeHostProcessMetrics() {
  return [
    {
      pid: process.pid,
      type: 'browser',
      cpu: { percentCPUUsage: 0 },
      memory: { workingSetSize: process.memoryUsage().rss / 1024 }
    }
  ]
}

export async function collectMemorySnapshot(
  store: MemorySnapshotStore,
  getHostProcessMetrics: RuntimeHostProcessMetricsProvider = getNodeHostProcessMetrics
): Promise<MemorySnapshot> {
  if (inflight) {
    return inflight
  }
  inflight = runSnapshot(store, getHostProcessMetrics)
    .catch((error) => {
      console.warn('[memory] snapshot failed; returning empty', error)
      return emptySnapshot()
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

async function runSnapshot(
  store: MemorySnapshotStore,
  getHostProcessMetrics: RuntimeHostProcessMetricsProvider
): Promise<MemorySnapshot> {
  const processIndex = await enumerateProcesses()
  const appBuckets = bucketHostProcessMetrics(processIndex, getHostProcessMetrics())
  const claimed = new Set<number>()
  const orphan = makeEmptyBucket(
    ORPHAN_WORKTREE_ID,
    'Unattributed terminals',
    ORPHAN_WORKTREE_ID,
    'Other'
  )
  const worktreeBuckets = new Map<string, WorktreeBucket>()

  for (const pty of listRegisteredPtys()) {
    let sessionCpu = 0
    let sessionMemory = 0
    if (pty.pid != null) {
      for (const pid of collectProcessSubtree(processIndex, pty.pid)) {
        if (claimed.has(pid)) {
          continue
        }
        const row = processIndex.byPid.get(pid)
        if (!row) {
          continue
        }
        claimed.add(pid)
        sessionCpu += row.cpu
        sessionMemory += row.memory
      }
    }
    const session: SessionMemory = {
      sessionId: pty.sessionId ?? pty.ptyId,
      paneKey: pty.paneKey,
      pid: pty.pid ?? 0,
      cpu: clampMemoryMetric(sessionCpu),
      memory: clampMemoryMetric(sessionMemory)
    }
    let bucket = orphan
    if (pty.worktreeId) {
      const existing = worktreeBuckets.get(pty.worktreeId)
      if (existing) {
        bucket = existing
      } else {
        const names = resolveWorktreeNames(pty.worktreeId, store)
        bucket = makeEmptyBucket(pty.worktreeId, names.worktreeName, names.repoId, names.repoName)
        worktreeBuckets.set(pty.worktreeId, bucket)
      }
    }
    bucket.cpu += session.cpu
    bucket.memory += session.memory
    bucket.sessions.push(session)
  }

  const bucketList = [...worktreeBuckets.values()]
  if (orphan.sessions.length > 0) {
    bucketList.push(orphan)
  }
  const now = Date.now()
  const history = recordMemoryHistory(appBuckets.memory, bucketList, now)
  const worktrees: WorktreeMemory[] = bucketList.map((bucket) => ({
    ...bucket,
    history: history.byWorktreeId.get(bucket.worktreeId) ?? []
  }))
  let sessionCpuTotal = 0
  let sessionMemoryTotal = 0
  for (const worktree of worktrees) {
    sessionCpuTotal += worktree.cpu
    sessionMemoryTotal += worktree.memory
  }
  return {
    app: { ...appBuckets, history: history.app },
    worktrees,
    host: getHostMetrics(),
    totalCpu: appBuckets.cpu + sessionCpuTotal,
    totalMemory: appBuckets.memory + sessionMemoryTotal,
    collectedAt: now
  }
}
