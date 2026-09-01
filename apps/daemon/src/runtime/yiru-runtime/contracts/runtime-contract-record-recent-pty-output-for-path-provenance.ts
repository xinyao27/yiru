import type { ProjectExecutionRuntimeResolution } from '@yiru/runtime-protocol/workbench/project-execution-runtime'
import type {
  CodexUsageLimitProbe,
  RateLimitHit,
  RateLimitResumeSchedule
} from '@yiru/runtime-protocol/workbench/rate-limit-resume/types'
import type { GlobalSettings } from '@yiru/runtime-protocol/workbench/types'
import type { RateLimitResumeService } from '~main/rate-limit-resume/service'
import type { ShellServicesConnectionId } from '~main/runtime/rpc/orpc/shell-services-identity'
import type { CommitMessageAgentEnvironmentResolvers } from '~main/text-generation/commit-message-agent-environment'

import { RuntimeContractHasHeadlessTerminalState } from './runtime-contract-has-headless-terminal-state'

export abstract class RuntimeContractRecordRecentPtyOutputForPathProvenance extends RuntimeContractHasHeadlessTerminalState {
  protected abstract recordRecentPtyOutputForPathProvenance(ptyId: string, data: string): void

  abstract resolveTerminalContext(
    handle: string
  ): { worktreeId: string; connectionId: string | null } | null

  abstract resolveProjectRuntimeForWorktree(
    worktreeId: string | null | undefined
  ): ProjectExecutionRuntimeResolution | undefined

  abstract getTerminalOrchestrationCliCommand(handle: string): string

  abstract hasRecentTerminalOutputPath(
    handle: string,
    pathText: string,
    absolutePath: string
  ): boolean

  abstract registerSubscriptionCleanup(
    subscriptionId: string,
    cleanup: () => void | Promise<void>,
    connectionId?: string
  ): void

  abstract cleanupSubscription(subscriptionId: string): void

  abstract retrySubscriptionCleanupAfter(
    subscriptionId: string,
    cleanupOwner: () => void | Promise<void>,
    gate: Promise<void>
  ): void

  abstract cleanupSubscriptionAndWait(subscriptionId: string): Promise<void>

  abstract cleanupSubscriptionsByPrefix(prefix: string): void

  abstract cleanupSubscriptionsForConnection(connectionId: string): void

  abstract getNotificationSettings(): GlobalSettings['notifications'] | undefined

  abstract setCommitMessageAgentEnvironmentResolvers(
    resolvers: CommitMessageAgentEnvironmentResolvers
  ): void

  abstract getCommitMessageAgentEnvironmentResolvers():
    | CommitMessageAgentEnvironmentResolvers
    | undefined

  abstract setRateLimitResumeService(service: RateLimitResumeService): void

  protected abstract requireRateLimitResumeService(): RateLimitResumeService

  abstract inspectCodexUsageLimit(probe: CodexUsageLimitProbe): Promise<RateLimitHit | null>

  abstract listRateLimitResumes(): RateLimitResumeSchedule[]

  abstract scheduleRateLimitResume(hit: RateLimitHit): RateLimitResumeSchedule

  abstract cancelRateLimitResume(id: string): RateLimitResumeSchedule

  abstract runRateLimitResumeNow(id: string): Promise<RateLimitResumeSchedule>

  abstract markRateLimitResumeFired(id: string): RateLimitResumeSchedule

  abstract markRateLimitResumeFailed(id: string, reason: string): RateLimitResumeSchedule

  abstract markRateLimitResumeStale(id: string): RateLimitResumeSchedule

  abstract setRateLimitResumeRendererReady(shellConnectionId: ShellServicesConnectionId): boolean

  abstract resizeForClient(
    ptyId: string,
    mode: 'mobile-fit' | 'restore',
    clientId: string,
    cols?: number,
    rows?: number
  ): Promise<{
    cols: number
    rows: number
    previousCols: number | null
    previousRows: number | null
    mode: 'mobile-fit' | 'desktop-fit'
  }>
}
