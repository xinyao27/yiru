import type { MrStateFilter, SmartNameMode } from './mobile-composer-source-types'

export type SmartModeIcon =
  | { type: 'phosphor'; name: 'sparkles' | 'git-branch' | 'case-sensitive' }
  | { type: 'provider'; provider: 'github' | 'gitlab' }

export type SmartModeOption = {
  id: SmartNameMode
  label: string
  icon: SmartModeIcon
}

export const SMART_MODE_OPTIONS: readonly SmartModeOption[] = [
  { id: 'smart', label: 'Smart', icon: { type: 'phosphor', name: 'sparkles' } },
  { id: 'github', label: 'GitHub', icon: { type: 'provider', provider: 'github' } },
  { id: 'gitlab', label: 'GitLab', icon: { type: 'provider', provider: 'gitlab' } },
  { id: 'branches', label: 'Branch', icon: { type: 'phosphor', name: 'git-branch' } },
  { id: 'text', label: 'Name', icon: { type: 'phosphor', name: 'case-sensitive' } }
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
  { id: 'opened', label: 'Open' },
  { id: 'merged', label: 'Merged' },
  { id: 'closed', label: 'Closed' },
  { id: 'all', label: 'All' }
]

export const DEFAULT_MR_STATE_FILTER: MrStateFilter = 'opened'
