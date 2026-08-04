import { parseWslUncPath } from '@yiru/workbench-model/platform'
import { GitCapabilityCache } from '~shared/git/capability-cache'

type LocalGitCapabilityTarget = {
  cwd?: string
  wslDistro?: string
}

const localCapabilitiesByExecutionHost = new Map<string, GitCapabilityCache>()

function getLocalGitExecutionHostKey(target: LocalGitCapabilityTarget): string {
  const wslDistro =
    target.wslDistro ?? (target.cwd ? parseWslUncPath(target.cwd)?.distro : undefined)
  return wslDistro ? `wsl:${wslDistro}` : 'local'
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
