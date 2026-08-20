import { useMemo } from 'react'
import { buildSidebarHostOptions } from '~renderer/components/sidebar/host-options'
import { getRepoHostIdentity } from '~renderer/store/slices/repo-host-identity'
import { getHostDisplayLabelOverrides } from '~shared/host-setting-overrides'

import type { PaletteStoreState } from './use-palette-store-state'

type PaletteHostOptionsInput = Pick<
  PaletteStoreState,
  'repos' | 'settings' | 'runtimeEnvironments' | 'runtimeStatusByEnvironmentId'
>

// Why: the repo lookup map and the host-badge registry are shared by the
// worktree pipeline, the row renderers, and the create-worktree flow — kept
// in one small hook so none of those recompute them independently.
export function usePaletteHostOptions(input: PaletteHostOptionsInput) {
  const { repos, settings, runtimeEnvironments, runtimeStatusByEnvironmentId } = input

  const repoMap = useMemo(() => new Map(repos.map((r) => [r.id, r])), [repos])
  const repoByHostIdentity = useMemo(
    () => new Map(repos.map((repo) => [getRepoHostIdentity(repo), repo])),
    [repos]
  )
  const hostLabelOverrides = useMemo(() => getHostDisplayLabelOverrides(settings), [settings])
  // Why: host badges only appear when more than one execution host exists; reuse
  // the same registry the sidebar host-scope strip builds so labels stay in sync.
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
  const canCreateWorktree = repos.length > 0

  return { repoMap, repoByHostIdentity, hostOptions, canCreateWorktree }
}

export type PaletteHostOptionsResult = ReturnType<typeof usePaletteHostOptions>
