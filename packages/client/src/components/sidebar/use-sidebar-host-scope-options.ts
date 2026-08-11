import { useMemo } from 'react'
import { useAppStore } from '~renderer/store'
import { getHostDisplayLabelOverrides } from '~shared/host-setting-overrides'

import {
  buildSidebarHostOptions,
  buildSidebarHostScopeOptions,
  type SidebarHostOption,
  type SidebarHostScopeOption
} from './host-options'

/** Shared host-scope derivation for the sidebar scope strip and the workspace
 * options menu so both surfaces consume the same live runtime status without
 * duplicating store wiring. */
export function useSidebarHostScopeOptions(): {
  hostOptions: SidebarHostOption[]
  hostScopeOptions: SidebarHostScopeOption[]
} {
  const repos = useAppStore((s) => s.repos)
  const settings = useAppStore((s) => s.settings)
  const runtimeEnvironments = useAppStore((s) => s.runtimeEnvironments)
  const runtimeStatusByEnvironmentId = useAppStore((s) => s.runtimeStatusByEnvironmentId)

  const hostLabelOverrides = useMemo(() => getHostDisplayLabelOverrides(settings), [settings])
  const hostOptions = useMemo(
    () =>
      buildSidebarHostOptions({
        repos,
        settings,
        runtimeEnvironments,
        runtimeStatusByEnvironmentId,
        hostLabelOverrides
      }),
    [repos, settings, runtimeEnvironments, runtimeStatusByEnvironmentId, hostLabelOverrides]
  )
  const hostScopeOptions = useMemo(() => buildSidebarHostScopeOptions(hostOptions), [hostOptions])

  return { hostOptions, hostScopeOptions }
}
