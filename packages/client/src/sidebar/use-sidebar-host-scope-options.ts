import { getHostDisplayLabelOverrides } from '~renderer/host-setting-overrides'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { useAppStore } from '~renderer/store/state'

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
  const { repos, runtimeEnvironments } = useProjectCatalog()
  const settings = useAppStore((s) => s.settings)
  const runtimeStatusByEnvironmentId = useAppStore((s) => s.runtimeStatusByEnvironmentId)

  const hostLabelOverrides = (() => getHostDisplayLabelOverrides(settings))()
  const hostOptions = (() =>
    buildSidebarHostOptions({
      repos,
      settings,
      runtimeEnvironments,
      runtimeStatusByEnvironmentId,
      hostLabelOverrides
    }))()
  const hostScopeOptions = (() => buildSidebarHostScopeOptions(hostOptions))()

  return { hostOptions, hostScopeOptions }
}
