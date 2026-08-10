import type {
  RateLimitBannerReport,
  RateLimitHit,
  RateLimitHitInput,
  RateLimitResumeFailureInput,
  RateLimitResumeIdInput,
  RateLimitResumeSchedule
} from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'

export function reportRuntimeRateLimitBanner(
  params: RateLimitBannerReport,
  { runtime }: RpcContext
): RateLimitHit {
  return runtime.reportRateLimitBanner(params)
}

export function listRuntimeRateLimitResumes(
  _params: void,
  { runtime }: RpcContext
): RateLimitResumeSchedule[] {
  return runtime.listRateLimitResumes()
}

export function scheduleRuntimeRateLimitResume(
  params: RateLimitHitInput,
  { runtime }: RpcContext
): RateLimitResumeSchedule {
  return runtime.scheduleRateLimitResume(params)
}

export function cancelRuntimeRateLimitResume(
  params: RateLimitResumeIdInput,
  { runtime }: RpcContext
): RateLimitResumeSchedule {
  return runtime.cancelRateLimitResume(params.id)
}

export async function runRuntimeRateLimitResumeNow(
  params: RateLimitResumeIdInput,
  { runtime }: RpcContext
): Promise<RateLimitResumeSchedule> {
  return await runtime.runRateLimitResumeNow(params.id)
}

export function markRuntimeRateLimitResumeFired(
  params: RateLimitResumeIdInput,
  { runtime }: RpcContext
): RateLimitResumeSchedule {
  return runtime.markRateLimitResumeFired(params.id)
}

export function markRuntimeRateLimitResumeFailed(
  params: RateLimitResumeFailureInput,
  { runtime }: RpcContext
): RateLimitResumeSchedule {
  return runtime.markRateLimitResumeFailed(params.id, params.reason)
}

export function markRuntimeRateLimitResumeStale(
  params: RateLimitResumeIdInput,
  { runtime }: RpcContext
): RateLimitResumeSchedule {
  return runtime.markRateLimitResumeStale(params.id)
}

export function markRuntimeRateLimitResumeRendererReady(
  _params: void,
  { runtime, shellConnectionId }: RpcContext
): void {
  if (!shellConnectionId || !runtime.setRateLimitResumeRendererReady(shellConnectionId)) {
    throw new Error('shell_unavailable')
  }
}

// Why: report/list/schedule/cancel/runNow bridge RateLimitResumeService into
// the runtime contract. `onDispatchRequested`'s push moved to the
// `shellServices.rateLimitResume.dispatch` reverse contract (Phase 5 slice
// S5, see main/rate-limit-resume/service.ts `sendDispatch`), which is why
// runNow is async here now. The four shell acknowledgements use the same
// forward connection so rendererReady can bind dispatch to its authenticated
// reverse shell identity. Phase 6 D-stage — these are now wired
// directly against the contract in orpc/router-direct.ts via
// `wireRuntimeMethod` instead of a `defineMethod` legacy registration; no
// client reaches `rateLimitResume.*` except through the RPC/oRPC transport
// itself, so nothing depends on the legacy registry for this domain.
