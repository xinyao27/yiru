import { FolderOpen, Globe, Plus } from '@phosphor-icons/react'
import type { ComponentType } from 'react'
import { translate } from '~renderer/i18n/i18n'

export type AddRepoLocalStartActionHandlers = {
  onBrowse: () => void
  onOpenCloneStep: () => void
  onOpenCreateStep: () => void
  canCreateProject?: boolean
  browseHostKind?: 'local' | 'runtime'
}

export type AddRepoLocalStartAction = {
  kind: 'browse' | 'clone' | 'create'
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
  disabled?: boolean
  onClick: () => void
}

export function getAddRepoLocalStartActions({
  onBrowse,
  onOpenCloneStep,
  onOpenCreateStep,
  canCreateProject = true,
  browseHostKind = 'local'
}: AddRepoLocalStartActionHandlers): {
  primaryAction: AddRepoLocalStartAction
  secondaryActions: AddRepoLocalStartAction[]
} {
  const primaryAction = {
    kind: 'browse' as const,
    icon: FolderOpen,
    title: translate(
      'auto.components.sidebar.add.repo.local.start.actions.2281fdc8c7',
      'Browse folder'
    ),
    description:
      browseHostKind === 'runtime'
        ? translate(
            'auto.components.sidebar.add.repo.local.start.actions.runtimeBrowseDescription',
            'Existing Git repository or folder on this host'
          )
        : translate(
            'auto.components.sidebar.add.repo.local.start.actions.fb4fc5380e',
            'Local project, Git repo, or folder with many repos'
          ),
    onClick: onBrowse
  }

  const clone = {
    kind: 'clone' as const,
    icon: Globe,
    title: translate(
      'auto.components.sidebar.add.repo.local.start.actions.7edb8ebe24',
      'Clone from URL'
    ),
    description: translate(
      'auto.components.sidebar.add.repo.local.start.actions.5f9ffac036',
      'Clone a remote Git repository'
    ),
    onClick: onOpenCloneStep
  }
  const create = {
    kind: 'create' as const,
    icon: Plus,
    title: translate(
      'auto.components.sidebar.add.repo.local.start.actions.c709860596',
      'Create new project'
    ),
    description: canCreateProject
      ? translate(
          'auto.components.sidebar.add.repo.local.start.actions.d72789705e',
          'Start from an empty folder'
        )
      : translate(
          'auto.components.sidebar.add.repo.local.start.actions.sshCreateUnavailable',
          'Not available for SSH hosts yet'
        ),
    disabled: !canCreateProject,
    onClick: onOpenCreateStep
  }

  return { primaryAction, secondaryActions: [clone, create] }
}
