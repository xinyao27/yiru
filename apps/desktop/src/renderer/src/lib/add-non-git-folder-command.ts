import type { AppState } from '@/store/types'

import type { Repo } from '../../../shared/types'
import { buildDismissedOnboardingFolderAgentStartup } from './onboarding-folder-agent-startup'
import { markOnboardingProjectAdded } from './onboarding-project-checklist'
import { activateAndRevealWorktree } from './worktree-activation'

export async function addNonGitFolderAndActivate(
  getState: () => AppState,
  path: string,
  options?: { runtimeEnvironmentId?: string | null }
): Promise<Repo | null> {
  const hadProjectBeforeAdd = getState().repos.length > 0
  const repo = await getState().registerNonGitFolder(path, options)
  if (!repo) {
    return null
  }

  await markOnboardingProjectAdded('addedFolder')
  await getState().fetchWorktrees(repo.id)
  const folderWorktree = getState().worktreesByRepo[repo.id]?.[0]
  if (!folderWorktree) {
    return repo
  }

  const onboarding = await window.api.onboarding.get().catch(() => null)
  const startup = buildDismissedOnboardingFolderAgentStartup(
    getState().settings,
    onboarding,
    hadProjectBeforeAdd
  )
  activateAndRevealWorktree(folderWorktree.id, {
    sidebarRevealBehavior: 'auto',
    ...(startup ? { startup } : {})
  })
  return repo
}
