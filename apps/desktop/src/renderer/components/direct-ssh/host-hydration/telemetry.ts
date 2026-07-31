import type { DirectSshPreparationInputTelemetry } from '../reconnect/coordinator'
import type { DirectSshTargetScope } from '../target-scope/scope'

export function directSshHostHydrationTelemetry(
  scope: DirectSshTargetScope,
  catalogOutcome: DirectSshPreparationInputTelemetry['catalogOutcome'],
  catalogDurationMs: number
): DirectSshPreparationInputTelemetry {
  return {
    catalogOutcome,
    catalogDurationMs,
    gitWorktreeCount: scope.gitWorktreeIds.size,
    folderWorkspaceCount: Math.max(0, scope.terminalWorkspaceKeys.size - scope.gitWorktreeIds.size),
    ambiguousOwnerCount: scope.ambiguousOwnerCount,
    contradictoryOwnerCount: scope.contradictoryOwnerCount
  }
}
