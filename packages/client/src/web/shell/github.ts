import type { ShellGitHubApi } from '~renderer/runtime/shell-system-client'

export function createWebShellGitHubApi(): ShellGitHubApi {
  return {
    viewer: () => Promise.resolve(null),
    enqueuePRRefresh: () => Promise.resolve(false),
    reportVisiblePRRefreshCandidates: () => Promise.resolve(false),
    checkYiruStarred: () => Promise.resolve(null),
    starYiru: () => Promise.resolve(false)
  }
}
