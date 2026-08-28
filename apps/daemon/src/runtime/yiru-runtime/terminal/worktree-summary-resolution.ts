import type { RuntimeWorktreePsSummary } from '@yiru/runtime-protocol/workbench/runtime-types'

import {
  findRuntimeWorktreeSummaryByPath,
  parseRuntimeWorktreeId,
  type RuntimeWorktreeSummaryPathIndex
} from '../model/worktree-identity'
import { RuntimeTerminalRecordRetention } from './record-retention'

export abstract class RuntimeTerminalWorktreeSummaryResolution extends RuntimeTerminalRecordRetention {
  protected getSummaryForRuntimeWorktreeId(
    summaries: Map<string, RuntimeWorktreePsSummary>,
    pathIndex: RuntimeWorktreeSummaryPathIndex,
    missingRuntimeWorktreeIds: Set<string>,
    runtimeWorktreeId: string
  ): RuntimeWorktreePsSummary | null {
    const direct = summaries.get(runtimeWorktreeId)
    if (direct) {
      return direct
    }
    if (missingRuntimeWorktreeIds.has(runtimeWorktreeId)) {
      return null
    }
    const parsed = parseRuntimeWorktreeId(runtimeWorktreeId)
    const resolved = parsed
      ? findRuntimeWorktreeSummaryByPath(
          pathIndex,
          parsed.repoId,
          parsed.worktreePath,
          pathIndex.platformByRepoId.get(parsed.repoId) ?? process.platform
        )
      : null
    if (!resolved) {
      missingRuntimeWorktreeIds.add(runtimeWorktreeId)
    }
    return resolved
  }
}
