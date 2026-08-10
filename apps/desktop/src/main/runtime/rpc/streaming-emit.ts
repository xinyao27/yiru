import type { FeatureInteractionId } from '~shared/feature-interactions'

import type { YiruRuntimeService } from '../yiru-runtime'
import type { RpcEnvelopeMeta, RpcRequest } from './core'
import { successResponse } from './errors'
import { recordRuntimeFeatureInteraction } from './feature-interaction'

// Why: shared by `RpcDispatcher`'s legacy-registered streaming branch and its
// streaming-fallback branch (legacy-dispatch-fallback.ts) — both drain a
// handler that calls `emit` an arbitrary number of times, and both need the
// identical feature-interaction recording + `successResponse` +
// `streaming: true` + `reply` shape. The `Set` is returned alongside `emit`
// (not hidden inside the closure) because the legacy-registered branch also
// records once more against the handler's own resolved return value once the
// stream ends — same de-duplication scope, so it needs the same `Set` rather
// than a second one that would let that final record double-fire.
export function createStreamingEmit(
  runtime: YiruRuntimeService,
  request: RpcRequest,
  meta: RpcEnvelopeMeta,
  reply: (response: string) => void
): [emit: (result: unknown) => void, recorded: Set<FeatureInteractionId>] {
  const recordedFeatureInteractions = new Set<FeatureInteractionId>()
  const emit = (result: unknown): void => {
    recordRuntimeFeatureInteraction(
      runtime,
      request.method,
      result,
      recordedFeatureInteractions,
      request.params
    )
    const response = successResponse(request.id, meta, result)
    response.streaming = true
    reply(JSON.stringify(response))
  }
  return [emit, recordedFeatureInteractions]
}
