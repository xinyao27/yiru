import {
  TextAa as CaseSensitive,
  GitBranch,
  GithubLogo as Github,
  GitlabLogo as Gitlab,
  Sparkle as Sparkles
} from '@phosphor-icons/react'
import type React from 'react'

import { translate } from '@/i18n/i18n'

import type { SmartNameMode } from './smart-workspace-source-results'

export type MrStateFilter = 'opened' | 'merged' | 'closed' | 'all'

export type SmartWorkspaceNameModeOption = {
  id: SmartNameMode
  label: string
  Icon: React.ComponentType<{ className?: string }>
}

export function getMrStateFilters(): { id: MrStateFilter; label: string }[] {
  return [
    {
      id: 'opened',
      label: translate('auto.components.new.workspace.SmartWorkspaceNameField.622864b52a', 'Open')
    },
    {
      id: 'merged',
      label: translate('auto.components.new.workspace.SmartWorkspaceNameField.2319d87718', 'Merged')
    },
    {
      id: 'closed',
      label: translate('auto.components.new.workspace.SmartWorkspaceNameField.6fad211c66', 'Closed')
    },
    {
      id: 'all',
      label: translate('auto.components.new.workspace.SmartWorkspaceNameField.26824f60dd', 'All')
    }
  ]
}

export function getSmartWorkspaceNameModes(): SmartWorkspaceNameModeOption[] {
  return [
    {
      id: 'smart',
      label: translate('auto.components.new.workspace.SmartWorkspaceNameField.b3c60c2b7c', 'Smart'),
      Icon: Sparkles
    },
    {
      id: 'github',
      label: translate(
        'auto.components.new.workspace.SmartWorkspaceNameField.0a180280bd',
        'GitHub'
      ),
      Icon: Github
    },
    {
      id: 'gitlab',
      label: translate(
        'auto.components.new.workspace.SmartWorkspaceNameField.2cfc6be192',
        'GitLab'
      ),
      Icon: Gitlab
    },
    {
      id: 'branches',
      label: translate(
        'auto.components.new.workspace.SmartWorkspaceNameField.2e4c7c95fe',
        'Branch'
      ),
      Icon: GitBranch
    },
    {
      id: 'text',
      label: translate('auto.components.new.workspace.SmartWorkspaceNameField.6f07a18604', 'Name'),
      Icon: CaseSensitive
    }
  ]
}
