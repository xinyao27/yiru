import { useAppStore } from '~renderer/store'
import type {
  RateLimitBannerReport,
  RateLimitHit,
  RateLimitResumeSchedule
} from '~shared/rate-limit-resume/types'

import { callRuntimeOrpc } from './orpc-client'
import { getActiveRuntimeTarget } from './rpc-client'

function activeTarget() {
  return getActiveRuntimeTarget(useAppStore.getState().settings)
}

export function reportRateLimitBanner(report: RateLimitBannerReport): Promise<RateLimitHit> {
  return callRuntimeOrpc(activeTarget(), (client) => client.rateLimitResume.report, report)
}

export function listRateLimitResumes(): Promise<RateLimitResumeSchedule[]> {
  return callRuntimeOrpc(activeTarget(), (client) => client.rateLimitResume.list, undefined)
}

export function scheduleRuntimeRateLimitResume(
  hit: RateLimitHit
): Promise<RateLimitResumeSchedule> {
  return callRuntimeOrpc(activeTarget(), (client) => client.rateLimitResume.schedule, hit)
}

export function cancelRuntimeRateLimitResume(id: string): Promise<RateLimitResumeSchedule> {
  return callRuntimeOrpc(activeTarget(), (client) => client.rateLimitResume.cancel, { id })
}

export function runRuntimeRateLimitResumeNow(id: string): Promise<RateLimitResumeSchedule> {
  return callRuntimeOrpc(activeTarget(), (client) => client.rateLimitResume.runNow, { id })
}

export function markRateLimitResumeFired(id: string): Promise<RateLimitResumeSchedule> {
  return callRuntimeOrpc(activeTarget(), (client) => client.rateLimitResume.markFired, { id })
}

export function markRateLimitResumeFailed(
  id: string,
  reason: string
): Promise<RateLimitResumeSchedule> {
  return callRuntimeOrpc(activeTarget(), (client) => client.rateLimitResume.markFailed, {
    id,
    reason
  })
}

export function markRateLimitResumeStale(id: string): Promise<RateLimitResumeSchedule> {
  return callRuntimeOrpc(activeTarget(), (client) => client.rateLimitResume.markStale, { id })
}

export function notifyRateLimitResumeRendererReady(): Promise<void> {
  return callRuntimeOrpc(
    activeTarget(),
    (client) => client.rateLimitResume.rendererReady,
    undefined
  )
}
