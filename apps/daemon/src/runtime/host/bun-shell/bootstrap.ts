import { initializeShellMiniMaxCredentialsService } from '~main/agents/minimax/credentials'
import { initializeShellGitHubService } from '~main/github/github'
import { initializeShellLocalhostWorktreeLabelService } from '~main/ports/localhost-worktree-labels'
import { initializeShellRepoHostService } from '~main/project-groups/repos'
import type { RateLimitService } from '~main/rate-limits/service'
import type { YiruRuntimeService } from '~main/runtime/yiru-runtime'
import type { StatsCollector } from '~main/stats/collector'
import { initTelemetry } from '~main/telemetry/client'
import { initCohortClassifier } from '~main/telemetry/cohort-classifier'
import { initOnboardingCohortClassifier } from '~main/telemetry/onboarding-cohort-classifier'
import { initializeShellTelemetryService } from '~main/telemetry/telemetry'

import type { WorkspaceEventLog } from '../../../events/log'
import type { Store } from '../../../persistence/store'
import type { BunShellPlatformActions } from './platform'

export function initializeBunShellServices(options: {
  platformActions: BunShellPlatformActions
  rateLimits: RateLimitService
  runtime: YiruRuntimeService
  stats: StatsCollector
  store: Store
  workspaceEventLog: WorkspaceEventLog
}): void {
  initializeShellRepoHostService(
    options.store,
    options.runtime,
    {
      pickDirectory: (input) => options.platformActions.pickDirectories(input)
    },
    options.workspaceEventLog
  )
  initializeShellGitHubService(
    {
      // Why: all extension pages share one logical daemon shell owner; connection cleanup is
      // handled by the runtime subscription layer rather than Electron webContents events.
      getLiveRendererIds: () => new Set([0]),
      onRendererDestroyed: () => undefined
    },
    options.store,
    options.stats
  )
  initializeShellMiniMaxCredentialsService(options.rateLimits)
  initializeShellLocalhostWorktreeLabelService(options.store)
  initializeShellTelemetryService(options.store)
  initCohortClassifier(options.store)
  initOnboardingCohortClassifier(options.store)
  initTelemetry(options.store)
}
