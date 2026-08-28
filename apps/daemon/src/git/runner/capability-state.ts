import { parseWslUncPath } from '@yiru/runtime-protocol/model/platform'
import {
  LOCAL_EXECUTION_HOST_ID,
  toWslExecutionHostId,
  type ExecutionHostId
} from '@yiru/runtime-protocol/model/workspace'
import { GitCapabilityCache } from '@yiru/runtime-protocol/workbench/git/capability-cache'

type LocalGitCapabilityTarget = {
  cwd?: string
  wslDistro?: string
}

const localCapabilitiesByExecutionHost = new Map<ExecutionHostId, GitCapabilityCache>()

function getLocalGitExecutionHostKey(target: LocalGitCapabilityTarget): ExecutionHostId {
  const wslDistro =
    target.wslDistro ?? (target.cwd ? parseWslUncPath(target.cwd)?.distro : undefined)
  return wslDistro ? toWslExecutionHostId(wslDistro) : LOCAL_EXECUTION_HOST_ID
}

export function getLocalGitCapabilityCache(
  target: LocalGitCapabilityTarget = {}
): GitCapabilityCache {
  const executionHost = getLocalGitExecutionHostKey(target)
  let cache = localCapabilitiesByExecutionHost.get(executionHost)
  if (!cache) {
    cache = new GitCapabilityCache()
    localCapabilitiesByExecutionHost.set(executionHost, cache)
  }
  return cache
}
