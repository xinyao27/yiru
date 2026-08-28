import type {
  PreflightAgentContextInput,
  PreflightCheckInput,
  PreflightDetectRemoteAgentsInput,
  PreflightStatus,
  RefreshAgentsResult
} from '@yiru/runtime-protocol/contract'
import {
  detectRemoteAgents,
  detectInstalledAgentsWithShellPathHydration,
  refreshShellPathAndDetectAgents,
  runPreflightCheck
} from '~main/preflight/preflight'

export function runRuntimePreflightCheck(params: PreflightCheckInput): Promise<PreflightStatus> {
  // Why: forward the whole context, not just `force` — `getPreflightWslTarget`
  // reads projectRuntime/wslDistro to pick which runtime to probe.
  return runPreflightCheck(params.force, params)
}

export function detectRuntimeAgents(params: PreflightAgentContextInput): Promise<string[]> {
  return detectInstalledAgentsWithShellPathHydration(params)
}

export function detectRemoteRuntimeAgents(
  params: PreflightDetectRemoteAgentsInput
): Promise<string[]> {
  return detectRemoteAgents(params)
}

export function refreshRuntimeAgents(
  params: PreflightAgentContextInput
): Promise<RefreshAgentsResult> {
  return refreshShellPathAndDetectAgents(params)
}
