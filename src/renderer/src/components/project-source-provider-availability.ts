import { parseExecutionHostId } from '../../../shared/execution-host'
import type { PreflightStatus } from '../../../preload/api-types'
import type {
  ProjectSourceContext,
  ProjectSourceProvider
} from '../../../shared/project-source-context'
import type { ProjectSourceHostAvailability } from './project-source-host-availability'

export type RuntimeProviderPreflightStatus = {
  checked: boolean
  status: PreflightStatus | null
}

function getProviderStatus(
  provider: ProjectSourceProvider,
  status: PreflightStatus | null
): { installed: boolean; authenticated: boolean } | 'unsupported' | null {
  if (!status) {
    return null
  }
  if (provider === 'github') {
    return status.gh
  }
  return Object.hasOwn(status, 'glab')
    ? (status.glab ?? { installed: false, authenticated: false })
    : 'unsupported'
}

export function getRepoBackedProviderAvailability(args: {
  provider: ProjectSourceProvider
  contexts: readonly ProjectSourceContext[]
  preflightStatus: PreflightStatus | null
  preflightReady: boolean
  runtimePreflightStatusByHostId?: ReadonlyMap<
    ProjectSourceContext['hostId'],
    RuntimeProviderPreflightStatus
  >
}): ProjectSourceHostAvailability[] {
  return args.contexts.flatMap((context) => {
    const parsed = parseExecutionHostId(context.hostId)
    const hostPreflight =
      parsed?.kind !== 'runtime'
        ? { checked: args.preflightReady, status: args.preflightStatus }
        : args.runtimePreflightStatusByHostId?.get(context.hostId)
    if (!hostPreflight?.checked) {
      return []
    }

    const status = getProviderStatus(args.provider, hostPreflight.status)
    const reason =
      status === 'unsupported'
        ? 'unsupported-provider'
        : status && !status.installed
          ? 'unavailable-source-tool'
          : status && !status.authenticated
            ? 'missing-provider-auth'
            : null
    return reason ? [{ hostId: context.hostId, reason }] : []
  })
}
