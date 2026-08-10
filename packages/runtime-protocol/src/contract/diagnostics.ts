import { type, type ContractRouter } from '@orpc/contract'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

const DIAGNOSTICS_ACCESS = { scope: 'host', tier: 'read' } as const
const DIAGNOSTICS_CLIENTS = { mobile: true } as const

export type RuntimeUsageValues = {
  cpu: number
  memory: number
}

export type RuntimeAppMemory = RuntimeUsageValues & {
  main: RuntimeUsageValues
  renderer: RuntimeUsageValues
  other: RuntimeUsageValues
  history: number[]
}

export type RuntimeSessionMemory = RuntimeUsageValues & {
  sessionId: string
  paneKey: string | null
  pid: number
}

export type RuntimeWorktreeMemory = RuntimeUsageValues & {
  worktreeId: string
  worktreeName: string
  repoId: string
  repoName: string
  sessions: RuntimeSessionMemory[]
  history: number[]
}

export type RuntimeHostMemory = {
  totalMemory: number
  freeMemory: number
  usedMemory: number
  memoryUsagePercent: number
  cpuCoreCount: number
  loadAverage1m: number
}

export type RuntimeMemorySnapshot = {
  app: RuntimeAppMemory
  worktrees: RuntimeWorktreeMemory[]
  host: RuntimeHostMemory
  totalCpu: number
  totalMemory: number
  collectedAt: number
}

export const diagnosticsContract = {
  memory: withAccess(DIAGNOSTICS_ACCESS, DIAGNOSTICS_CLIENTS)
    .input(type<void>())
    .output(type<RuntimeMemorySnapshot>())
} satisfies ContractRouter<RuntimeProcedureMeta>
