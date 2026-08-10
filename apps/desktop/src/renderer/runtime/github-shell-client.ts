import type { AppStarSource } from '~shared/gh-star-source'
import type {
  GitHubPRRefreshCandidate,
  GitHubPRRefreshEnqueueResult,
  GitHubPRRefreshReason,
  GitHubViewer
} from '~shared/types'

type LocalGitHubPRRefreshRequest = {
  candidate: GitHubPRRefreshCandidate
  reason: GitHubPRRefreshReason
  priority?: number
}

// Why: these operations belong to the window shell, not a selectable runtime
// host. The PR coordinator keys visibility by Electron renderer id, while the
// identity/star calls intentionally use this installation's own `gh` session.
export function getShellGitHubViewer(): Promise<GitHubViewer | null> {
  return window.api.gh.viewer()
}

export function enqueueShellGitHubPRRefresh(
  request: LocalGitHubPRRefreshRequest
): Promise<GitHubPRRefreshEnqueueResult | false> {
  return window.api.gh.enqueuePRRefresh(request)
}

export function reportShellVisibleGitHubPRRefreshCandidates(args: {
  candidates: GitHubPRRefreshCandidate[]
  generation: number
}): Promise<boolean> {
  return window.api.gh.reportVisiblePRRefreshCandidates(args)
}

export function checkShellYiruStarred(): Promise<boolean | null> {
  return window.api.gh.checkYiruStarred()
}

export function starYiruFromShell(source: AppStarSource): Promise<boolean> {
  return window.api.gh.starYiru(source)
}

export function completeShellStarNag(): Promise<void> {
  return window.api.starNag.complete()
}
