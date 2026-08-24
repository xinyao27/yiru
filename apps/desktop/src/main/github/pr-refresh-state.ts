import type {
  GitHubPRRefreshAlias,
  GitHubPRRefreshCandidate,
  GitHubPRRefreshReason,
  PRRefreshOutcome
} from '~shared/types'

export type PRRefreshQueueEntry = {
  key: string
  candidate: GitHubPRRefreshCandidate
  aliases: Map<string, GitHubPRRefreshAlias>
  reason: GitHubPRRefreshReason
  priority: number
  dueAt: number
  queuedAt: number
  bypassBackgroundBudget?: boolean
  activeDelayNotified?: boolean
  windowId?: number
}

export type PRRefreshOutcomeObserver = (
  candidate: GitHubPRRefreshCandidate,
  outcome: PRRefreshOutcome
) => void

export type PRRefreshShellAdapter = {
  getLiveRendererIds: () => ReadonlySet<number>
  onRendererDestroyed: (rendererId: number, callback: () => void) => void
}

type PRRefreshCoordinatorState = {
  sequence: number
  queueOrder: number
  draining: boolean
  drainTimer: ReturnType<typeof setTimeout> | null
  queue: Map<string, PRRefreshQueueEntry>
  backgroundStarts: number[]
  activeStartsByScope: Map<string, number[]>
  errorBackoff: Map<string, { failures: number; retryAt: number }>
  lastBackgroundStartAt: number
  visibleByWindow: Map<number, { generation: number; keys: Set<string> }>
  outcomeObserver: PRRefreshOutcomeObserver | null
  shellAdapter: PRRefreshShellAdapter
  diagnostics: {
    enqueued: number
    coalesced: number
    skipped: number
    backgroundPauses: number
  }
}

export const prRefreshState: PRRefreshCoordinatorState = {
  sequence: 0,
  queueOrder: 0,
  draining: false,
  drainTimer: null,
  queue: new Map(),
  backgroundStarts: [],
  activeStartsByScope: new Map(),
  errorBackoff: new Map(),
  lastBackgroundStartAt: 0,
  visibleByWindow: new Map(),
  outcomeObserver: null,
  shellAdapter: {
    getLiveRendererIds: () => new Set(),
    onRendererDestroyed: () => undefined
  },
  diagnostics: {
    enqueued: 0,
    coalesced: 0,
    skipped: 0,
    backgroundPauses: 0
  }
}
