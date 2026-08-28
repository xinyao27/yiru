import type {
  BrowserProfileListResult,
  BrowserSnapshotResult,
  BrowserTabCurrentResult,
  BrowserTabListResult,
  BrowserTabProfileCloneResult,
  BrowserTabProfileShowResult,
  BrowserTabShowResult
} from '@yiru/runtime-protocol/contract'

import { translate } from '../../i18n/translate'

export function displayBrowserSnapshot(result: BrowserSnapshotResult): string {
  return [`page: ${result.browserPageId}`, `${result.title} — ${result.url}`, result.snapshot].join(
    '\n'
  )
}

export function displayBrowserTabs(result: BrowserTabListResult, showProfile: boolean): string {
  if (result.tabs.length === 0) {
    return translate('No browser tabs open.')
  }
  return result.tabs
    .map((tab) => {
      const profile = showProfile
        ? `  [${tab.profileLabel ?? tab.profileId ?? translate('Unknown')}]`
        : ''
      return `${tab.active ? '* ' : '  '}[${tab.index}] ${tab.browserPageId}  ${tab.title} — ${tab.url}${profile}`
    })
    .join('\n')
}

export function displayBrowserTab(result: BrowserTabShowResult | BrowserTabCurrentResult): string {
  const tab = result.tab
  return [
    `page: ${tab.browserPageId}`,
    `title: ${tab.title}`,
    `url: ${tab.url}`,
    `active: ${tab.active}`,
    `worktree: ${tab.worktreeId ?? translate('unknown')}`,
    `profile: ${tab.profileLabel ?? tab.profileId ?? translate('unknown')}`
  ].join('\n')
}

export function displayBrowserProfiles(result: BrowserProfileListResult): string {
  if (result.profiles.length === 0) {
    return translate('No browser profiles found.')
  }
  return result.profiles
    .map((profile) => {
      const source = profile.source?.browserFamily ?? translate('none')
      return `${profile.scope === 'default' ? '* ' : '  '}${profile.id}  ${profile.label}  ${profile.scope}  source:${source}`
    })
    .join('\n')
}

export function displayTabProfile(result: BrowserTabProfileShowResult): string {
  return [
    `page: ${result.browserPageId}`,
    `worktree: ${result.worktreeId ?? translate('unknown')}`,
    `profileId: ${result.profileId ?? translate('default')}`,
    `profile: ${result.profileLabel ?? result.profileId ?? translate('default')}`
  ].join('\n')
}

export function displayClonedTab(result: BrowserTabProfileCloneResult): string {
  return translate(
    `Cloned ${result.sourceBrowserPageId} to ${result.browserPageId} (${result.profileLabel ?? result.profileId ?? 'default'})`
  )
}
