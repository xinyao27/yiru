import { buildProjectSourceContextFromRepo } from '@yiru/runtime-protocol/workbench/project-source-context'
import type { GlobalSettings, Project, Repo } from '@yiru/runtime-protocol/workbench/types'
import { useEffect, useState } from 'react'
import { parseGitHubPullRequestLink } from '~renderer/github/links'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import type { AppState } from '~renderer/store/state'

import type { UseComposerStateOptions } from './composer-contract'
import type { WorkspaceCreationTargetResolution } from './project-host-workspace-target'
import { getLinkedWorkItemProvider, type LinkedWorkItemSummary } from './workspace-creation'

type UseComposerGitHubContextOptions = Pick<
  UseComposerStateOptions,
  'initialLinkedWorkItem' | 'initialProjectSourceContext' | 'persistDraft'
> & {
  draft: AppState['newWorkspaceDraft']
  linkedPR: number | null
  linkedWorkItem: LinkedWorkItemSummary | null
  name: string
  projects: Project[]
  repoId: string
  repoSettings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
  selectedRepo: Repo | undefined
  selectedRepoIsGit: boolean
  selectedWorkspaceTarget: WorkspaceCreationTargetResolution
}

export function useComposerGitHubContext(options: UseComposerGitHubContextOptions) {
  const projectSourceContext = resolveProjectSourceContext(options)
  const selectedRepoGitHubSourceContext = resolveSelectedRepoSourceContext(
    options,
    projectSourceContext
  )
  const [slugResult, setSlugResult] = useState<{
    repoId: string
    slug: { owner: string; repo: string } | null
  } | null>(null)
  const selectedRepoPath = options.selectedRepo?.path
  const selectedRepoSlug = slugResult?.repoId === options.repoId ? slugResult.slug : null

  useEffect(() => {
    if (!options.selectedRepo || !selectedRepoPath || !options.selectedRepoIsGit) {
      return
    }
    let isCancelled = false
    const request = callRuntimeOrpc(
      getActiveRuntimeTarget(options.repoSettings),
      (client) => client.github.repoSlug,
      { repo: options.repoId },
      { timeoutMs: 30_000 }
    )
    void request
      .then((slug) => {
        if (!isCancelled) {
          setSlugResult({ repoId: options.repoId, slug })
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setSlugResult({ repoId: options.repoId, slug: null })
        }
      })
    return () => {
      isCancelled = true
    }
  }, [
    options.repoId,
    options.repoSettings,
    options.selectedRepo,
    options.selectedRepoIsGit,
    selectedRepoPath
  ])

  const effectiveLinkedPR = resolveEffectiveLinkedPR(
    options.linkedPR,
    options.name,
    selectedRepoSlug
  )
  return {
    effectiveLinkedPR,
    projectSourceContext,
    selectedRepoGitHubSourceContext,
    selectedRepoPath
  }
}

function resolveProjectSourceContext(options: UseComposerGitHubContextOptions) {
  const target = options.selectedWorkspaceTarget
  if (
    options.persistDraft &&
    options.draft?.projectSourceContext &&
    options.draft.linkedWorkItem?.url === options.linkedWorkItem?.url
  ) {
    return options.draft.projectSourceContext
  }
  if (
    options.initialProjectSourceContext &&
    options.initialLinkedWorkItem?.url === options.linkedWorkItem?.url
  ) {
    return options.initialProjectSourceContext
  }
  if (
    !options.linkedWorkItem ||
    getLinkedWorkItemProvider(options.linkedWorkItem) !== 'github' ||
    !options.selectedRepo ||
    target.status !== 'ready'
  ) {
    return null
  }
  const project = options.projects.find((candidate) => candidate.id === target.target.projectId)
  if (project?.providerIdentity?.provider !== 'github') {
    return null
  }
  return buildProjectSourceContextFromRepo({
    provider: 'github',
    projectId: target.target.projectId,
    repo: options.selectedRepo,
    projectHostSetupId: target.target.projectHostSetupId,
    providerIdentity: project.providerIdentity
  })
}

function resolveSelectedRepoSourceContext(
  options: UseComposerGitHubContextOptions,
  projectSourceContext: ReturnType<typeof resolveProjectSourceContext>
) {
  if (!options.selectedRepo || !options.selectedRepoIsGit) {
    return null
  }
  if (projectSourceContext?.provider === 'github') {
    return projectSourceContext
  }
  const target = options.selectedWorkspaceTarget
  if (target.status === 'ready') {
    const project = options.projects.find((candidate) => candidate.id === target.target.projectId)
    return buildProjectSourceContextFromRepo({
      provider: 'github',
      projectId: target.target.projectId,
      repo: options.selectedRepo,
      projectHostSetupId: target.target.projectHostSetupId,
      providerIdentity:
        project?.providerIdentity?.provider === 'github' ? project.providerIdentity : null
    })
  }
  return buildProjectSourceContextFromRepo({
    provider: 'github',
    projectId: options.selectedRepo.id,
    repo: options.selectedRepo
  })
}

function resolveEffectiveLinkedPR(
  linkedPR: number | null,
  name: string,
  selectedRepoSlug: { owner: string; repo: string } | null
): number | null {
  if (linkedPR !== null) {
    return linkedPR
  }
  const link = parseGitHubPullRequestLink(name)
  if (
    link?.type === 'pr' &&
    selectedRepoSlug &&
    link.slug.owner.toLowerCase() === selectedRepoSlug.owner.toLowerCase() &&
    link.slug.repo.toLowerCase() === selectedRepoSlug.repo.toLowerCase()
  ) {
    return link.number
  }
  return null
}
