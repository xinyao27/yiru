import { translate } from '~/i18n/translate'

import type { MrStateFilter, SmartNameMode } from './composer-source-types'

export type SmartModeIcon =
  | { type: 'phosphor'; name: 'sparkles' | 'git-merge' | 'case-sensitive' }
  | { type: 'provider'; provider: 'github' | 'gitlab' }

export type SmartModeOption = {
  id: SmartNameMode
  label: string
  icon: SmartModeIcon
}

export const SMART_MODE_OPTIONS: readonly SmartModeOption[] = [
  {
    id: 'smart',
    label: translate('mobile.newWorkspace.source.mode.smart', 'Smart'),
    icon: { type: 'phosphor', name: 'sparkles' }
  },
  {
    id: 'github',
    label: translate('mobile.newWorkspace.source.mode.github', 'GitHub'),
    icon: { type: 'provider', provider: 'github' }
  },
  {
    id: 'gitlab',
    label: translate('mobile.newWorkspace.source.mode.gitlab', 'GitLab'),
    icon: { type: 'provider', provider: 'gitlab' }
  },
  {
    id: 'branches',
    label: translate('mobile.newWorkspace.source.mode.branch', 'Branch'),
    icon: { type: 'phosphor', name: 'git-merge' }
  },
  {
    id: 'text',
    label: translate('mobile.newWorkspace.source.mode.name', 'Name'),
    icon: { type: 'phosphor', name: 'case-sensitive' }
  }
]

export type SmartModeAvailabilityInput = {
  textOnly: boolean
  hasRepo: boolean
  githubAvailable: boolean
  gitlabAvailable: boolean
}

export function resolveAvailableSmartModes(input: SmartModeAvailabilityInput): SmartNameMode[] {
  if (input.textOnly) {
    return ['text']
  }
  return SMART_MODE_OPTIONS.filter((option) => {
    switch (option.id) {
      case 'smart':
        return input.hasRepo && (input.githubAvailable || input.gitlabAvailable)
      case 'github':
        return input.hasRepo && input.githubAvailable
      case 'gitlab':
        return input.hasRepo && input.gitlabAvailable
      case 'branches':
        return input.hasRepo
      case 'text':
        return true
    }
  }).map((option) => option.id)
}

export function resolveDefaultSmartMode(input: SmartModeAvailabilityInput): SmartNameMode {
  const available = resolveAvailableSmartModes(input)
  return available.includes('smart') ? 'smart' : (available[0] ?? 'text')
}

export function normalizeSmartMode(
  mode: SmartNameMode,
  input: SmartModeAvailabilityInput
): SmartNameMode {
  const available = resolveAvailableSmartModes(input)
  return available.includes(mode) ? mode : resolveDefaultSmartMode(input)
}

export type MrStateFilterOption = { id: MrStateFilter; label: string }

export const MR_STATE_FILTER_OPTIONS: readonly MrStateFilterOption[] = [
  { id: 'opened', label: translate('mobile.newWorkspace.source.state.open', 'Open') },
  { id: 'merged', label: translate('mobile.newWorkspace.source.state.merged', 'Merged') },
  { id: 'closed', label: translate('mobile.newWorkspace.source.state.closed', 'Closed') },
  { id: 'all', label: translate('mobile.newWorkspace.source.state.all', 'All') }
]

export const DEFAULT_MR_STATE_FILTER: MrStateFilter = 'opened'
