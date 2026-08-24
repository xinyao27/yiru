import { useMemo } from 'react'
import { SlidersHorizontal } from '~renderer/components/icons/hugeicons'
import {
  isMacUserAgent,
  isWindowsUserAgent
} from '~renderer/components/terminal-pane/pane-interactions'
import { translate } from '~renderer/i18n/i18n'
import { useUiLocale } from '~renderer/i18n/use-ui-locale'
import type { SettingsNavSection } from '~renderer/lib/settings-navigation-types'
import { isWebClientLocation } from '~renderer/lib/web-client-location'
import {
  getWindowsTerminalCapabilityOwnerKey,
  useWindowsTerminalCapabilities
} from '~renderer/lib/windows-terminal-capabilities'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { useAppStore } from '~renderer/store'
import { getRepoKindLabel } from '~shared/repo-kind'
import type { Repo } from '~shared/types'

import { buildNavigationCoreSections } from './navigation-core-sections'
import { buildNavigationWorkflowSections } from './navigation-workflow-sections'
import { buildSettingsProjectList } from './project-list'
import { getRepositoryPaneSearchEntries } from './repository/search'

export { isWebClientLocation } from '~renderer/lib/web-client-location'

export function buildSettingsNavigationMetadata({
  isMac,
  isWindows,
  isWindowsTerminalHost = isWindows,
  isWebClient,
  isDev = import.meta.env.DEV,
  repos
}: {
  isMac: boolean
  isWindows: boolean
  isWindowsTerminalHost?: boolean
  isWebClient: boolean
  isDev?: boolean
  repos: readonly Repo[]
}): SettingsNavSection[] {
  const showDesktopOnlySettings = !isWebClient
  const reposById = new Map<string, Repo>()
  for (const repo of repos) {
    if (!reposById.has(repo.id)) {
      reposById.set(repo.id, repo)
    }
  }

  return [
    // Why: this order mirrors SETTINGS_NAV_GROUPS so Settings and Cmd+J read
    // top-to-bottom in the same grouped order.
    ...buildNavigationCoreSections({
      isMac,
      isWindows,
      isWindowsTerminalHost,
      showDesktopOnlySettings
    }),
    ...buildNavigationWorkflowSections({
      isDev,
      isMac,
      isWebClient,
      isWindows,
      isWindowsTerminalHost,
      showDesktopOnlySettings
    }),
    // Why: one nav row per project, not per repo row — a project set up on
    // multiple hosts collapses to a single entry derived from repos alone.
    ...buildSettingsProjectList(repos).map(({ project, representativeRepoId, setups }) => {
      const representativeRepo = reposById.get(representativeRepoId) ?? repos[0]
      const hostSummary =
        setups.length > 1
          ? translate(
              'auto.hooks.useSettingsNavigationMetadata.projectHostsSummary',
              '{{value0}} hosts',
              { value0: setups.length }
            )
          : (setups[0]?.path ?? representativeRepo.path)
      return {
        id: `repo-${representativeRepoId}`,
        title: project.displayName,
        description: `${getRepoKindLabel(project)} • ${hostSummary}`,
        icon: SlidersHorizontal,
        searchEntries: getRepositoryPaneSearchEntries(representativeRepo, {
          windowsRuntimeSupported: isWindowsTerminalHost
        }),
        group: 'repositories'
      }
    })
  ]
}

export function useSettingsNavigationMetadata(): SettingsNavSection[] {
  // Why: useUiLocale subscribes to language changes, but the active locale must
  // also invalidate the memo because translate() reads it implicitly.
  const activeLocale = useUiLocale()
  const repos = useAppStore((state) => state.repos)
  const settings = useAppStore((state) => state.settings)
  const isMac = isMacUserAgent()
  const isWindows = isWindowsUserAgent()
  const isWebClient = isWebClientLocation()
  const windowsTerminalCapabilityOwnerKey = getWindowsTerminalCapabilityOwnerKey(
    settings?.activeRuntimeEnvironmentId
  )
  const runtimeTarget = getActiveRuntimeTarget(settings)
  const windowsTerminalCapabilities = useWindowsTerminalCapabilities(
    isWindows || isWebClient || runtimeTarget.kind === 'environment',
    false,
    windowsTerminalCapabilityOwnerKey,
    runtimeTarget
  )
  const isWindowsTerminalHost = isWindows || windowsTerminalCapabilities.hostPlatform === 'win32'

  return useMemo(
    () =>
      buildSettingsNavigationMetadata({
        isMac,
        isWindows,
        isWindowsTerminalHost,
        isWebClient,
        isDev: import.meta.env.DEV,
        repos
      }),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- activeLocale is read implicitly by translate(); without it the memo keeps the previous language's sections.
    [isMac, isWindows, isWindowsTerminalHost, isWebClient, repos, activeLocale]
  )
}
