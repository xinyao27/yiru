import type { AppState } from '@/store'

import type { Repo } from '../../../../../shared/types'
import { getRepositorySourceControlAiSectionId } from '../../settings/repository-settings-targets'

export function openSourceControlAiSettingsTarget({
  activeRepo,
  openSettingsTarget,
  openSettingsPage
}: {
  activeRepo: Repo | null
  openSettingsTarget: AppState['openSettingsTarget']
  openSettingsPage: AppState['openSettingsPage']
}): void {
  if (activeRepo) {
    openSettingsTarget({
      pane: 'repo',
      repoId: activeRepo.id,
      sectionId: getRepositorySourceControlAiSectionId(activeRepo.id)
    })
  } else {
    openSettingsTarget({
      pane: 'git',
      repoId: null,
      sectionId: 'source-control-ai-settings'
    })
  }
  openSettingsPage()
}
