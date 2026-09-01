import type { RepoSlug } from '~renderer/github/links'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { useAppStore } from '~renderer/store/state'

export type SmartWorkspaceRepo = ReturnType<typeof useAppStore.getState>['repos'][number]

export function sameRepoSlug(left: RepoSlug, right: RepoSlug): boolean {
  return (
    left.owner.toLowerCase() === right.owner.toLowerCase() &&
    left.repo.toLowerCase() === right.repo.toLowerCase()
  )
}

export async function getRepoSlugCached(
  repo: SmartWorkspaceRepo,
  cache: Map<string, RepoSlug | null>
): Promise<RepoSlug | null> {
  if (cache.has(repo.id)) {
    return cache.get(repo.id) ?? null
  }
  try {
    const slug = await callRuntimeOrpc(
      getActiveRuntimeTarget(useAppStore.getState().settings),
      (client) => client.github.repoSlug,
      { repo: repo.id }
    )
    cache.set(repo.id, slug)
    return slug
  } catch {
    cache.set(repo.id, null)
    return null
  }
}

export async function findRepoForSlug(
  repos: SmartWorkspaceRepo[],
  slug: RepoSlug,
  cache: Map<string, RepoSlug | null>
): Promise<SmartWorkspaceRepo | null> {
  for (const repo of repos) {
    const candidate = await getRepoSlugCached(repo, cache)
    if (candidate && sameRepoSlug(candidate, slug)) {
      return repo
    }
  }
  return null
}
