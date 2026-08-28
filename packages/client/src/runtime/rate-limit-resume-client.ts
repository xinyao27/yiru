import type {
  CodexUsageLimitProbe,
  RateLimitHit,
  RateLimitResumeSchedule
} from '@yiru/runtime-protocol/workbench/rate-limit-resume/types'
import { useAppStore } from '~renderer/store/state'

import { callRuntimeOrpc } from './orpc-client'
import { getActiveRuntimeTarget } from './rpc-client'

function activeTarget() {
  return getActiveRuntimeTarget(useAppStore.getState().settings)
}

export function inspectCodexUsageLimit(probe: CodexUsageLimitProbe): Promise<RateLimitHit | null> {
  return callRuntimeOrpc(activeTarget(), (client) => client.rateLimitResume.inspectCodex, probe)
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
