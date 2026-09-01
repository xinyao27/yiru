import type {
  CodexUsageLimitProbe,
  RateLimitHit,
  RateLimitResumeSchedule
} from '@yiru/runtime-protocol/workbench/rate-limit-resume/types'
import type { RateLimitResumeService } from '~main/rate-limit-resume/service'
import type { ShellServicesConnectionId } from '~main/runtime/rpc/orpc/shell-services-identity'

import { RuntimeTerminalResolveProjectRuntimeForWorktree } from '../terminal/resolve-project-runtime-for-worktree'

export abstract class RuntimeCoreSetRateLimitResumeService extends RuntimeTerminalResolveProjectRuntimeForWorktree {
  setRateLimitResumeService(service: RateLimitResumeService): void {
    this.rateLimitResumeService = service
    service.setShellConnectionId(this.shellConnectionId)
  }

  protected requireRateLimitResumeService(): RateLimitResumeService {
    if (!this.rateLimitResumeService) {
      throw new Error('Rate-limit resume service is not configured on this runtime')
    }
    return this.rateLimitResumeService
  }

  inspectCodexUsageLimit(probe: CodexUsageLimitProbe): Promise<RateLimitHit | null> {
    return this.requireRateLimitResumeService().inspectCodex(probe)
  }

  listRateLimitResumes(): RateLimitResumeSchedule[] {
    return this.requireRateLimitResumeService().list()
  }

  scheduleRateLimitResume(hit: RateLimitHit): RateLimitResumeSchedule {
    return this.requireRateLimitResumeService().schedule(hit)
  }

  cancelRateLimitResume(id: string): RateLimitResumeSchedule {
    return this.requireRateLimitResumeService().cancel(id)
  }

  runRateLimitResumeNow(id: string): Promise<RateLimitResumeSchedule> {
    return this.requireRateLimitResumeService().runNow(id)
  }

  markRateLimitResumeFired(id: string): RateLimitResumeSchedule {
    return this.requireRateLimitResumeService().markFired(id)
  }

  markRateLimitResumeFailed(id: string, reason: string): RateLimitResumeSchedule {
    return this.requireRateLimitResumeService().markFailed(id, reason)
  }

  markRateLimitResumeStale(id: string): RateLimitResumeSchedule {
    return this.requireRateLimitResumeService().markStale(id)
  }

  setRateLimitResumeRendererReady(shellConnectionId: ShellServicesConnectionId): boolean {
    return this.requireRateLimitResumeService().setRendererReady(shellConnectionId)
  }

  // ─── Mobile Fit Override Management ─────────────────────────

  // Why: legacy mobile RPC entrypoint. After the state-machine rewrite this
  // is a thin shim that computes a `PtyLayoutTarget` and routes through
  // `enqueueLayout`. Keeps the same observable return shape so older mobile
  // builds continue to work. See docs/mobile-terminal-layout-state-machine.md.
}
