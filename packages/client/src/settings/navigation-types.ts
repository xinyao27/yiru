import type { ComponentType } from 'react'
import type { IconProps } from '~renderer/icons/hugeicons'
import type { SettingsSearchEntry } from '~renderer/settings/search'

export type SettingsNavIcon = ComponentType<IconProps>
export type SettingsNavInstallStatus =
  | 'install'
  | 'installed'
  | 'up-to-date'
  | 'update-available'
  | 'checking'

export type SettingsNavTarget =
  | 'general'
  | 'integrations'
  | 'accounts'
  | 'browser'
  | 'git'
  | 'appearance'
  | 'terminal'
  | 'quick-commands'
  | 'notifications'
  | 'computer-use'
  | 'developer-permissions'
  | 'privacy'
  | 'advanced'
  | 'dev'
  | 'shortcuts'
  | 'experimental'
  | 'agents'
  | 'orchestration'
  | 'runtime-environments'
  | 'mobile'
  | 'mobile-emulator'
  | 'repo'

export type SettingsNavSection = {
  id: string
  title: string
  description: string
  icon: SettingsNavIcon
  searchEntries: SettingsSearchEntry[]
  group: string
  badge?: string
  installStatus?: SettingsNavInstallStatus
}

export type SettingsNavGroup = {
  id: string
  title: string
  hideTitle?: boolean
  sections: SettingsNavSection[]
}
